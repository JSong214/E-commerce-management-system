from sqlalchemy.dialects.mysql import insert

from .db import Database

TAOBAO_HEADERS = [
    "子订单编号",
    "主订单编号",
    "买家应付货款",
    "买家实付金额",
    "订单创建时间",
]
TAOBAO_MAPPING = {
    "platform_order_id": "主订单编号",
    "sub_order_id": "子订单编号",
    "order_time": "订单创建时间",
    "pay_time": "订单付款时间",
    "ship_time": "发货时间",
    "finish_time": "确认收货时间",
    "product_id": "商品ID",
    "sku_code": "商家编码",
    "product_name": "商品标题",
    "sku_spec": "商品属性",
    "unit_price": "商品价格",
    "quantity": "购买数量",
    "gross_amount": "买家应付货款",
    "paid_amount": "买家实付金额",
    "refund_amount": "退款金额",
    "refund_status": "退款状态",
    "raw_order_status": "订单状态",
    "seller_note": "商家备注",
    "buyer_note": "主订单买家留言",
}

PRESETS = [
    {
        "code": "jd_orders",
        "name": "京东订单明细（标准）",
        "data_source": "jd",
        "default_platform": "jd",
        "header_fingerprint": ["订单号", "京东价", "商家应收", "商家SKUID", "应付金额"],
        "column_mapping": {
            "platform_order_id": "订单号",
            "order_time": "下单时间",
            "pay_time": "付款确认时间",
            "ship_time": "订单出库时间",
            "finish_time": "订单完成时间",
            "product_id": "商品ID",
            "sku_code": "商家SKUID",
            "product_name": "商品名称",
            "quantity": "订购数量",
            "unit_price": "京东价",
            "gross_amount": "订单金额",
            "paid_amount": "商家应收",
            "payable_amount": "应付金额",
            "shipping_fee": "运费金额",
            "raw_order_status": "订单状态",
            "seller_note": "商家备注",
            "buyer_note": "订单备注",
        },
        "rules": {
            "prorate_order_amount": True,
            "prorate_weight_field": "unit_price",
            "gross_amount_from_unit_price": True,
        },
    },
    {
        "code": "pdd_orders",
        "name": "拼多多订单明细",
        "data_source": "pdd",
        "default_platform": "pdd",
        "header_fingerprint": [
            "商品总价(元)",
            "用户实付金额(元)",
            "商家实收金额(元)",
            "商家编码-规格维度",
            "订单成交时间",
        ],
        "column_mapping": {
            "platform_order_id": "订单号",
            "order_time": "订单成交时间",
            "pay_time": "订单成交时间",
            "ship_time": "发货时间",
            "finish_time": "确认收货时间",
            "product_id": "商品id",
            "sku_code": ["商家编码-规格维度", "商家编码-商品维度"],
            "product_name": "商品",
            "sku_spec": "商品规格",
            "quantity": "商品数量(件)",
            "gross_amount": "商品总价(元)",
            "paid_amount": "商家实收金额(元)",
            "shipping_fee": "邮费(元)",
            "discount_amount": [
                "店铺优惠折扣(元)",
                "平台优惠折扣(元)",
                "多多支付立减金额(元)",
            ],
            "raw_order_status": "订单状态",
            "refund_status": "售后状态",
            "seller_note": "商家备注",
        },
        "rules": {
            "sum_discount_columns": True,
            "derive_order_time_from_pdd_order_id": True,
            "infer_full_refund_from_status": True,
        },
    },
    {
        "code": "taobao_tmall_orders",
        "name": "淘宝订单明细",
        "data_source": "taobao",
        "default_platform": "taobao",
        "header_fingerprint": TAOBAO_HEADERS,
        "column_mapping": TAOBAO_MAPPING,
        "rules": {
            "extract_bybt_supply_price": True,
            "infer_full_refund_from_status": True,
        },
    },
    {
        "code": "tmall_orders",
        "name": "天猫订单明细",
        "data_source": "tmall",
        "default_platform": "tmall",
        "header_fingerprint": TAOBAO_HEADERS,
        "column_mapping": TAOBAO_MAPPING,
        "rules": {
            "extract_bybt_supply_price": True,
            "infer_full_refund_from_status": True,
        },
    },
    {
        "code": "tmall_erp_a",
        "name": "天猫 ERP A",
        "data_source": "tmall",
        "default_platform": "tmall",
        "header_fingerprint": ["系统单号", "发货LP号", "分销商店铺名称", "实收金额"],
        "column_mapping": {
            "shop_name": "分销商店铺名称",
            "platform_order_id": ["交易订单号", "外部订单号", "分销订单号", "系统单号"],
            "external_order_id": "发货LP号",
            "internal_order_id": "系统单号",
            "order_time": "下单时间",
            "pay_time": "支付时间",
            "ship_time": "发货时间",
            "finish_time": "签收时间",
            "sku_code": ["商品编码", "货品编码"],
            "product_name": "商品名称",
            "raw_model_hint": "型号",
            "quantity": "订货数量",
            "paid_amount": "实收金额",
            "is_gift": "赠品标识",
            "order_type": "订单类型",
            "raw_order_status": "状态",
            "refund_status": "退款",
            "province": "省",
            "city": "市",
            "seller_note": "卖家备注",
        },
        "rules": {},
    },
    {
        "code": "douyin_orders",
        "name": "抖音订单明细",
        "data_source": "douyin",
        "default_platform": "douyin",
        "header_fingerprint": [
            "选购商品",
            "订单应付金额",
            "订单提交时间",
            "支付完成时间",
            "达人ID",
        ],
        "column_mapping": {
            "platform_order_id": "主订单编号",
            "sub_order_id": "子订单编号",
            "order_time": "订单提交时间",
            "pay_time": "支付完成时间",
            "ship_time": "发货时间",
            "finish_time": "订单完成时间",
            "product_id": "商品ID",
            "sku_code": "商家编码",
            "product_name": "选购商品",
            "sku_spec": "商品规格",
            "unit_price": "商品单价",
            "quantity": "商品数量",
            "paid_amount": "订单应付金额",
            "discount_amount": "优惠总金额",
            "shipping_fee": "运费",
            "raw_order_status": "订单状态",
            "refund_status": "售后状态",
            "province": "省",
            "city": "市",
            "seller_note": "商家备注",
            "buyer_note": "买家留言",
        },
        "rules": {"infer_full_refund_from_status": True},
    },
    {
        "code": "jushuitan_erp_a",
        "name": "聚水潭 ERP A",
        "data_source": "jushuitan",
        "default_platform": None,
        "header_fingerprint": [
            "店铺名称",
            "系统单号",
            "外部订单号",
            "货品编码",
            "商品小计",
            "赠品标识",
        ],
        "column_mapping": {
            "shop_name": ["店铺名称", "分销商店铺名称"],
            "platform_order_id": ["外部订单号", "交易订单号", "系统单号"],
            "external_order_id": "外部订单号",
            "internal_order_id": "系统单号",
            "order_time": "下单时间",
            "pay_time": "支付时间",
            "ship_time": "发货时间",
            "finish_time": "签收时间",
            "sku_code": ["商品编码", "货品编码", "货号"],
            "product_name": "商品名称",
            "order_type": "订单类型",
            "raw_model_hint": ["标准商品名", "型号", "款号"],
            "quantity": "订货数量",
            "unit_price": "商品售价",
            "gross_amount": "商品总售价",
            "paid_amount": ["实收金额", "商品小计"],
            "erp_paid_amount": "已付金额",
            "discount_amount": "商品优惠",
            "shipping_fee": "快递费用",
            "is_gift": "赠品标识",
            "raw_order_status": "状态",
            "refund_status": "退款",
            "province": "省",
            "city": "市",
            "seller_note": "卖家备注",
        },
        "rules": {"infer_full_refund_from_status": True},
    },
    {
        "code": "jushuitan_erp_b",
        "name": "聚水潭 ERP B",
        "data_source": "jushuitan",
        "default_platform": None,
        "header_fingerprint": [
            "内部订单号",
            "线上订单号",
            "标准商品名",
            "线上子订单编号",
            "买家实付金额",
            "是否赠品",
        ],
        "column_mapping": {
            "shop_name": "店铺名称",
            "platform_order_id": ["线上订单号", "原始线上订单号", "内部订单号"],
            "sub_order_id": ["线上子订单编号", "子订单编号"],
            "external_order_id": "原始线上订单号",
            "internal_order_id": "内部订单号",
            "order_time": "下单时间",
            "pay_time": "付款日期",
            "ship_time": "发货日期",
            "finish_time": "确认收货时间",
            "product_id": ["店铺款式编码", "款号"],
            "sku_code": ["原始商品编码", "商品编码", "店铺商品编码"],
            "product_name": ["商品名称", "标准商品名"],
            "raw_model_hint": ["标准商品名", "款号"],
            "order_type": "订单类型",
            "sku_spec": "颜色及规格",
            "quantity": "数量",
            "unit_price": "商品单价",
            "gross_amount": ["商品金额", "原价"],
            "paid_amount": ["卖家实收金额", "卖家实收", "买家实付金额", "买家实付"],
            "erp_paid_amount": "已付金额",
            "payable_amount": "应付金额",
            "discount_amount": "抵扣金额",
            "shipping_fee": "运费",
            "refund_amount": "订单退款金额",
            "refund_status": "退款状态",
            "is_gift": "是否赠品",
            "raw_order_status": ["子订单状态", "状态"],
            "province": "省份",
            "city": "城市",
        },
        "rules": {},
    },
]

