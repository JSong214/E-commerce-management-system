from io import BytesIO

from openpyxl import Workbook


def upload_master(client, kind, sheets):
    workbook = Workbook()
    workbook.remove(workbook.active)
    for title, rows in sheets.items():
        sheet = workbook.create_sheet(title)
        for row in rows:
            sheet.append(row)
    stream = BytesIO()
    workbook.save(stream)
    return client.post(
        f"/api/v1/master-data/{kind}/import-excel",
        files={"file": ("synthetic-master.xlsx", stream.getvalue())},
    )


def test_shop_workbook_import_keeps_aliases_and_shop_switches(client):
    workbook = {
        "运营方与平台": [("运营方", "平台"), ("自运营", "焕新生活"), ("代运营", "天猫")],
        "主体": [("主体",), ("合成主体",)],
        "销售模式": [("销售模式",), ("混合",)],
        "店铺状态": [("状态",), ("启用",), ("休眠",), ("未启用",)],
        "店铺信息": [
            ("店铺名称", "运营", "平台", "主体", "销售模式", "状态"),
            ("合成新店", "自运营", "焕新生活", "合成主体", "混合", "启用"),
            ("合成旧店", "代运营", "天猫", "合成主体", "", "休眠"),
            ("合成停用店", "自运营", "焕新生活", "合成主体", "", "未启用"),
        ],
    }
    url = "/api/v1/shops"
    old_shop = client.post(
        url, json={"shop_name": "合成旧店", "platform": "tmall", "erp_sales_enabled": True}
    ).json()
    alias_url = f"{url}/{old_shop['id']}/aliases"
    response = client.post(alias_url, json={"alias_name": "合成历史店名"})
    assert response.status_code == 201, response.text
    alias_id = response.json()["id"]
    duplicate = client.post(alias_url, json={"alias_name": "合成历史店名"})
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "ALIAS_ALREADY_EXISTS"

    response = upload_master(client, "shops", workbook)
    assert response.status_code == 200, response.text
    assert response.json() == {
        "total_rows": 3, "inserted": 2, "updated": 1, "skipped": 0, "warnings": []
    }
    second = upload_master(client, "shops", workbook).json()
    assert (second["inserted"], second["updated"], second["skipped"]) == (0, 0, 3)
    listing = client.get(url, params={"shop_status": "dormant", "erp_sales_enabled": True}).json()
    assert listing["summary"] == {
        "total": 3, "active": 1, "dormant": 1, "inactive": 1, "erp_sales_enabled": 1
    }
    assert len(listing["items"]) == 1
    shop = listing["items"][0]
    assert shop["operator_type"] == "agency_operated"
    assert shop["is_active"] is False
    assert shop["aliases"][0]["id"] == alias_id
    assert client.get(url, params={"platform": "huanxin"}).json()["items"][0]["sales_mode"] == "hybrid"
    assert client.delete(f"{url}/aliases/{alias_id}").status_code == 204


def test_product_workbook_unpivots_all_ids_and_preserves_conflicts(client):
    workbook = {
        "产品分类": [("业务板块", "品类", "品牌"), ("家电", "空调", "合成品牌")],
        "产品型号": [("品类", "品牌", "型号"), ("空调", "合成品牌", "SYNTH-A"), ("空调", "合成品牌", "SYNTH-B")],
        "产品内外机": [
            ("型号", "内外机型号", "内外机分类", "映射值"),
            ("SYNTH-A", "SYNTH-A-IN", "内机", "ALIAS-A-IN"),
            ("SYNTH-A", "SYNTH-A-OUT", "外机", None),
        ],
        "产品ID匹配": [
            ("型号", "jst_i_id", "jst_sku_id", "pdd_sku_id", "tb_sku_id", "tm_sku-id", "dy_sku_id", "jd_sku_id"),
            ("SYNTH-A", "STYLE-A", "SKU-A", "SHARED", "TB-A", "00000000001234567890", "DY-A", "JD-A"),
            ("SYNTH-B", None, None, "SHARED", None, None, None, None),
        ],
    }
    response = upload_master(client, "products", workbook)
    assert response.status_code == 200, response.text
    imported = response.json()
    assert imported["channel_mappings"] == {"inserted": 8, "updated": 0}
    assert imported["ambiguous_conflicts"] == [
        {"channel_type": "pdd_sku_id", "external_id": "SHARED", "models": ["SYNTH-A", "SYNTH-B"]}
    ]
    assert imported["warnings"] == []
    second = upload_master(client, "products", workbook).json()
    assert second["channel_mappings"] == {"inserted": 0, "updated": 0}
    url = "/api/v1/products"
    models = client.get(f"{url}/models", params={"only_ambiguous": True}).json()
    assert models["total"] == 2
    assert models["summary"]["ambiguous_id_groups"] == 1
    model = next(item for item in models["items"] if item["standard_model"] == "SYNTH-A")
    assert model["components"][0]["mapping_value"] == "ALIAS-A-IN"
    assert model["components"][1]["unit_type"] == "outdoor"
    assert model["mapping_count"] == 7

    mappings = client.get(f"{url}/channel-mappings", params={"only_ambiguous": True}).json()
    assert mappings["total"] == 2
    assert len(mappings["ambiguous_groups"][0]["candidate_models"]) == 2
    mappings = client.get(f"{url}/channel-mappings", params={"channel_type": "tm_sku_id"}).json()
    assert mappings["items"][0]["external_id"] == "00000000001234567890"
    for path, body, error in (
        ("models", model, "MODEL_ALREADY_EXISTS"),
        (f"models/{model['id']}/components", model["components"][0], "COMPONENT_ALREADY_EXISTS"),
    ):
        duplicate = client.post(f"{url}/{path}", json=body)
        assert duplicate.status_code == 409, duplicate.text
        assert duplicate.json()["error"]["code"] == error


def test_master_excel_rejects_missing_sheets_or_headers(client):
    for kind, sheets in (
        ("shops", {"店铺信息": [("平台", "状态"), ("京东", "启用")]}),
        ("products", {"产品分类": [("业务板块", "品类", "品牌")]}),
    ):
        response = upload_master(client, kind, sheets)
        assert response.status_code == 422, response.text
        assert response.json()["error"]["code"] == "INVALID_MASTER_EXCEL"


def test_sales_rules_can_be_updated_by_key(client):
    url = "/api/v1/sales-rules"
    response = client.get(url)
    assert response.status_code == 200
    rule = next(rule for rule in response.json()["items"] if rule["rule_key"] == "min_sales_amount")
    assert rule["config_json"]["threshold"] == "400.00"
    body = {"enabled": False, "config_json": {"threshold": "500.00"}}
    response = client.put(f"{url}/min_sales_amount", json=body)
    assert response.status_code == 200
    assert response.json()["enabled"] is False
    assert response.json()["config_json"] == body["config_json"]
    missing = client.put(f"{url}/unknown", json=body)
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "RULE_NOT_FOUND"
