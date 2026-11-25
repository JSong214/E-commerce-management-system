import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from hashlib import sha1
from typing import get_args

from .domain import MappableField
from .import_parser import PII_KEYS, header_key
from .time_values import local_datetime

CENT = Decimal("0.01")
ZERO = Decimal("0.00")
MAX_MONEY = Decimal("999999999999.99")
MONEY_DEFAULTS = {"discount_amount": ZERO, "shipping_fee": ZERO, "refund_amount": ZERO}
MONEY_FIELDS = {"unit_price", "gross_amount", "paid_amount", *MONEY_DEFAULTS}
DATE_FIELDS = {"order_time", "pay_time", "ship_time", "finish_time"}
REQUIRED = {
    "platform_order_id",
    "order_time",
    "product_name",
    "quantity",
    "raw_order_status",
}
ID_FIELDS = {"platform_order_id", "sub_order_id", "product_id", "sku_code"}
STRING_LIMITS = {
    "shop_name": 128,
    "platform_order_id": 64,
    "sub_order_id": 64,
    "product_id": 64,
    "sku_code": 128,
    "product_name": 512,
    "sku_spec": 255,
    "raw_order_status": 128,
    "refund_status": 64,
    "province": 64,
    "city": 64,
    "seller_note": 512,
    "buyer_note": 512,
}
GEO_HEADERS = {"province": ["省", "省份"], "city": ["市", "城市"]}
TRAILING_ANNOTATION = re.compile(r"(?:（[^（）]*）|\([^()]*\))\s*$")
NULL_PLACEHOLDERS = {"none", "null", "n/a", "na"}
EMPTY_PLACEHOLDERS = {"-", "--", "无", "暂无", "无退款申请", *NULL_PLACEHOLDERS}
PDD_ORDER_DATE_RE = re.compile(r"^(\d{2})(\d{2})(\d{2})-")
BYBT_PRICE_RE = re.compile(r"供货单价[:：]\s*[¥￥]?\s*([\d,]+(?:\.\d+)?)")
ERP_PDD_SYNTHETIC_SUB_RE = re.compile(
    r"^(?:\d{6}-\d+_\d+|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$"
)
FULL_REFUND_REFUND_STATUSES = {"退款成功", "已全额退款", "成功退款"}
FULL_REFUND_ORDER_STATUSES = {
    "未发货，退款成功",
    "已发货，退款成功",
    "已收货，退款成功",
}
NON_REFUND_STATUSES = {"退款关闭", "未申请退款"}


@dataclass
class CleanedRow:
    number: int
    raw: dict[str, str]
    line: dict = field(default_factory=dict)
    errors: list[dict] = field(default_factory=list)
    warnings: list[dict] = field(default_factory=list)

    def error(self, name, value, code, message):
        self.errors.append(
            {
                "row_number": self.number,
                "field_name": name,
                "raw_value": value[:512],
                "error_code": code,
                "error_message": message[:255],
                "raw_row_sanitized": self.raw,
            }
        )

    def warn(self, name, message):
        self.warnings.append(
            {"row_number": self.number, "field_name": name, "message": message}
        )


def strip_numeric(value):
    value = TRAILING_ANNOTATION.sub("", value)
    return re.sub(r"[¥￥,，\s]", "", value)


def bounded_money(amount):
    result = amount.quantize(CENT, rounding=ROUND_HALF_UP)
    if not result.is_finite() or abs(result) > MAX_MONEY:
        raise ValueError("Amount out of range")
    return result or ZERO


def date_value(value):
    iso = (
        value.replace("/", "-")
        .replace("年", "-")
        .replace("月", "-")
        .replace("日", " ")
        .strip()
    )
    try:
        parsed = datetime.fromisoformat(iso)
    except ValueError:
        for pattern in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
            try:
                parsed = datetime.strptime(iso, pattern)
                break
            except ValueError:
                continue
        else:
            raise ValueError("Invalid date")
    return local_datetime(parsed).replace(microsecond=0)


