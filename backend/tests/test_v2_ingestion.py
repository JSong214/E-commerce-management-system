import json

from sqlalchemy import create_engine, text

from .helpers import commit, create_shop, ingest, jd_row, pdd_row, upload_csv, validate


def effective_records(mysql_url):
    engine = create_engine(mysql_url)
    try:
        with engine.connect() as conn:
            return [
                dict(row)
                for row in conn.execute(text("SELECT * FROM effective_sales_records ORDER BY business_order_id, record_key")).mappings()
            ]
    finally:
        engine.dispose()


def erp_row(order_id, **values):
    return {
        "店铺名称": "合成订单店", "线上订单号": order_id, "内部订单号": "SYNTH-ERP",
        "线上子订单编号": "", "标准商品名": "SYNTH-MODEL", "商品名称": "合成商品", "买家实付金额": "20",
        "卖家实收金额": "20", "是否赠品": "否", "下单时间": "2026-11-20 12:00:00",
        "付款日期": "2026-11-20 12:00:00", "数量": "3", "状态": "取消", "省份": "合成省",
        "城市": "合成市", "店铺款式编码": "SYNTH-ERP-ID", **values,
    }


def test_erp_enrichment_is_independent_of_upload_order_and_rolls_back(client, mysql_url):
    shop = create_shop(client, "pdd", "合成订单店")
    order_ids = ("261121-SYNTH-FIRST", "261121-SYNTH-SECOND")
    options = {"data_source": "pdd", "default_shop_id": shop["id"]}
    direct_first = ingest(client, [pdd_row(order_ids[0])], **options)[1]
    _, erp_second = ingest(client, [erp_row(order_ids[0])], data_source="jushuitan")
    _, erp_first = ingest(client, [erp_row(order_ids[1])], data_source="jushuitan")
    _, direct_second = ingest(client, [pdd_row(order_ids[1])], **options)
    records = effective_records(mysql_url)
    assert len(records) == 2
    fields = (
        "source_role", "primary_data_source", "record_key", "sales_amount", "sales_quantity",
        "business_time", "eligibility_status", "raw_order_status", "province", "city",
        "erp_enriched", "model_match_status", "notices",
    )
    assert {key: records[0][key] for key in fields} == {key: records[1][key] for key in fields}
    assert str(records[0]["sales_amount"]) == "1200.00"
    assert records[0]["sales_quantity"] == 1
    assert records[0]["province"] == "合成省"
    assert records[0]["raw_order_status"] == "已完成"
    assert json.loads(records[0]["notices"]) == ["ERP状态为取消，保留直出判定"]
    assert erp_second["enriched_rows"] == 1
    assert direct_second["effective_rows"] == 1
    assert client.post(f"/api/v1/batches/{erp_second['batch_id']}/rollback").status_code == 200
    assert effective_records(mysql_url)[0]["province"] is None
    assert client.post(f"/api/v1/batches/{direct_second['batch_id']}/rollback").status_code == 200
    assert effective_records(mysql_url)[1]["exclusion_reason"] == "ERP_NOT_ENABLED"
    assert client.post(f"/api/v1/batches/{erp_first['batch_id']}/rollback").status_code == 200
    assert client.post(f"/api/v1/batches/{direct_first['batch_id']}/rollback").status_code == 200
    assert effective_records(mysql_url) == []


def test_exact_erp_match_respects_direct_fields_and_order_fallback_requires_agreement(
    client, mysql_url
):
    shop = create_shop(client, "pdd", "合成订单店")
    order = "261121-SYNTH-EXACT"
    model = client.post("/api/v1/products/models", json={
        "standard_model": "SYNTH-MODEL", "business_segment": "家电",
        "category": "空调", "brand": "合成品牌",
    })
    assert model.status_code == 201, model.text
    ingest(client, [
        pdd_row(order, 省="直出省"),
        pdd_row(order, 商品id="SYNTH-PDD-2"),
    ], data_source="pdd", default_shop_id=shop["id"])
    ingest(client, [
        erp_row(order, 店铺款式编码="SYNTH-PDD", 城市="精确匹配市"),
        erp_row(order, 店铺款式编码="SYNTH-NO-MATCH", 城市="另一城市"),
    ], data_source="jushuitan")
    records = {row["record_key"]: row for row in effective_records(mysql_url)}
    exact_line = records["SYNTH-PDD#1"]
    second_line = records["SYNTH-PDD-2#1"]
    assert (exact_line["province"], exact_line["city"]) == ("直出省", "精确匹配市")
    assert (second_line["province"], second_line["city"]) == ("合成省", None)
    assert exact_line["raw_order_status"] == second_line["raw_order_status"] == "已完成"
    assert exact_line["model_id"] == model.json()["id"]
    assert second_line["model_match_status"] == "unmatched"


