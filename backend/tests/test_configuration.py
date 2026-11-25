def test_template_can_be_cloned_edited_and_deleted_but_builtin_is_readonly(client):
    templates = client.get("/api/v1/templates")
    assert templates.status_code == 200
    builtin = next(
        row for row in templates.json()["items"] if row["code"] == "jd_orders"
    )

    response = client.post(
        "/api/v1/templates", json={**builtin, "code": "jd_custom", "name": "京东自定义"}
    )
    assert response.status_code == 201
    custom = response.json()
    assert custom["is_builtin"] is False
    assert custom["column_mapping"]["paid_amount"] == "商家应收"

    response = client.put(
        f"/api/v1/templates/{custom['id']}", json={**custom, "name": "已编辑"}
    )
    assert response.status_code == 200
    assert response.json()["name"] == "已编辑"
    assert client.delete(f"/api/v1/templates/{custom['id']}").status_code == 204

    for response in (
        client.put(f"/api/v1/templates/{builtin['id']}", json=builtin),
        client.delete(f"/api/v1/templates/{builtin['id']}"),
    ):
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "BUILTIN_READONLY"


def test_shops_enforce_unique_names_and_bind_a_batch_atomically(client):
    shops_url = "/api/v1/shops"
    jd_shop = {"shop_name": "人工合成店铺", "platform": "jd"}
    response = client.post(shops_url, json=jd_shop)
    assert response.status_code == 201
    shop = response.json()
    assert shop["is_active"] is True
    assert client.post(shops_url, json=jd_shop).status_code == 409
    assert (
        client.post(shops_url, json={**jd_shop, "platform": "jushuitan"}).status_code
        == 422
    )

    new_shop = {"shop_name": "新店铺", "platform": "tmall"}
    response = client.post(
        shops_url + "/batch-bind", json={"items": [new_shop, jd_shop]}
    )
    assert response.status_code == 409
    assert [row["shop_name"] for row in client.get(shops_url).json()["items"]] == [
        "人工合成店铺"
    ]

    response = client.post(
        shops_url + "/batch-bind",
        json={
            "items": [
                new_shop,
                {"shop_name": "二号店铺", "platform": "douyin"},
            ]
        },
    )
    assert response.status_code == 201
    assert [row["shop_name"] for row in response.json()["items"]] == [
        "新店铺",
        "二号店铺",
    ]
    updated = client.put(
        f"{shops_url}/{shop['id']}", json={**jd_shop, "is_active": False}
    )
    assert updated.status_code == 200
    assert updated.json()["is_active"] is False


def test_status_mapping_can_be_managed_with_valid_status_and_flag(client):
    url = "/api/v1/status-mappings"
    mapping = {
        "data_source": "jd",
        "raw_status": "人工测试状态",
        "normalized_status": "paid_unshipped",
        "is_valid_for_gmv": False,
    }
    created = client.post(url, json=mapping)
    assert created.status_code == 201
    record = created.json()
    assert record["is_valid_for_gmv"] is False
    assert client.post(url, json=mapping).status_code == 409
    for invalid in ({"normalized_status": "unknown"}, {"is_valid_for_gmv": 2}):
        response = client.post(url, json={**mapping, **invalid})
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"

    record_url = f"{url}/{record['id']}"
    edited = client.put(record_url, json={**mapping, "normalized_status": "shipped"})
    assert edited.json()["normalized_status"] == "shipped"
    assert record["id"] in {row["id"] for row in client.get(url).json()["items"]}
    assert client.delete(record_url).status_code == 204
    assert record["id"] not in {row["id"] for row in client.get(url).json()["items"]}

    batch = client.post(
        f"{url}/batch-upsert",
        json={
            "items": [
                {
                    "data_source": "pdd",
                    "raw_status": "人工批量新状态",
                    "normalized_status": "closed_cancelled",
                    "is_valid_for_gmv": True,
                }
            ]
        },
    )
    assert batch.status_code == 201
    assert batch.json()["items"][0]["raw_status"] == "人工批量新状态"
    batch_update = client.post(
        f"{url}/batch-upsert",
        json={
            "items": [
                {
                    "data_source": "pdd",
                    "raw_status": "人工批量新状态",
                    "normalized_status": "completed",
                    "is_valid_for_gmv": False,
                }
            ]
        },
    )
    assert batch_update.status_code == 201
    assert batch_update.json()["items"][0]["normalized_status"] == "completed"
    assert batch_update.json()["items"][0]["is_valid_for_gmv"] is False
