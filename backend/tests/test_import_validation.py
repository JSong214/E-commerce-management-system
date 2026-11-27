import json
from io import BytesIO
from pathlib import Path

import pytest
import xlwt
from openpyxl import Workbook, load_workbook

from .helpers import create_shop, upload_csv, validate


def test_gbk_preview_strips_pii_and_preserves_wrapped_long_ids(client, staging_dir):
    response = upload_csv(
        client,
        [
            {
                "订单号": '="0003691453007789"',
                "京东价": "￥2,449.00",
                "商家应收": "2449.00（系统计算中，该值仅供参考）",
                "商家SKUID": "A1",
                "应付金额": "2499.00",
                " 下单帐号 ": "pii-account",
                "邮箱地址": "pii-email",
                "省": "浙江省",
                "市": "杭州市",
            }
        ],
        encoding="gbk",
    )

    assert response.status_code == 200, response.text
    result = response.json()
    assert result["file_encoding"] == "gb18030"
    assert result["matched_template"]["code"] == "jd_orders"
    assert result["pii_columns_detected"] == ["下单帐号", "邮箱地址"]
    assert "下单帐号" not in result["headers"]
    assert "邮箱地址" not in result["headers"]
    assert result["sample_rows"][0]["订单号"] == "0003691453007789"
    assert result["sample_rows"][0]["市"] == "杭州市"
    staged = list(staging_dir.glob("*.json"))
    assert staged
    assert all("pii-" not in item.read_text(encoding="utf-8") for item in staged)


def test_jd_order_total_uses_merchant_amount_and_last_positive_weight_gets_remainder(
    client,
):
    shop = create_shop(client)
    common = {
        "订单号": "3691453007789022",
        "下单时间": "2026/11/23 09:00:00",
        "付款确认时间": "2026-11-24",
        "订购数量": "1",
        "订单状态": "已完成",
        "应付金额": "8888.88",
        "商家应收": "￥5,748.01（系统计算中，该值仅供参考）",
        "下单帐号": "pii-account",
        "省": "浙江省",
        "市": "杭州市",
    }
    rows = [
        {
            **common,
            "商品ID": "OUT",
            "商品名称": "室外机",
            "京东价": "0",
            "商家SKUID": "",
        },
        {
            **common,
            "商品ID": "IN",
            "商品名称": "室内机",
            "京东价": "5599",
            "商家SKUID": "S",
        },
        {
            **common,
            "商品ID": "OUT",
            "商品名称": "室外机",
            "京东价": "0",
            "商家SKUID": "",
        },
        {
            **common,
            "商品ID": "IN",
            "商品名称": "室内机",
            "京东价": "3499",
            "商家SKUID": "S",
        },
        {
            **common,
            "订单号": "2",
            "商品ID": "IN",
            "商品名称": "室内机",
            "京东价": "9",
            "商家应收": "9.00",
            "商家SKUID": "S",
            "订单状态": "(删除)暂停",
        },
    ]
    preview = upload_csv(client, rows).json()
    response = validate(client, preview, default_shop_id=shop["id"])
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["summary"]["valid_rows"] == 5
    assert result["summary"]["prorated_orders"] == 1
    lines = result["cleaned_sample_rows"]
    assert [line["paid_amount"] for line in lines] == [
        "0.00",
        "3537.38",
        "0.00",
        "2210.63",
        "9.00",
    ]
    assert [line["line_key"] for line in lines] == [
        "OUT#1",
        "S#1",
        "OUT#2",
        "S#2",
        "S#1",
    ]
    assert all(line["is_amount_prorated"] is True for line in lines[:4])
    assert lines[-1]["normalized_status"] == "closed_cancelled"
    assert lines[-1]["is_valid_for_gmv"] is False
    assert lines[1]["raw_extra"] == {"应付金额": "8888.88"}
    assert (lines[1]["province"], lines[1]["city"]) == ("浙江省", "杭州市")
    assert "pii-account" not in response.text