def clean_value(name, value):
    if name in MONEY_FIELDS:
        return bounded_money(Decimal(strip_numeric(value)))
    if name in DATE_FIELDS:
        return date_value(value)
    if name == "quantity":
        number = Decimal(strip_numeric(value))
        if (
            not number.is_finite()
            or not 0 <= number <= 2**31 - 1
            or number != number.to_integral_value()
        ):
            raise ValueError("Quantity must be a nonnegative integer")
        return int(number)
    if name == "is_gift":
        if value.casefold() in {"1", "true", "yes", "y", "是", "赠品"}:
            return True
        if value.casefold() in {"0", "false", "no", "n", "否", "非赠品"}:
            return False
        raise ValueError("Invalid gift flag")
    if len(value) > STRING_LIMITS[name]:
        raise ValueError("Text out of range")
    return value


def clean_row(source, mapping, rules, pii_keys):
    raw = {
        key: value
        for key, value in source["values"].items()
        if header_key(key) not in pii_keys
    }
    row = CleanedRow(source["row_number"], raw)
    line = row.line
    for name in get_args(MappableField):
        choices = mapping.get(name, [])
        populated = [
            (key, raw[key])
            for key in choices
            if raw.get(key) and raw[key].strip().casefold() not in NULL_PLACEHOLDERS
        ]
        label, value = populated[0] if populated else ((choices or [name])[0], "")
        if name in ID_FIELDS:
            value = value.removeprefix("'").strip()

        if value and value.casefold() in EMPTY_PLACEHOLDERS:
            if name in MONEY_DEFAULTS:
                line[name] = MONEY_DEFAULTS[name]
                continue
            if name in DATE_FIELDS and name != "order_time":
                line[name] = None
                continue

        if not value:
            if name == "order_time" and rules.derive_order_time_from_pdd_order_id:
                match = PDD_ORDER_DATE_RE.match(line.get("platform_order_id") or "")
                if match:
                    try:
                        derived = datetime(
                            2000 + int(match[1]), int(match[2]), int(match[3])
                        )
                    except ValueError:
                        derived = None
                    if derived is not None:
                        line["order_time"] = local_datetime(derived).replace(
                            microsecond=0
                        )
                        row.warn(
                            "order_time",
                            "订单成交时间为空，已根据拼多多订单号日期前缀推导下单日期",
                        )
                        continue
            if name in REQUIRED:
                row.error(name, value, "REQUIRED_MISSING", f"必填字段「{label}」为空")
            line[name] = MONEY_DEFAULTS.get(name, False if name == "is_gift" else None)
            continue

        try:
            if name == "discount_amount" and rules.sum_discount_columns:
                line[name] = bounded_money(
                    sum(
                        Decimal(strip_numeric(amount))
                        for _, amount in populated
                        if amount.casefold() not in EMPTY_PLACEHOLDERS
                    )
                )
            else:
                line[name] = clean_value(name, value)
            if (
                rules.prorate_order_amount
                and name in ("unit_price", "paid_amount")
                and line[name] < ZERO
            ):
                raise ValueError("Proration requires a nonnegative amount")
        except (ValueError, OverflowError, InvalidOperation):
            line[name] = None
            row.error(name, value, "INVALID_VALUE", f"「{label}」的值无效或超出范围")

    if rules.extract_bybt_supply_price and line.get("quantity"):
        bybt_info = (
            raw.get("百亿补贴超链订单信息") or raw.get("超链半托管订单信息") or ""
        )
        price_match = BYBT_PRICE_RE.search(bybt_info)
        if price_match:
            try:
                supply_price = bounded_money(Decimal(strip_numeric(price_match[1])))
                supply_total = bounded_money(supply_price * line["quantity"])
            except (ValueError, InvalidOperation):
                supply_price = None
                supply_total = None
            if supply_price is not None and supply_total is not None:
                if line.get("unit_price") in (None, ZERO):
                    line["unit_price"] = supply_price
                if line.get("gross_amount") in (None, ZERO):
                    line["gross_amount"] = supply_total
                if line.get("paid_amount") in (None, ZERO) and line.get("pay_time"):
                    line["paid_amount"] = supply_total
                    row.warn(
                        "paid_amount",
                        "检测到百亿补贴超链订单，已按供货单价×数量补齐实付金额",
                    )

    if (
        rules.gross_amount_from_unit_price
        and line["gross_amount"] is None
        and line["unit_price"] is not None
        and line["quantity"] is not None
    ):
        try:
            line["gross_amount"] = bounded_money(line["unit_price"] * line["quantity"])
        except (ValueError, InvalidOperation):
            row.error(
                "gross_amount",
                "",
                "INVALID_VALUE",
                "按单价和数量计算的订单金额超出范围",
            )

    used = {key for choices in mapping.values() for key in choices}
    line.update(
        raw_extra={key: value for key, value in raw.items() if key not in used},
        is_amount_prorated=False,
    )
    return row


