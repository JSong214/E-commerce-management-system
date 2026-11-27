import csv
from io import BytesIO, StringIO

from openpyxl import load_workbook

from .helpers import create_shop, ingest, jd_row, pdd_row


def test_effective_sales_kpis_date_basis_traceability_and_export(client):
    jd = create_shop(client)
    order = "00090000000001234567"
    _, batch = ingest(client, [
        jd_row(order, 商品名称="合成外机", 商家SKUID="OUT", 京东价="0", 商家应收="1500", 应付金额="0"),
        jd_row(order, 商品名称="合成内机", 商家SKUID="IN", 京东价="1500", 商家应收="1500", 应付金额="1999", 订购数量="2"),
        jd_row("SYNTH-JD-CLOSED", 商品名称="合成关闭商品", 订单状态="已取消", 应付金额="1999"),
    ], default_shop_id=jd["id"])
    tb = create_shop(client, "taobao", "合成淘宝店")
    ingest(client, [{
        "主订单编号": "SYNTH-TB-PARENT", "子订单编号": "SYNTH-TB-LINE", "商品标题": "合成商品",
        "订单创建时间": "2026-11-23", "订单付款时间": "2026-11-24", "购买数量": "1",
        "买家实付金额": "", "订单状态": "已完成",
    }], data_source="taobao", default_shop_id=tb["id"])

    url = "/api/v1/effective-sales"
    filters = {"start_date": "2026-11-24", "end_date": "2026-11-24"}
    response = client.get(url, params=filters)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["total"] == 1
    assert result["kpi"] == {
        "total_records": 3, "valid_records": 1, "valid_sales_quantity": 2,
        "valid_sales_amount": "1999.00", "excluded_records": 1,
        "needs_review_records": 1, "pending_model_records": 3,
    }
    assert client.get(url, params={**filters, "time_basis": "order_time"}).json()["total"] == 0
    assert client.get(url, params={"time_basis": "ship_time"}).status_code == 422
    scoped = client.get(url, params={"batch_id": batch["batch_id"], "eligibility_status": "all"}).json()
    assert scoped["total"] == scoped["kpi"]["total_records"] == 2
    [record] = result["items"]
    detail = client.get(f"{url}/{record['id']}").json()
    assert {line["product_name"] for line in detail["source_order_lines"]} == {"合成内机", "合成外机"}
    assert [line["payable_amount"] for line in detail["source_order_lines"]] == ["1999.00", "0.00"]

    response = client.get(f"{url}/export", params=filters)
    assert response.status_code == 200, response.text
    workbook = load_workbook(BytesIO(response.content))
    try:
        assert workbook.active["A1"].value == "订单号"
        exported = workbook.active["A2"]
        assert (exported.value, exported.data_type, exported.number_format) == (order, "s", "@")
        assert workbook.active.max_row == 2
    finally:
        workbook.close()

    response = client.get(f"{url}/export", params={**filters, "format": "csv"})
    assert response.status_code == 200, response.text
    assert response.content.startswith(b"\xef\xbb\xbf")
    header, exported = csv.reader(StringIO(response.content.decode("utf-8-sig")))
    assert header[0] == "订单号"
    assert exported[0] == order