SALES_RULES = [
    (
        "min_sales_amount", "最低销售额", "eligibility",
        {"threshold": "400.00", "exclude_reason": "BELOW_MIN_AMOUNT"},
        "低于门槛的记录不计入有效销售",
    ),
    (
        "taobao_subsidy_fallback", "淘宝百亿补贴与低金额提示", "amount",
        {
            "primary_column": "买家实付金额",
            "subsidy_column": "百亿补贴超链订单信息",
            "low_amount_notice_threshold": "1000.00",
        },
        "买家实付为空或为零时取供货单价乘以数量",
    ),
    (
        "jd_whole_unit_merge", "京东整机合并", "jd_merge",
        {
            "amount_field": "payable_amount",
            "exclude_outdoor_keyword": "外机",
            "prefer_positive_amount_main_row": True,
        },
        "以非外机主行的应付金额和数量生成整机销售记录",
    ),
    (
        "zero_received_use_paid", "零实收取已付金额", "amount",
        {"brand_aliases": {"苹果手机": "苹果"}},
        "对开启该开关的店铺使用已付金额并统一品牌别名",
    ),
    (
        "exclude_reship_and_price_diff", "排除补发与补收差价", "eligibility",
        {"reship_order_types": ["补发", "补发订单"], "price_diff_keywords": ["补收差价"]},
        "保留原始订单行并排除对应有效销售",
    ),
    (
        "erp_source_priority", "ERP 补全优先级", "source_priority",
        {
            "default_erp_mode": "enrich_only",
            "enrich_fields": ["province", "city", "raw_model_hint", "erp_raw_status"],
            "never_overwrite_direct_fields": [
                "paid_amount", "payable_amount", "quantity", "pay_time", "raw_order_status"
            ],
        },
        "ERP 只填补直出订单的空字段",
    ),
    (
        "tmall_order_id_priority", "天猫单号优先级", "source_priority",
        {
            "prefer_lp_prefix": "LP",
            "fallback_order": ["交易订单号", "外部订单号", "分销订单号"],
            "fixed_shop_name": "天猫优品",
        },
        "优先使用发货 LP 号，其次按配置查找业务单号",
    ),
]