def apply_shop(row, shops, default_shop):
    name = row.line["shop_name"]
    shop = shops.get(name.casefold()) if name else default_shop
    if shop is None:
        row.line.update(shop_id=None, platform=None)
        if not name and not any(
            error["field_name"] == "shop_name" for error in row.errors
        ):
            row.error(
                "shop_name", "", "REQUIRED_MISSING", "请选择默认店铺或映射店铺名称"
            )
        return name
    row.line.update(
        shop_id=shop["id"], shop_name=shop["shop_name"], platform=shop["platform"]
    )
    return None


def apply_status(row, statuses, unknown_statuses):
    line = row.line
    raw = line["raw_order_status"]
    if not raw:
        return
    if raw.startswith("(删除)"):
        line.update(normalized_status="closed_cancelled", is_valid_for_gmv=False)
        return
    status = statuses.get((line["data_source"], raw.casefold())) or statuses.get(
        ("*", raw.casefold())
    )
    if status:
        normalized, allowed = (
            status["normalized_status"],
            bool(status["is_valid_for_gmv"]),
        )
    else:
        normalized = "paid_unshipped" if line["pay_time"] is not None else "pending_pay"
        allowed = True
        unknown_statuses.add(raw)
        row.warn("raw_order_status", "未配置此订单状态，已根据付款时间归类")

    line.update(
        normalized_status=normalized,
        is_valid_for_gmv=allowed
        and normalized != "pending_pay"
        and (normalized != "closed_cancelled" or line["pay_time"] is not None),
    )


def assign_line_keys(rows):
    occurrences = Counter()
    for row in rows:
        line = row.line
        sub_id = line["sub_order_id"]
        ignore_erp_pdd_sub = (
            line["platform"] == "pdd"
            and bool(sub_id)
            and bool(ERP_PDD_SYNTHETIC_SUB_RE.fullmatch(sub_id))
        )
        if sub_id and not ignore_erp_pdd_sub:
            line["line_key"] = sub_id
            continue
        if not line["platform_order_id"] or not line["product_name"]:
            continue
        base = (
            (line["product_id"] or line["sku_code"])
            if line["platform"] == "pdd"
            else (line["sku_code"] or line["product_id"])
        )
        if not base:
            base = sha1(
                line["product_name"].encode("utf-8"), usedforsecurity=False
            ).hexdigest()[:8]
        scope = (
            line["platform"],
            line["shop_name"] if line["platform"] is None else None,
        )
        key = (scope, line["platform_order_id"].casefold(), base.casefold())
        occurrences[key] += 1
        line["line_key"] = f"{base}#{occurrences[key]}"
        if len(line["line_key"]) > 128:
            row.error(
                "line_key",
                line["line_key"],
                "INVALID_VALUE",
                "订单行标识超过 128 个字符",
            )


