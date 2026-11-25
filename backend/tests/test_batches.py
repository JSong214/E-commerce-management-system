import json
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from time import sleep

from openpyxl import load_workbook
from sqlalchemy import create_engine, text

from .helpers import commit, create_shop, jd_row, prepare_import


def test_commit_retries_return_the_same_batch_and_skip_does_not_update_existing_lines(
    client, staging_dir
):
    shop = create_shop(client)
    original = jd_row("9000000000012345")
    validated = prepare_import(client, [original], default_shop_id=shop["id"])
    response = commit(client, validated)
    assert response.status_code == 201, response.text
    batch = response.json()
    assert (batch["inserted_rows"], batch["updated_rows"], batch["skipped_rows"]) == (
        1,
        0,
        0,
    )
    assert not list(staging_dir.glob("*.json"))

    repeated = commit(client, validated)
    assert repeated.status_code == 201, repeated.text
    assert repeated.json() == batch

    updated = prepare_import(
        client,
        [{**original, "商家应收": "99.00"}, jd_row("9000000000012346")],
        default_shop_id=shop["id"],
    )
    assert updated["summary"]["estimated_updates"] == 1
    assert updated["summary"]["estimated_inserts"] == 1
    response = commit(client, updated, duplicate_strategy="skip")
    assert response.status_code == 201, response.text
    result = response.json()
    assert (
        result["inserted_rows"],
        result["updated_rows"],
        result["skipped_rows"],
    ) == (1, 0, 1)


def order_lines_state(mysql_url):
    engine = create_engine(mysql_url)
    try:
        with engine.connect() as conn:
            return [
                dict(row)
                for row in conn.execute(
                    text("SELECT * FROM order_lines ORDER BY id")
                ).mappings()
            ]
    finally:
        engine.dispose()


def test_exact_rollback_restores_every_column_and_blocks_older_overlapping_batches(
    client, mysql_url
):
    shop_id = create_shop(client)["id"]
    first_row = jd_row("9000000000012345", 应付金额="10.25", 商家备注="原始备注")
    untouched = jd_row("9000000000012346")
    original = commit(
        client, prepare_import(client, [first_row, untouched], default_shop_id=shop_id)
    )
    assert original.status_code == 201, original.text
    first = original.json()
    before = order_lines_state(mysql_url)
    sleep(1.05)

    updated = {
        **first_row,
        "应付金额": "29.99",
        "商家应收": "25.00",
        "商家备注": "更新备注",
        "订单状态": "已发货",
    }
    new_row = jd_row("9000000000012347")
    newer = commit(
        client, prepare_import(client, [updated, new_row], default_shop_id=shop_id)
    )
    assert newer.status_code == 201, newer.text
    second = newer.json()
    assert (second["updated_rows"], second["inserted_rows"]) == (1, 1)
    after = order_lines_state(mysql_url)
    assert len(after) == 3
    assert after[0]["updated_at"] > before[0]["updated_at"]
    assert json.loads(after[0]["raw_extra"]) == {"应付金额": "29.99"}

    first_url = f"/api/v1/batches/{first['batch_id']}"
    second_url = f"/api/v1/batches/{second['batch_id']}"
    blocked = client.get(first_url)
    assert blocked.status_code == 200, blocked.text
    assert blocked.json()["can_rollback"] is False
    assert blocked.json()["blocking_batches"] == [second["batch_no"]]
    conflict = client.post(first_url + "/rollback")
    assert conflict.status_code == 409
    assert conflict.json()["error"]["code"] == "ROLLBACK_CONFLICT"
    assert conflict.json()["error"]["details"]["blocking_batches"] == [
        second["batch_no"]
    ]
    assert order_lines_state(mysql_url) == after

    rolled_back = client.post(second_url + "/rollback")
    assert rolled_back.status_code == 200, rolled_back.text
    assert rolled_back.json() == {
        "batch_id": second["batch_id"],
        "status": "rolled_back",
        "deleted_rows": 1,
        "restored_rows": 1,
    }
    assert order_lines_state(mysql_url) == before
    assert client.get(first_url).json()["can_rollback"] is True
    assert client.post(second_url + "/rollback").status_code == 409
    assert client.post(first_url + "/rollback").json()["deleted_rows"] == 2
    assert order_lines_state(mysql_url) == []


