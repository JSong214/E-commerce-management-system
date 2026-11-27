from collections import Counter

from .import_cleaning import NON_REFUND_STATUSES, ZERO, money_or_none, supply_price
from .product_matching import ERP_SOURCES, PENDING_MODEL_STATUSES, text_key

DIRECT = "direct_sales"
INDEPENDENT = "erp_independent_sales"
ENRICH = "erp_enrich"
ROLE_PRIORITY = {ENRICH: 0, INDEPENDENT: 1, DIRECT: 2}
EFFECTIVE_KEY = ("platform", "shop_id", "business_order_id", "record_key")
EFFECTIVE_FLAGS = ("erp_enriched",)


def business_order_id(line):
    if line["data_source"] == "taobao" and line["sub_order_id"]:
        return line["sub_order_id"]
    return line["platform_order_id"]


def has_text(value, words):
    return any(word and word in (value or "") for word in words)


def reship_or_price_difference(line, rule):
    if not rule["enabled"]:
        return None
    config = rule["config_json"]
    if line["is_reship"] or has_text(line["order_type"], config["reship_order_types"]):
        return "RESHIP_ORDER"
    if any(
        has_text(line.get(field), config["price_diff_keywords"])
        for field in ("product_name", "seller_note", "buyer_note")
    ):
        return "PRICE_DIFF"
    return None


