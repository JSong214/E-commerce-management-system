from io import BytesIO

import pytest
from openpyxl import load_workbook

from .helpers import commit, create_shop, jd_row, prepare_import


@pytest.fixture
def report_shop_id(client):
    shop_id = create_shop(client, "taobao", "合成淘宝店")["id"]
    jd_shop_id = create_shop(client, "jd", "合成京东店")["id"]
    completed = {
        "主订单编号": "9000000000012345",
        "子订单编号": "0001",
        "订单创建时间": "2026-11-23 10:00:00",
        "订单付款时间": "2026-11-24 15:00:00",
        "商品标题": "商品甲",
        "商品ID": "PA",
        "商家编码": "SKU-A",
        "买家应付货款": "20.10",
        "买家实付金额": "20.10",
        "退款金额": "2.03",
        "购买数量": "2",
        "订单状态": "交易成功",
        "买家昵称": "pii-fixture",
    }
    rows = [
        completed,
        {
            **completed,
            "子订单编号": "0002",
            "商品ID": "PB",
            "商品标题": "商品乙",
            "商家编码": "SKU-B",
            "买家实付金额": "40.20",
            "退款金额": "0.00",
            "购买数量": "1",
        },
        {
            **completed,
            "主订单编号": "9000000000012346",
            "子订单编号": "0003",
            "订单创建时间": "2026-11-24 09:00:00",
            "买家实付金额": "5.43",
            "退款金额": "1.49",
            "购买数量": "3",
            "订单状态": "交易关闭",
        },
        {
            **completed,
            "主订单编号": "9000000000012347",
            "子订单编号": "0004",
            "订单付款时间": "",
            "买家实付金额": "100.00",
            "退款金额": "50",
            "购买数量": "9",
            "订单状态": "订单关闭",
        },
        {
            **completed,
            "主订单编号": "9000000000012348",
            "子订单编号": "0005",
            "订单付款时间": "",
            "买家实付金额": "200.00",
            "退款金额": "100",
            "购买数量": "8",
            "订单状态": "等待付款",
        },
    ]
    response = commit(
        client,
        prepare_import(client, rows, data_source="taobao", default_shop_id=shop_id),
    )
    assert response.status_code == 201, response.text
    assert response.json()["valid_rows"] == 5
    deleted = jd_row(
        "9000000000012349", 商家应收="500.00", 订单状态="(删除)等待出库", 订购数量="10"
    )
    response = commit(
        client, prepare_import(client, [deleted], default_shop_id=jd_shop_id)
    )
    assert response.status_code == 201, response.text
    return shop_id


ALL_KPI = {
    "gmv": "65.73",
    "refund_amount": "3.52",
    "net_sales": "62.21",
    "order_count": 2,
    "units_sold": 6,
}
FIRST_DAY_KPI = {
    "gmv": "60.30",
    "refund_amount": "2.03",
    "net_sales": "58.27",
    "order_count": 1,
    "units_sold": 3,
}
EMPTY_KPI = {
    "gmv": "0.00",
    "refund_amount": "0.00",
    "net_sales": "0.00",
    "order_count": 0,
    "units_sold": 0,
}


def test_summary_uses_exact_distinct_order_metrics_and_selected_time_basis(
    client, report_shop_id
):
    url = "/api/v1/reports/summary"
    first_day = {"date_from": "2026-11-23", "date_to": "2026-11-23"}
    result = client.get(url, params={**first_day, "group_by": "shop"})
    assert result.status_code == 200, result.text
    assert result.json() == {
        "kpi": FIRST_DAY_KPI,
        "rows": [
            {
                "period": "2026-11-23",
                "platform": "taobao",
                "shop_id": report_shop_id,
                "shop_name": "合成淘宝店",
                **FIRST_DAY_KPI,
            }
        ],
    }
    paid = client.get(url, params={**first_day, "time_basis": "pay_time"})
    assert paid.status_code == 200, paid.text
    assert paid.json() == {"kpi": EMPTY_KPI, "rows": []}
    for granularity, period in (
        ("day", "2026-11-24"),
        ("week", "2026-11-23"),
        ("month", "2026-11-01"),
    ):
        paid = client.get(
            url,
            params={
                "time_basis": "pay_time",
                "date_from": "2026-11-24",
                "date_to": "2026-11-24",
                "granularity": granularity,
                "group_by": "platform",
            },
        )
        assert paid.status_code == 200, paid.text
        assert paid.json()["kpi"] == ALL_KPI
        (row,) = paid.json()["rows"]
        assert (row["period"], row["platform"], row["gmv"]) == (
            period,
            "taobao",
            ALL_KPI["gmv"],
        )
    assert client.get(url, params={"time_basis": "ship_time"}).status_code == 422