def test_jd_merges_whole_unit_and_matches_component_mapping_value(client, mysql_url):
    shop = create_shop(client)
    model = client.post("/api/v1/products/models", json={
        "standard_model": "SYNTH-JD", "business_segment": "家电", "category": "空调", "brand": "合成品牌",
    }).json()
    response = client.post(f"/api/v1/products/models/{model['id']}/components", json={
        "component_model": "SYNTH-IN", "unit_type": "indoor", "mapping_value": "KFR-35G/SYNTHⅢ",
    })
    assert response.status_code == 201, response.text
    order = "00000000000001234567"
    validated, batch = ingest(client, [
        jd_row(order, 商品名称="室外机", 商品ID="SYNTH-OUT", 商家SKUID="OUT", 京东价="0", 商家应收="1800", 应付金额="0"),
        jd_row(order, 商品名称="合成室内机 KFR-35G/SYNTH_x2162_", 商家SKUID="IN", 京东价="1800", 商家应收="1800", 应付金额="2499"),
    ], default_shop_id=shop["id"])
    assert validated["v2_summary"]["jd_merged_orders"] == 1
    assert batch["inserted_rows"] == 2
    [record] = effective_records(mysql_url)
    assert record["record_key"] == "whole_unit"
    assert record["model_id"] == model["id"]
    assert record["model_match_method"] == "component_model"
    assert str(record["sales_amount"]) == "2499.00"
    assert record["sales_quantity"] == 1
    assert len(json.loads(record["source_order_line_ids"])) == 2


def test_taobao_differentiates_buyer_amount_subsidy_and_missing_amount(client, mysql_url):
    shop = create_shop(client, "taobao")
    base = {
        "主订单编号": "TB-SYNTH", "订单创建时间": "2026-11-21", "订单付款时间": "2026-11-21",
        "商品标题": "合成空调", "购买数量": "2", "买家应付货款": "1400", "订单状态": "已完成",
    }
    rows = [
        {**base, "子订单编号": "TB-SYNTH-1", "买家实付金额": "800"},
        {**base, "子订单编号": "TB-SYNTH-2", "买家实付金额": "0", "百亿补贴超链订单信息": "供货单价:¥600.00"},
        {**base, "子订单编号": "TB-SYNTH-3", "买家实付金额": "399.99"},
        {**base, "子订单编号": "TB-SYNTH-4", "买家实付金额": ""},
    ]
    options = {"data_source": "taobao", "default_shop_id": shop["id"]}
    validated, _ = ingest(client, rows, **options)
    assert validated["summary"]["error_rows"] == 0
    assert validated["v2_summary"]["estimated_effective_valid"] == 2
    paid, subsidy, low, missing = effective_records(mysql_url)
    assert paid["amount_source"] == "taobao_buyer_paid"
    assert json.loads(paid["notices"]) == ["买家实付低于1000元(800.00)"]
    assert subsidy["amount_source"] == "taobao_bybt_supply"
    assert str(subsidy["sales_amount"]) == "1200.00"
    assert low["exclusion_reason"] == "BELOW_MIN_AMOUNT"
    assert (missing["eligibility_status"], missing["exclusion_reason"]) == ("needs_review", "MISSING_AMOUNT")
    for rule in ("min_sales_amount", "taobao_subsidy_fallback"):
        response = client.put(
            f"/api/v1/sales-rules/{rule}", json={"enabled": False, "config_json": {}}
        )
        assert response.status_code == 200, response.text
    _, batch = ingest(client, rows, **options)
    assert batch["effective_rows"] == 2
    _, subsidy, low, _ = effective_records(mysql_url)
    assert subsidy["eligibility_status"] == "needs_review"
    assert low["eligibility_status"] == "valid"