def prorate_orders(rows):
    orders = defaultdict(list)
    for row in rows:
        if row.line["platform_order_id"]:
            orders[row.line["platform_order_id"]].append(row)

    prorated = 0
    for order_rows in orders.values():
        if len(order_rows) < 2:
            continue
        amounts = [
            row.line["paid_amount"]
            for row in order_rows
            if row.line["paid_amount"] is not None
        ]
        if not amounts:
            continue
        total = amounts[0]
        if any(amount and amount != total for amount in amounts[1:]):
            order_rows[0].warn(
                "paid_amount", "同一订单的商家应收不一致，使用首个金额进行分摊"
            )

        if any(
            error["field_name"] in {"quantity", "unit_price", "paid_amount"}
            for row in order_rows
            for error in row.errors
        ):
            for row in order_rows:
                row.error(
                    "paid_amount",
                    "",
                    "PRORATION_INVALID",
                    "订单中有无效的金额、单价或数量，无法分摊",
                )
            continue

        quantities = [row.line["quantity"] for row in order_rows]
        weights = [
            int((row.line["unit_price"] or ZERO) * 100) * quantity
            for row, quantity in zip(order_rows, quantities)
        ]
        weights = weights if any(weights) else quantities
        total_cents = int(total * 100)
        if not any(weights) and total_cents:
            for row in order_rows:
                row.error(
                    "paid_amount",
                    "",
                    "PRORATION_INVALID",
                    "订单没有可用于分摊的单价或数量",
                )
            continue

        weight_sum = sum(weights)
        cents = [
            total_cents * weight // weight_sum if weight_sum else 0
            for weight in weights
        ]
        if weight_sum:
            last = max(index for index, weight in enumerate(weights) if weight)
            cents[last] += total_cents - sum(cents)
        for row, allocated in zip(order_rows, cents):
            row.line.update(
                paid_amount=Decimal(allocated).scaleb(-2), is_amount_prorated=True
            )
        order_rows[0].warn(
            "paid_amount", f"已按整单实付分摊（{len(order_rows)} 行共 {total:.2f} 元）"
        )
        prorated += 1
    return prorated


def clean_sheet(sheet, mapping, rules, data_source, shops, default_shop, statuses):
    mapping = {**GEO_HEADERS, **mapping}
    mapping = {
        name: [choice] if isinstance(choice, str) else choice
        for name, choice in mapping.items()
    }
    pii = PII_KEYS | {header_key(name) for name in rules.pii_columns}
    rows = [clean_row(row, mapping, rules, pii) for row in sheet["rows"]]
    unknown_shops, unknown_statuses = set(), set()
    for row in rows:
        row.line["data_source"] = data_source
        unknown_shop = apply_shop(row, shops, default_shop)
        if unknown_shop:
            unknown_shops.add(unknown_shop)
        apply_status(row, statuses, unknown_statuses)
    assign_line_keys(rows)
    prorated_orders = prorate_orders(rows) if rules.prorate_order_amount else 0
    for row in rows:
        line = row.line
        if (
            line["paid_amount"] is None
            and line.get("pay_time") is None
            and line.get("normalized_status") in ("pending_pay", "closed_cancelled")
            and not any(error["field_name"] == "paid_amount" for error in row.errors)
        ):
            line["paid_amount"] = ZERO
        if line["paid_amount"] is None and not any(
            error["field_name"] == "paid_amount" for error in row.errors
        ):
            label = (mapping.get("paid_amount") or ["paid_amount"])[0]
            row.error("paid_amount", "", "REQUIRED_MISSING", f"必填字段「{label}」为空")
            continue

        paid = line.get("paid_amount") or ZERO
        refund = line.get("refund_amount") or ZERO
        ref_status = (line.get("refund_status") or "").strip()
        raw_status = (line.get("raw_order_status") or "").strip()
        if (
            rules.infer_full_refund_from_status
            and line.get("is_valid_for_gmv")
            and line.get("pay_time") is not None
            and paid > ZERO
            and refund == ZERO
        ):
            if (
                ref_status in FULL_REFUND_REFUND_STATUSES
                or raw_status in FULL_REFUND_ORDER_STATUSES
                or (
                    line.get("normalized_status") == "closed_cancelled"
                    and ref_status == "是"
                )
            ):
                line["refund_amount"] = paid
                row.warn(
                    "refund_amount",
                    "源文件无退款金额，已按退款状态暂以实付全额计入退款（后续可导入清洗后退款表覆盖更新）",
                )
            elif ref_status == "是":
                row.warn(
                    "refund_amount",
                    "订单标记存在退款但未关闭且无退款金额列，请后续导入清洗后的退款明细核对",
                )
        elif refund > ZERO and ref_status in NON_REFUND_STATUSES:
            row.warn(
                "refund_amount",
                f"退款状态为「{ref_status}」但存在正数退款金额（{refund:.2f}），请核对是否为导出异常",
            )
    return rows, sorted(unknown_shops), sorted(unknown_statuses), prorated_orders