def test_sku_ranking_returns_full_kpis_with_sorted_paginated_groups(
    client, report_shop_id
):
    url = "/api/v1/reports/sku-ranking"
    response = client.get(url, params={"shop_id": report_shop_id, "page_size": 1})
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["kpi"] == ALL_KPI
    assert result["total"] == 2
    [top] = result["items"]
    assert top["sku_code"] == "SKU-B"
    assert top["net_sales"] == "40.20"

    response = client.get(
        url, params={"platform": "taobao,jd", "sort_by": "units_sold", "page_size": 1}
    )
    assert response.status_code == 200, response.text
    [top] = response.json()["items"]
    assert top == {
        "sku_code": "SKU-A",
        "product_id": "PA",
        "product_name": "商品甲",
        "platform": "taobao",
        "gmv": "25.53",
        "refund_amount": "3.52",
        "net_sales": "22.01",
        "order_count": 2,
        "units_sold": 5,
    }
    page = client.get(
        url, params={"sort_by": "units_sold", "page": 2, "page_size": 1}
    ).json()
    assert page["items"][0]["sku_code"] == "SKU-B"
    assert client.get(url, params={"time_basis": "ship_time"}).status_code == 422


def test_report_export_contains_formatted_summary_and_only_matching_detail_lines(
    client, report_shop_id
):
    url = "/api/v1/reports/export"
    request = {
        "report_type": "summary",
        "include_detail_sheet": True,
        "filters": {
            "date_from": "2026-11-23",
            "date_to": "2026-11-23",
            "shop_id": report_shop_id,
            "group_by": "shop",
        },
    }
    response = client.post(url, json=request)
    assert response.status_code == 200, response.text
    book = load_workbook(BytesIO(response.content))
    assert book.sheetnames == ["汇总报表", "标准化明细"]
    summary = book["汇总报表"]
    assert summary.freeze_panes == "A2"
    money_column = next(cell.column for cell in summary[1] if cell.value == "gmv")
    assert summary.cell(2, money_column).value == 60.3
    assert summary.cell(2, money_column).number_format == "0.00"
    details = book["标准化明细"]
    assert details.max_row == 3
    id_column = next(
        cell.column for cell in details[1] if cell.value == "platform_order_id"
    )
    assert all(
        (cell.value, cell.number_format) == ("9000000000012345", "@")
        for (cell,) in details.iter_rows(
            min_row=2, min_col=id_column, max_col=id_column
        )
    )
    assert "pii-fixture" not in str(list(details.values))

    ranking = client.post(
        url,
        json={
            "report_type": "sku_ranking",
            "include_detail_sheet": False,
            "filters": {
                "time_basis": "pay_time",
                "sort_by": "units_sold",
                "page_size": 1,
            },
        },
    )
    assert ranking.status_code == 200, ranking.text
    book = load_workbook(BytesIO(ranking.content))
    assert book.sheetnames == ["汇总报表"]
    header, top, second = list(book.active.values)
    sku_index = header.index("sku_code")
    assert (top[sku_index], second[sku_index]) == ("SKU-A", "SKU-B")

    rejected = client.post(
        url, json={**request, "filters": {"time_basis": "ship_time"}}
    )
    assert rejected.status_code == 422
    assert rejected.json()["error"]["code"] == "VALIDATION_ERROR"
