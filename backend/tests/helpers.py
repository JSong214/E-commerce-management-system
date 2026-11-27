import csv
from io import StringIO


def upload_csv(client, rows, *, encoding="utf-8", filename="orders.csv", headers=None):
    output = StringIO(newline="")
    if headers is None:
        headers = list(dict.fromkeys(key for row in rows for key in row))
    writer = csv.DictWriter(output, fieldnames=headers)
    writer.writeheader()
    writer.writerows(rows)
    return client.post(
        "/api/v1/imports/parse-preview",
        files={
            "file": (filename, output.getvalue().encode(encoding), "text/csv"),
        },
    )


def create_shop(client, platform="jd", name="合成店铺"):
    response = client.post(
        "/api/v1/shops", json={"shop_name": name, "platform": platform}
    )
    assert response.status_code == 201, response.text
    return response.json()


def validate(client, preview, *, data_source="jd", default_shop_id=None, **options):
    return client.post(
        "/api/v1/imports/validate",
        json={
            "staged_file_id": preview["staged_file_id"],
            "data_source": data_source,
            "default_shop_id": default_shop_id,
            **options,
        },
    )


def jd_row(order_id, **values):
    return {
        "订单号": order_id,
        "京东价": "10.00",
        "商家应收": "10.00",
        "商家SKUID": "SKU",
        "应付金额": "11.00",
        "下单时间": "2026-11-23 09:00:00",
        "付款确认时间": "2026-11-24",
        "商品名称": "合成商品",
        "商品ID": "PRODUCT",
        "订购数量": "1",
        "订单状态": "已完成",
        **values,
    }


def prepare_import(client, rows, **options):
    preview = upload_csv(client, rows)
    assert preview.status_code == 200, preview.text
    response = validate(client, preview.json(), **options)
    assert response.status_code == 200, response.text
    return response.json()


def commit(client, validated, **options):
    return client.post(
        "/api/v1/imports/commit",
        json={
            "validation_id": validated["validation_id"],
            **options,
        },
    )


def ingest(client, rows, **options):
    validated = prepare_import(client, rows, **options)
    result = commit(client, validated)
    assert result.status_code == 201, result.text
    return validated, result.json()


def pdd_row(order_id, **values):
    return {
        "订单号": order_id,
        "订单成交时间": "2026-11-21 12:00:00",
        "订单状态": "已完成",
        "商品id": "SYNTH-PDD",
        "商品": "合成空调",
        "商品数量(件)": "1",
        "商品总价(元)": "1200",
        "用户实付金额(元)": "1000",
        "商家实收金额(元)": "1200",
        "商家编码-规格维度": "SYNTH-SKU",
        **values,
    }