def test_validation_reports_unknown_shops_and_exports_sanitized_error_rows(
    client, staging_dir
):
    row = {
        "店铺名称": "未绑定合成店铺",
        "系统单号": "INNER",
        "外部订单号": "1001",
        "货品编码": "S-1",
        "商品小计": "55.00",
        "赠品标识": "否",
        "商品名称": "合成商品",
        "下单时间": "2026-11-23",
        "支付时间": "2026-11-23",
        "订货数量": "1",
        "状态": "合成未知状态",
        "收件人": "pii-recipient",
        "收件人手机号": "pii-phone",
        "详细地址": "pii-address",
        "  区县  ": "pii-district",
        "省": "浙江省",
        "市": "杭州市",
        "非敏感扩展": "=2+2",
    }
    uploaded = upload_csv(
        client, [row, {**row, "外部订单号": "1002", "下单时间": "", "订货数量": "2.5"}]
    )
    response = validate(client, uploaded.json(), data_source="jushuitan")
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["unknown_shops"] == ["未绑定合成店铺"]
    assert result["unknown_statuses"] == ["合成未知状态"]
    assert result["summary"]["valid_rows"] == 1
    assert result["summary"]["error_rows"] == 1
    assert {error["field_name"] for error in result["errors_preview"]} == {
        "order_time",
        "quantity",
    }
    assert all(error["row_number"] == 2 for error in result["errors_preview"])
    assert all(
        "pii-" not in item.read_text(encoding="utf-8")
        for item in staging_dir.glob("*.json")
    )
    assert result["cleaned_sample_rows"][0]["normalized_status"] == "paid_unshipped"

    exported = client.get(
        f"/api/v1/imports/validations/{result['validation_id']}/errors/export"
    )
    assert exported.status_code == 200, exported.text
    sheet = load_workbook(BytesIO(exported.content)).active
    headers, data = list(sheet.values)
    assert headers[-3:] == ("错误行号", "错误字段", "错误原因")
    assert data[-3] == 2
    assert "order_time" in data[-2] and "quantity" in data[-2]
    assert all(
        name not in headers for name in ("收件人", "收件人手机号", "详细地址", "区县")
    )
    assert "pii-" not in str(data)
    extra = sheet.cell(2, headers.index("非敏感扩展") + 1)
    assert (extra.value, extra.data_type) == ("=2+2", "s")


SOURCE_EXPORTS = json.loads(
    (Path(__file__).parent / "fixtures" / "source_exports.json").read_text(
        encoding="utf-8"
    )
)


@pytest.mark.parametrize(
    "example", SOURCE_EXPORTS, ids=[item["code"] for item in SOURCE_EXPORTS]
)
def test_all_seven_presets_match_and_clean_anonymized_platform_exports(client, example):
    source = example["data_source"]
    raw = example["raw"]
    shop = create_shop(client, example["platform"], raw.get("店铺名称", "合成店铺"))
    response = upload_csv(client, [raw], encoding="utf-8-sig")
    assert response.status_code == 200, response.text
    preview = response.json()
    assert preview["file_encoding"] == "utf-8-sig"
    assert preview["matched_template"]["code"] == example["preview"]
    assert preview["matched_template"]["needs_default_shop"] == (source != "jushuitan")
    response = validate(
        client,
        preview,
        data_source=source,
        default_shop_id=shop["id"] if source != "jushuitan" else None,
    )
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["summary"]["error_rows"] == 0, result["errors_preview"]
    assert result["summary"]["estimated_inserts"] == 1
    (line,) = result["cleaned_sample_rows"]
    assert line["platform_order_id"] == example["order_id"]
    assert line["platform"] == example["platform"]
    assert line["shop_id"] == shop["id"]
    assert line["paid_amount"] == example["paid"]
    if "sku" in example:
        assert line["sku_code"] == example["sku"]
    if "line_key" in example:
        assert line["line_key"] == example["line_key"]
    if "discount" in example:
        assert line["discount_amount"] == example["discount"]
    if example["code"] == "jushuitan_erp_b":
        assert line["is_gift"] is True
    if example["code"] == "douyin_orders":
        assert line["raw_extra"]["达人昵称"] == "测试达人"
        assert "pii-buyer" not in response.text


