import csv
from io import BytesIO, StringIO

from openpyxl import load_workbook

from .helpers import commit, create_shop, jd_row, prepare_import


def test_order_lines_filter_by_time_platform_keyword_and_batch(client):
    shop_id = create_shop(client)["id"]
    validated = prepare_import(
        client,
        [
            jd_row("9000000000012345", 商家SKUID="SKU_X", 商品名称="测试商品"),
            jd_row("9000000000012346", 商家SKUID="SKUYX"),
        ],
        default_shop_id=shop_id,
    )
    imported = commit(client, validated)
    assert imported.status_code == 201, imported.text
    batch_id = imported.json()["batch_id"]

    response = client.get(
        "/api/v1/order-lines",
        params=[
            ("platform", "jd,tmall"),
            ("platform", "taobao"),
            ("shop_id", shop_id),
            ("batch_id", batch_id),
            ("data_source", "jd"),
            ("normalized_status", "completed"),
            ("date_from", "2026-11-23T01:00:00Z"),
            ("date_to", "2026-11-23"),
            ("keyword", "SKU_"),
            ("page_size", 1),
        ],
    )
    assert response.status_code == 200, response.text
    page = response.json()
    assert (page["total"], page["page"], page["page_size"]) == (1, 1, 1)
    (line,) = page["items"]
    assert line["platform_order_id"] == "9000000000012345"
    assert line["paid_amount"] == "10.00"
    assert line["is_valid_for_gmv"] is True
    assert line["raw_extra"] == {"应付金额": "11.00"}

    response = client.get(
        "/api/v1/order-lines",
        params={
            "time_basis": "pay_time",
            "date_from": "2026-11-23",
            "date_to": "2026-11-23",
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["total"] == 0
    rejected = client.get("/api/v1/order-lines?time_basis=ship_time")
    assert rejected.status_code == 422
    assert rejected.json()["error"]["code"] == "VALIDATION_ERROR"
    assert client.get("/api/v1/order-lines?page_size=201").status_code == 422


def test_order_exports_preserve_text_ids_and_write_a_utf8_bom(client):
    shop_id = create_shop(client)["id"]
    ids = {
        "platform_order_id": "0003691453007789",
        "sub_order_id": "0012345678901234",
        "product_id": "0000000000000042",
        "sku_code": "0000000000000789",
    }
    rows = [
        jd_row(
            ids["platform_order_id"],
            合成子单号=ids["sub_order_id"],
            商品ID=ids["product_id"],
            商家SKUID=ids["sku_code"],
            商家备注="=1+1",
            商品名称="合成产品",
        ),
        jd_row("9000000000012346", 付款确认时间="2026-11-25"),
    ]
    validated = prepare_import(
        client,
        rows,
        default_shop_id=shop_id,
        column_mapping={"sub_order_id": "合成子单号"},
    )
    imported = commit(client, validated)
    assert imported.status_code == 201, imported.text
    filters = {
        "time_basis": "pay_time",
        "date_from": "2026-11-24",
        "date_to": "2026-11-24",
        "platform": "jd",
    }
    url = "/api/v1/order-lines/export"
    response = client.post(url, json={**filters, "format": "xlsx"})
    assert response.status_code == 200, response.text
    assert "attachment;" in response.headers["content-disposition"]
    sheet = load_workbook(BytesIO(response.content)).active
    assert sheet.max_row == 2
    columns = {cell.value: cell.column for cell in sheet[1]}
    for name, value in ids.items():
        cell = sheet.cell(2, columns[name])
        assert (cell.value, cell.number_format, cell.data_type) == (value, "@", "s")
    assert sheet.cell(2, columns["seller_note"]).data_type == "s"

    response = client.post(url, json={**filters, "format": "csv"})
    assert response.status_code == 200, response.text
    assert response.content.startswith(bytes.fromhex("EF BB BF"))
    (row,) = csv.DictReader(StringIO(response.content.decode("utf-8-sig")))
    assert {name: row[name] for name in ids} == ids
    assert row["product_name"] == "合成产品"
    assert (
        client.post(
            url, json={**filters, "time_basis": "ship_time", "format": "csv"}
        ).status_code
        == 422
    )