SEED_STATUSES = {
    "completed": [
        "完成",
        "已完成",
        "交易成功",
        "已签收",
        "已收货",
        "确认收货",
        "TRADE_FINISHED",
    ],
    "shipped": [
        "等待确认收货",
        "已发货",
        "卖家已发货",
        "卖家已发货，等待买家确认",
        "已发货，待收货",
        "待收货",
        "发货中",
        "已出库",
        "已揽收",
        "线上发货",
    ],
    "paid_unshipped": [
        "等待出库",
        "等待发货",
        "等待卖家发货",
        "买家已付款",
        "买家已付款,等待卖家发货",
        "买家已付款，等待卖家发货",
        "待发货",
        "已付款",
        "备货中",
        "待成团",
        "异常",
    ],
    "pending_pay": ["等待付款", "待付款", "未付款", "等待买家付款"],
    "closed_cancelled": [
        "(删除)等待出库",
        "(删除)暂停",
        "(删除)等待确认收货",
        "(删除)延迟付款确认",
        "(删除)货到付款退货",
        "已取消",
        "交易关闭",
        "已关闭",
        "关闭",
        "取消",
        "订单关闭",
        "发货后取消",
        "付款前交易关闭",
        "付款后交易关闭",
        "未发货，退款成功",
        "已发货，退款成功",
        "已收货，退款成功",
    ],
}


def seed(database: Database):
    templates = database.tables["mapping_templates"]
    statuses = database.tables["status_mappings"]
    rules = database.tables["sales_rules"]
    template_stmt = insert(templates)
    with database.engine.begin() as conn:
        conn.execute(
            template_stmt.on_duplicate_key_update(
                name=template_stmt.inserted.name,
                header_fingerprint=template_stmt.inserted.header_fingerprint,
                column_mapping=template_stmt.inserted.column_mapping,
                rules=template_stmt.inserted.rules,
                default_platform=template_stmt.inserted.default_platform,
            ),
            [{**template, "is_builtin": True} for template in PRESETS],
        )
        conn.execute(
            insert(statuses).on_duplicate_key_update(
                normalized_status=statuses.c.normalized_status
            ),
            [
                {
                    "data_source": "*",
                    "raw_status": raw_status,
                    "normalized_status": normalized,
                    "is_valid_for_gmv": normalized != "pending_pay"
                    and not raw_status.startswith("(删除)"),
                }
                for normalized, values in SEED_STATUSES.items()
                for raw_status in values
            ],
        )
        conn.execute(
            insert(rules).on_duplicate_key_update(rule_key=rules.c.rule_key),
            [
                {
                    "rule_key": key,
                    "rule_name": name,
                    "rule_group": group,
                    "config_json": config,
                    "description": description,
                }
                for key, name, group, config, description in SALES_RULES
            ],
        )


if __name__ == "__main__":
    from .env import get_database_url

    url = get_database_url()
    if not url:
        raise RuntimeError(
            "请配置 DATABASE_URL 或在 backend/.env 中设置 MYSQL_USER 和 MYSQL_PASSWORD"
        )
    database = Database(url)
    try:
        seed(database)
    finally:
        database.close()