def test_matching_erp_export_without_shop_column_prompts_for_a_default_shop(client):
    example = next(
        example for example in SOURCE_EXPORTS if example["code"] == "jushuitan_erp_b"
    )
    raw = {name: value for name, value in example["raw"].items() if name != "店铺名称"}
    response = upload_csv(client, [raw])
    assert response.status_code == 200, response.text
    match = response.json()["matched_template"]
    assert match["code"] == "jushuitan_erp_b"
    assert match["needs_default_shop"] is True


@pytest.mark.parametrize("extension", ["xlsx", "xls"])
def test_excel_lists_sheets_and_validates_an_alternate_sheet(client, extension):
    rows = [
        [
            "订单号",
            "京东价",
            "商家应收",
            "商家SKUID",
            "应付金额",
            "下单时间",
            "订单状态",
            "商品名称",
            "订购数量",
        ],
        [
            '="0003691453007789"',
            20,
            19,
            "S-1",
            20,
            "2026-11-23",
            "已完成",
            "测试商品",
            1,
        ],
    ]
    if extension == "xls":
        workbook = xlwt.Workbook()
        workbook.add_sheet("说明").write(0, 0, "测试标题")
        sheet = workbook.add_sheet("订单")
        for row_index, row in enumerate(rows):
            for column_index, value in enumerate(row):
                sheet.write(row_index, column_index, value)
    else:
        workbook = Workbook()
        workbook.active.title = "说明"
        workbook.active.append(["测试标题"])
        sheet = workbook.create_sheet("订单")
        for row in rows:
            sheet.append(row)
    output = BytesIO()
    workbook.save(output)
    uploaded = client.post(
        "/api/v1/imports/parse-preview",
        data={"sheet_name": "说明"},
        files={
            "file": (
                f"orders.{extension}",
                output.getvalue(),
                "application/octet-stream",
            )
        },
    )
    assert uploaded.status_code == 200, uploaded.text
    preview = uploaded.json()
    assert preview["sheets"] == ["说明", "订单"]
    assert preview["selected_sheet"] == "说明"
    shop = create_shop(client)
    response = validate(client, preview, default_shop_id=shop["id"], sheet_name="订单")
    assert response.status_code == 200, response.text
    (line,) = response.json()["cleaned_sample_rows"]
    assert line["platform_order_id"] == "0003691453007789"