def test_grouped_model_review_learns_shop_mapping_and_resolves_matching_pending_lines(client):
    shop = create_shop(client, "pdd", "合成拼多多甲店")
    other = create_shop(client, "pdd", "合成拼多多乙店")
    model_ids = []
    for model_name in ("SYNTH-MODEL-ONE", "SYNTH-MODEL-TWO"):
        response = client.post("/api/v1/products/models", json={
            "standard_model": model_name, "category": "空调", "brand": "合成品牌", "business_segment": "家电",
        })
        assert response.status_code == 201, response.text
        model_id = response.json()["id"]
        model_ids.append(model_id)
        mapping = client.post("/api/v1/products/channel-mappings", json={
            "model_id": model_id, "channel_type": "pdd_sku_id", "external_id": "SYNTH-PDD",
        })
        assert mapping.status_code == 201, mapping.text

    options = {"data_source": "pdd", "default_shop_id": shop["id"]}
    validation, batch = ingest(client, [
        pdd_row("261121-SYNTH-ONE"), pdd_row("261121-SYNTH-TWO"),
        pdd_row("261121-SYNTH-THREE", 商品="合成商品旧标题"),
    ], **options)
    assert validation["v2_summary"]["model_ambiguous"] == 3
    assert len(validation["ambiguous_model_preview"][0]["candidates"]) == 2
    assert batch["pending_model_rows"] == 3
    ingest(client, [pdd_row("261121-SYNTH-OTHER")], data_source="pdd", default_shop_id=other["id"])

    url = "/api/v1/model-review"
    pending = client.get(f"{url}/pending", params={"shop_id": shop["id"], "page_size": 1})
    assert pending.status_code == 200, pending.text
    queue = pending.json()
    assert (queue["total_groups"], queue["total_pending_records"], queue["ambiguous_records"]) == (2, 3, 3)
    [group] = queue["groups"]
    assert (group["affected_record_count"], group["valid_record_count"], group["total_sales_amount"]) == (2, 2, "2400.00")
    assert {model["model_id"] for model in group["candidates"]} == set(model_ids)
    response = client.post(f"{url}/resolve", json={
        "record_ids": group["sample_record_ids"][:1], "model_id": model_ids[0],
        "save_as_mapping_rule": True,
    })
    assert response.status_code == 200, response.text
    saved = response.json()
    assert (saved["resolved_effective_records"], saved["resolved_order_lines"], saved["retroactively_resolved_records"]) == (3, 3, 2)
    mappings = client.get("/api/v1/products/channel-mappings", params={"external_id": "SYNTH-PDD"}).json()
    learned = next(item for item in mappings["items"] if item["id"] == saved["saved_mapping_id"])
    assert (learned["shop_scope_id"], learned["match_source"]) == (shop["id"], "learned_from_review")
    confirmed = client.get("/api/v1/effective-sales", params={"model_match_status": "manual_confirmed"}).json()
    assert confirmed["total"] == 3
    assert {row["model_id"] for row in confirmed["items"]} == {model_ids[0]}

    validation, _ = ingest(client, [pdd_row("261121-SYNTH-NEW")], **options)
    assert validation["v2_summary"]["model_matched"] == 1
    [group] = client.get(f"{url}/pending").json()["groups"]
    assert group["shop_id"] == other["id"]
    group_filter = {
        key: group[key] for key in (
            "data_source", "shop_id", "channel_type", "external_id",
            "secondary_external_id", "raw_product_summary",
        )
    }
    response = client.post(f"{url}/resolve", json={"group_filter": group_filter, "model_id": model_ids[1]})
    assert response.status_code == 200, response.text
    assert response.json() == {
        "resolved_effective_records": 1, "resolved_order_lines": 1, "saved_mapping_id": None,
        "retroactively_resolved_records": 0,
    }
    assert client.get(f"{url}/pending").json()["total_pending_records"] == 0
    invalid = client.post(f"{url}/resolve", json={"model_id": model_ids[1]})
    assert invalid.status_code == 422
    assert invalid.json()["error"]["code"] == "INVALID_REVIEW_TARGET"

    for index, target_shop in enumerate((shop, other)):
        ingest(client, [pdd_row(f"261121-SYNTH-UNKNOWN-{index}", 商品id="SYNTH-UNMAPPED")],
               data_source="pdd", default_shop_id=target_shop["id"])
    [group, _] = client.get(f"{url}/pending", params={"status": "unmatched"}).json()["groups"]
    response = client.post(f"{url}/resolve", json={
        "record_ids": group["sample_record_ids"], "model_id": model_ids[1],
        "save_as_mapping_rule": True,
    })
    assert response.status_code == 200, response.text
    resolved = response.json()
    assert resolved["resolved_effective_records"] == 2
    assert resolved["retroactively_resolved_records"] == 1
    [learned] = client.get(
        "/api/v1/products/channel-mappings", params={"external_id": "SYNTH-UNMAPPED"}
    ).json()["items"]
    assert learned["shop_scope_id"] == 0