class EffectiveSalesBuilder:
    def __init__(self, shops, matcher, rules):
        self.shops = shops
        self.models = matcher.models
        self.rules = rules
        self.merged_orders = 0

    def ordered_amount(self, row):
        amount = money_or_none(row["paid_amount"])
        if row.get("amount_source") == "missing_amount":
            return None
        return amount

    def taobao_amount(self, row):
        rule = self.rules["taobao_subsidy_fallback"]
        config = rule["config_json"]
        raw = row["raw_extra"]
        column = config["primary_column"]
        if column in raw:
            amount = money_or_none(raw[column])
        else:
            amount = self.ordered_amount(row)

        if amount is not None and amount > ZERO:
            threshold = money_or_none(config["low_amount_notice_threshold"])
            notices = []
            if rule["enabled"] and threshold is not None and amount < threshold:
                notices.append(f"买家实付低于{threshold.normalize():f}元({amount:.2f})")
            return amount, "taobao_buyer_paid", notices
        if rule["enabled"]:
            price = supply_price(raw.get(config["subsidy_column"]))
            if price is not None:
                total = money_or_none(price * row["quantity"])
                if total is not None:
                    return total, "taobao_bybt_supply", []
        return None, "missing_amount", []

    def amount(self, row, shop, *, jd=False):
        source = row["data_source"]
        paid = self.ordered_amount(row)
        if row["source_role"] != DIRECT or source in ERP_SOURCES:
            if (
                shop["zero_received_use_paid"] and paid == ZERO
                and self.rules["zero_received_use_paid"]["enabled"]
            ):
                fallback = money_or_none(row["erp_paid_amount"])
                if fallback is not None:
                    return fallback, "erp_paid_fallback", ["卖家实收为0，改取已付金额"]
                return None, "missing_amount", []
            return paid, "erp_seller_received", []
        if jd:
            field = self.rules["jd_whole_unit_merge"]["config_json"]["amount_field"]
            payable = money_or_none(row["payable_amount"])
            if field == "payable_amount" and payable is not None:
                return payable, "jd_payable", []
            return paid, "jd_paid_fallback", []
        if source == "taobao":
            return self.taobao_amount(row)
        return paid, {
            "pdd": "pdd_merchant_received",
            "douyin": "douyin_payable",
            "tmall": "tmall_actual_received",
        }.get(source, "direct_paid"), []

    def status_exclusion(self, row, shop, *, jd_closed):
        if reason := reship_or_price_difference(row, self.rules["exclude_reship_and_price_diff"]):
            return reason
        status = row["raw_order_status"]
        refund = row["refund_status"] or ""
        if row["source_role"] != DIRECT:
            if row["source_role"] != INDEPENDENT or not shop["erp_sales_enabled"]:
                return "ERP_NOT_ENABLED"
            if has_text(status, ("取消", "关闭")):
                return "STATUS_CLOSED"
            if refund and refund not in NON_REFUND_STATUSES:
                return "STATUS_REFUNDED"
            return None

        source = row["data_source"]
        if jd_closed or (
            source == "jd" and has_text(status, ("取消", "关闭", "删除"))
        ):
            return "STATUS_CLOSED"
        if source == "taobao":
            if has_text(status, ("交易关闭", "TRADE_CLOSED")):
                return "STATUS_CLOSED"
            if "退款成功" in refund:
                return "STATUS_REFUNDED"
        elif source == "tmall":
            if has_text(status, ("关闭", "TRADE_CLOSED")):
                return "STATUS_CLOSED"
            if refund == "是" or "退款成功" in refund:
                return "STATUS_REFUNDED"
        elif source == "pdd":
            if "取消" in status:
                return "STATUS_CLOSED"
            if "退款成功" in status or "退款成功" in refund:
                return "STATUS_REFUNDED"
        elif source == "douyin":
            if has_text(status, ("关闭", "取消")):
                return "STATUS_CLOSED"
            if has_text(refund, ("退款成功", "已全额退款")):
                return "STATUS_REFUNDED"
        elif row["normalized_status"] == "closed_cancelled":
            return "STATUS_CLOSED"
        if not row["pay_time"]:
            return "NO_PAY_TIME"
        return None

    def record(self, row, linked, key, *, jd=False, jd_closed=False):
        shop = self.shops[row["shop_id"]]
        model = self.models.get(row["resolved_model_id"], {})
        amount, source, notices = self.amount(row, shop, jd=jd)
        if amount is None:
            amount, source, missing_amount = ZERO, "missing_amount", True
        else:
            missing_amount = False
        reason = self.status_exclusion(row, shop, jd_closed=jd_closed)
        if reason:
            eligibility = "excluded"
        elif missing_amount:
            eligibility, reason = "needs_review", "MISSING_AMOUNT"
        else:
            eligibility = "valid"

        brand = model.get("brand")
        if shop["preserve_full_product_name"]:
            raw_brand = row["raw_extra"].get("品牌") or ""
            brand = brand or raw_brand.strip()[:64] or None
            aliases = self.rules["zero_received_use_paid"]["config_json"]["brand_aliases"]
            brand = aliases.get(brand, brand)
            if eligibility == "valid" and (not row["product_name"] or not brand):
                eligibility = "needs_review"
                if not row["product_name"]:
                    notices.append("缺少商品名称")
                if not brand:
                    notices.append("缺少品牌")

        threshold = self.rules["min_sales_amount"]
        minimum = money_or_none(threshold["config_json"]["threshold"])
        if eligibility == "valid" and threshold["enabled"] and minimum is not None and amount < minimum:
            eligibility = "excluded"
            reason = threshold["config_json"]["exclude_reason"]
        if eligibility == "valid" and row["source_role"] == DIRECT and "取消" in (row["erp_raw_status"] or ""):
            notices.append("ERP状态为取消，保留直出判定")

        return {
            "platform": row["platform"],
            "shop_id": row["shop_id"],
            "shop_name": row["shop_name"],
            "business_order_id": business_order_id(row),
            "record_key": key,
            "source_role": row["source_role"],
            "primary_data_source": row["data_source"],
            "source_order_line_ids": [line["id"] for line in linked if line.get("id") is not None],
            "business_time": row["pay_time"] or row["order_time"],
            "order_time": row["order_time"],
            "pay_time": row["pay_time"],
            "model_id": model.get("id"),
            "standard_model": model.get("standard_model"),
            "brand": brand,
            "category": model.get("category"),
            "business_segment": model.get("business_segment"),
            "model_match_status": row["model_match_status"],
            "model_match_method": row["model_match_method"],
            "model_match_candidates": row["model_match_candidates"],
            "raw_product_summary": row["product_name"] or row["raw_model_hint"],
            "sales_quantity": row["quantity"],
            "sales_amount": amount,
            "amount_source": source,
            "eligibility_status": eligibility,
            "exclusion_reason": reason,
            "notices": notices,
            "province": row["province"],
            "city": row["city"],
            "raw_order_status": row["raw_order_status"],
            "erp_enriched": row["erp_enriched"],
            "last_batch_id": max(line.get("last_batch_id", 0) for line in linked),
        }

    def records(self, order_lines):
        if not order_lines:
            return []
        priority = max(ROLE_PRIORITY[line["source_role"]] for line in order_lines)
        lines = [line for line in order_lines if ROLE_PRIORITY[line["source_role"]] == priority]
        rule = self.rules["jd_whole_unit_merge"]
        if lines[0]["platform"] == "jd" and priority == ROLE_PRIORITY[DIRECT] and rule["enabled"]:
            return self.jd_records(lines, rule["config_json"])
        return [self.record(line, [line], line["line_key"]) for line in lines]

    def jd_records(self, lines, config):
        keyword = config["exclude_outdoor_keyword"]
        mains = [line for line in lines if not keyword or keyword not in line["product_name"]]
        mains = mains or lines[:1]
        jd_closed = any(has_text(line["raw_order_status"], ("取消", "关闭", "删除")) for line in lines)
        if config["prefer_positive_amount_main_row"]:
            field = config["amount_field"]
            mains.sort(key=lambda row: (money_or_none(row[field]) or ZERO) > ZERO, reverse=True)
        self.merged_orders += 1
        if len({self.jd_product(line) for line in mains}) == 1:
            primary = mains[0]
            linked = [primary, *(line for line in lines if line is not primary)]
            return [self.record(primary, linked, "whole_unit", jd=True, jd_closed=jd_closed)]
        return [
            self.record(
                line,
                [
                    line,
                    *(part for part in lines
                      if part not in mains and self.jd_product(part) == self.jd_product(line)),
                ],
                line["line_key"],
                jd=True,
                jd_closed=jd_closed,
            )
            for line in mains
        ]

    @staticmethod
    def jd_product(line):
        return line["resolved_model_id"] or text_key(
            line["product_id"] or line["sku_code"] or line["product_name"]
        )


def sales_counts(records):
    statuses = Counter(row["eligibility_status"] for row in records)
    return {
        "effective_rows": statuses["valid"],
        "excluded_rows": statuses["excluded"],
        "pending_model_rows": sum(row["model_match_status"] in PENDING_MODEL_STATUSES for row in records),
        "enriched_rows": sum(bool(row["erp_enriched"]) for row in records),
    }