def test_tmall_lp_alias_and_inactive_shop_and_3c_fallback(client, mysql_url):
    url = "/api/v1/shops"
    shop = client.post(url, json={
        "shop_name": "天猫优品", "platform": "tmall", "shop_status": "dormant",
    }).json()
    assert client.post(f"{url}/{shop['id']}/aliases", json={"alias_name": "合成分销商"}).status_code == 201
    row = {
        "系统单号": "SYNTH-SYSTEM", "外部订单号": "SYNTH-EXTERNAL", "发货LP号": "LP-SYNTH-1",
        "分销商店铺名称": "合成分销商", "实收金额": "680", "订货数量": "1",
        "商品名称": "合成天猫商品", "货品编码": "SYNTH-TM", "状态": "已签收",
        "退款": "否", "下单时间": "2026-11-21", "支付时间": "2026-11-21",
    }
    preview = upload_csv(client, [row]).json()
    assert preview["matched_template"]["code"] == "tmall_erp_a"
    assert preview["recommended_source_role"] == "direct_sales"
    validated = validate(client, preview, data_source="tmall").json()
    assert validated["inactive_shops"] == []
    assert commit(client, validated).status_code == 201
    [record] = effective_records(mysql_url)
    assert (record["shop_name"], record["business_order_id"], record["amount_source"]) == (
        "天猫优品", "LP-SYNTH-1", "tmall_actual_received"
    )
    assert client.put(f"{url}/{shop['id']}", json={
        "shop_name": "天猫优品", "platform": "tmall", "shop_status": "inactive",
    }).status_code == 200
    response = validate(client, upload_csv(client, [row]).json(), data_source="tmall")
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "SHOP_INACTIVE"
    replacement = create_shop(client, "tmall", "合成新分销店")
    alias = client.post(f"{url}/{replacement['id']}/aliases", json={"alias_name": "天猫优品"})
    assert alias.status_code == 201, alias.text
    preview = upload_csv(client, [{**row, "分销商店铺名称": "天猫优品"}]).json()
    validation = validate(client, preview, data_source="tmall")
    assert validation.status_code == 200, validation.text
    assert validation.json()["cleaned_sample_rows"][0]["shop_id"] == replacement["id"]

    shop = client.post(url, json={
        "shop_name": "合成3C店", "platform": "other", "erp_sales_enabled": True,
        "zero_received_use_paid": True, "preserve_full_product_name": True,
    }).json()
    full_name = "合成手机 128GB 蓝色"
    model = client.post("/api/v1/products/models", json={
        "standard_model": full_name, "business_segment": "3C", "category": "手机",
        "brand": "苹果手机", "is_3c_full_name": True,
    }).json()
    base = erp_row("MANUAL-SYNTH-1", 店铺名称=shop["shop_name"], 商品名称=full_name, 卖家实收金额="0",
                   付款日期="", 已付金额="780.50", 品牌="苹果手机", 状态="已完成", 退款状态="未申请退款")
    ingest(client, [base, {**base, "线上订单号": "MANUAL-SYNTH-2", "订单类型": "补发订单"}],
           data_source="manual", source_role="erp_independent_sales")
    records = {row["business_order_id"]: row for row in effective_records(mysql_url)}
    valid = records["MANUAL-SYNTH-1"]
    assert valid["brand"] == "苹果"
    assert valid["model_id"] == model["id"]
    assert (str(valid["sales_amount"]), valid["amount_source"]) == ("780.50", "erp_paid_fallback")
    assert valid["business_time"] == valid["order_time"]
    assert records["MANUAL-SYNTH-2"]["exclusion_reason"] == "RESHIP_ORDER"
    response = client.put(
        "/api/v1/sales-rules/zero_received_use_paid",
        json={"enabled": False, "config_json": {"brand_aliases": {"苹果手机": "苹果"}}},
    )
    assert response.status_code == 200, response.text
    ingest(client, [base], data_source="manual", source_role="erp_independent_sales")
    record = next(row for row in effective_records(mysql_url) if row["business_order_id"] == "MANUAL-SYNTH-1")
    assert (str(record["sales_amount"]), record["exclusion_reason"]) == ("0.00", "BELOW_MIN_AMOUNT")