def test_unbound_shop_can_be_bound_and_errors_downloaded_from_committed_batch(client):
    row = {
        "店铺名称": "未绑定店铺",
        "系统单号": "INNER",
        "外部订单号": "A1",
        "货品编码": "SKU",
        "商品小计": "12.00",
        "赠品标识": "否",
        "商品名称": "合成商品",
        "下单时间": "2026-11-23",
        "订货数量": "1",
        "状态": "已完成",
        "收件人": "pii-recipient",
    }
    validated = prepare_import(
        client,
        [row, {**row, "外部订单号": "A2", "下单时间": ""}],
        data_source="jushuitan",
    )
    blocked = commit(client, validated)
    assert blocked.status_code == 400
    assert blocked.json()["error"]["code"] == "UNBOUND_SHOPS"
    assert blocked.json()["error"]["details"]["unknown_shops"] == ["未绑定店铺"]

    bound = client.post(
        "/api/v1/shops/batch-bind",
        json={
            "items": [{"shop_name": "未绑定店铺", "platform": "taobao"}],
        },
    )
    assert bound.status_code == 201, bound.text
    skipped = commit(client, validated, skip_error_rows=False)
    assert skipped.status_code == 400
    assert skipped.json()["error"]["code"] == "VALIDATION_ERRORS"
    empty_history = client.get("/api/v1/batches")
    assert empty_history.status_code == 200, empty_history.text
    assert empty_history.json()["total"] == 0
    accepted = commit(client, validated, skip_error_rows=True)
    assert accepted.status_code == 201, accepted.text
    batch = accepted.json()
    assert (batch["inserted_rows"], batch["error_rows"]) == (1, 1)
    history = client.get(
        "/api/v1/batches?data_source=jushuitan&status=committed&page=1&page_size=1"
    )
    assert history.status_code == 200, history.text
    assert history.json()["total"] == 1
    [item] = history.json()["items"]
    assert item["batch_no"] == batch["batch_no"]
    assert item["can_rollback"] is True
    assert client.get("/api/v1/batches?status=rolled_back").json()["total"] == 0

    response = client.get(f"/api/v1/batches/{batch['batch_id']}/errors/export")
    assert response.status_code == 200, response.text
    header, error = list(load_workbook(BytesIO(response.content)).active.values)
    assert "收件人" not in header
    assert "pii-recipient" not in error
    assert error[-3:-1] == (2, "order_time")


def test_concurrent_retries_and_repeated_keys_across_chunks_keep_the_original_snapshot(
    client, mysql_url
):
    shop_id = create_shop(client)["id"]
    options = {
        "default_shop_id": shop_id,
        "column_mapping": {"sub_order_id": "商品ID"},
        "rules": {"prorate_order_amount": False},
    }
    original = jd_row("CASE-01", 商品ID="ITEM")
    response = commit(client, prepare_import(client, [original], **options))
    assert response.status_code == 201, response.text
    before = order_lines_state(mysql_url)

    rows = [
        {**original, "商家应收": "12.34"},
        *(jd_row(f"FILL-{index:04d}") for index in range(499)),
        {**original, "订单号": "case-01", "商品ID": "item", "商家应收": "56.78"},
    ]
    validated = prepare_import(client, rows, **options)
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: commit(client, validated), range(2)))
    assert [result.status_code for result in responses] == [201, 201]
    batch = responses[0].json()
    assert responses[1].json() == batch
    assert (batch["inserted_rows"], batch["updated_rows"]) == (499, 2)
    assert len(order_lines_state(mysql_url)) == 500

    response = client.post(f"/api/v1/batches/{batch['batch_id']}/rollback")
    assert response.status_code == 200, response.text
    assert response.json()["restored_rows"] == 1
    assert order_lines_state(mysql_url) == before