def test_calibrated_real_platform_rules_clean_bybt_pdd_and_jushuitan_edge_cases(client):
    tb_shop = create_shop(client, "taobao", "淘宝校准测试店")
    tb_preview = upload_csv(
        client,
        [
            {
                "主订单编号": "TB-BYBT-1",
                "子订单编号": "TB-BYBT-L1",
                "订单创建时间": "2026-11-10 10:00:00",
                "订单付款时间": "2026-11-10 10:01:00",
                "商品标题": "测试百亿补贴商品",
                "购买数量": "2",
                "商品价格": "0.00",
                "买家应付货款": "0.00",
                "买家实付金额": "0.00",
                "退款金额": "无退款申请",
                "退款状态": "没有申请退款",
                "订单状态": "卖家已发货，等待买家确认",
                "百亿补贴超链订单信息": "供货单价:¥1549.00;百亿补贴平台交易单号:123;",
            },
            {
                "主订单编号": "TB-BYBT-2",
                "子订单编号": "TB-BYBT-L2",
                "订单创建时间": "2026-11-10 11:00:00",
                "订单付款时间": "2026-11-10 11:01:00",
                "商品标题": "测试百亿补贴退款单",
                "购买数量": "1",
                "商品价格": "0.00",
                "买家应付货款": "0.00",
                "买家实付金额": "0.00",
                "退款金额": "0.00",
                "退款状态": "退款成功",
                "订单状态": "交易关闭",
                "百亿补贴超链订单信息": "供货单价:¥1549.00;",
            },
            {
                "主订单编号": "TB-BYBT-3",
                "子订单编号": "TB-BYBT-L3",
                "订单创建时间": "2026-11-10 12:00:00",
                "订单付款时间": "",
                "商品标题": "测试未付款关闭单",
                "购买数量": "1",
                "商品价格": "0.00",
                "买家应付货款": "",
                "买家实付金额": "",
                "退款金额": "无退款申请",
                "退款状态": "没有申请退款",
                "订单状态": "交易关闭",
                "百亿补贴超链订单信息": "供货单价:¥1549.00;",
            },
        ],
    ).json()
    tb_result = validate(
        client, tb_preview, data_source="taobao", default_shop_id=tb_shop["id"]
    ).json()
    assert tb_result["summary"]["error_rows"] == 0, tb_result["errors_preview"]
    assert tb_result["unknown_statuses"] == []
    tb_lines = tb_result["cleaned_sample_rows"]
    assert tb_lines[0]["paid_amount"] == "3098.00"
    assert tb_lines[0]["refund_amount"] == "0.00"
    assert tb_lines[0]["normalized_status"] == "shipped"
    assert tb_lines[1]["paid_amount"] == "1549.00"
    assert tb_lines[1]["refund_amount"] == "1549.00"
    assert tb_lines[1]["is_valid_for_gmv"] is True
    assert tb_lines[2]["paid_amount"] == "0.00"
    assert tb_lines[2]["is_valid_for_gmv"] is False

    pdd_shop = create_shop(client, "pdd", "拼多多校准测试店")
    pdd_preview = upload_csv(
        client,
        [
            {
                "订单号": "261114-123456789012345",
                "订单成交时间": "",
                "订单状态": "已取消",
                "售后状态": "无售后或售后取消",
                "商品": "测试空调",
                "商品数量(件)": "1",
                "商品总价(元)": "1500.0",
                "用户实付金额(元)": "1300.0",
                "商家实收金额(元)": "1500.0",
                "商家编码-规格维度": "SKU-AC-1",
            },
            {
                "订单号": "261114-999999999999999",
                "订单成交时间": "2026-11-14 09:30:00",
                "订单状态": "未发货，退款成功",
                "售后状态": "退款成功",
                "商品": "测试空调",
                "商品数量(件)": "1",
                "商品总价(元)": "1500.0",
                "用户实付金额(元)": "1300.0",
                "商家实收金额(元)": "1500.0",
                "商品id": "973961708531",
                "商家编码-规格维度": "SKU-AC-1",
            },
        ],
    ).json()
    pdd_result = validate(
        client, pdd_preview, data_source="pdd", default_shop_id=pdd_shop["id"]
    ).json()
    assert pdd_result["summary"]["error_rows"] == 0, pdd_result["errors_preview"]
    assert pdd_result["unknown_statuses"] == []
    pdd_lines = pdd_result["cleaned_sample_rows"]
    assert pdd_lines[0]["order_time"] == "2026-11-14T00:00:00"
    assert pdd_lines[0]["is_valid_for_gmv"] is False
    assert pdd_lines[1]["paid_amount"] == "1500.00"
    assert pdd_lines[1]["refund_amount"] == "1500.00"
    assert pdd_lines[1]["line_key"] == "973961708531#1"

    jst_preview = upload_csv(
        client,
        [
            {
                "店铺名称": "拼多多校准测试店",
                "内部订单号": "INT-1",
                "线上订单号": "261114-999999999999999",
                "线上子订单编号": "261114-999999999999999_1927524267851",
                "标准商品名": "测试空调",
                "店铺款式编码": "973961708531",
                "原始商品编码": "SKU-AC-1",
                "下单时间": "2026-11-14 09:30:00",
                "付款日期": "2026-11-14 09:30:00",
                "数量": "1",
                "买家实付金额": "1300",
                "卖家实收金额": "1500",
                "订单退款金额": "1350",
                "退款状态": "成功退款",
                "是否赠品": "否",
                "子订单状态": "None",
                "状态": "已发货",
            }
        ],
    ).json()
    jst_result = validate(client, jst_preview, data_source="jushuitan").json()
    assert jst_result["summary"]["error_rows"] == 0, jst_result["errors_preview"]
    assert jst_result["unknown_statuses"] == []
    (jst_line,) = jst_result["cleaned_sample_rows"]
    assert jst_line["paid_amount"] == "1500.00"
    assert jst_line["refund_amount"] == "1350.00"
    assert jst_line["normalized_status"] == "shipped"
    assert jst_line["line_key"] == "973961708531#1"
