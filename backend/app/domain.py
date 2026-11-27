from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    StrictBool,
    StringConstraints,
)

DataSource = Literal[
    "taobao", "tmall", "douyin", "jd", "pdd", "jushuitan", "manual", "custom"
]
Platform = Literal["taobao", "tmall", "douyin", "jd", "pdd", "huanxin", "other"]
OperatorType = Literal["self_operated", "agency_operated"]
SalesMode = Literal["dealer", "distribution", "hybrid"]
ShopStatus = Literal["active", "dormant", "inactive"]
UnitType = Literal["indoor", "outdoor"]
ChannelType = Literal[
    "jst_i_id", "jst_sku_id", "pdd_sku_id", "tb_sku_id", "tm_sku_id",
    "dy_sku_id", "jd_sku_id", "merchant_code", "custom_title",
]
MatchSource = Literal["excel_import", "manual", "learned_from_review"]
SourceRole = Literal["direct_sales", "erp_enrich", "erp_independent_sales"]
ModelMatchStatus = Literal["matched", "ambiguous", "unmatched", "manual_confirmed"]
EligibilityStatus = Literal["valid", "excluded", "needs_review"]
EffectiveTimeBasis = Literal["business_time", "order_time", "pay_time"]
NormalizedStatus = Literal[
    "pending_pay", "paid_unshipped", "shipped", "completed", "closed_cancelled"
]
TimeBasis = Literal["order_time", "pay_time"]
DuplicateStrategy = Literal["upsert", "skip"]
BatchStatus = Literal["committed", "rolled_back"]
RecordId = Annotated[int, Field(gt=0, le=2**64 - 1)]

MappableField = Literal[
    "shop_name",
    "platform_order_id",
    "sub_order_id",
    "external_order_id",
    "internal_order_id",
    "order_time",
    "pay_time",
    "ship_time",
    "finish_time",
    "product_id",
    "sku_code",
    "product_name",
    "sku_spec",
    "raw_model_hint",
    "order_type",
    "is_gift",
    "quantity",
    "unit_price",
    "gross_amount",
    "discount_amount",
    "shipping_fee",
    "paid_amount",
    "payable_amount",
    "erp_paid_amount",
    "refund_amount",
    "raw_order_status",
    "refund_status",
    "province",
    "city",
    "seller_note",
    "buyer_note",
]
Name = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=128)
]
Header = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
ColumnMapping = dict[
    MappableField, Header | Annotated[list[Header], Field(min_length=1)]
]


def flag_from_int(value):
    if type(value) is int and value in (0, 1):
        return bool(value)
    return value


BooleanFlag = Annotated[StrictBool, BeforeValidator(flag_from_int)]


class TemplateRules(BaseModel):
    model_config = ConfigDict(extra="allow")

    prorate_order_amount: BooleanFlag = False
    prorate_weight_field: Literal["unit_price"] = "unit_price"
    pii_columns: list[Header] = Field(default_factory=list)
    gross_amount_from_unit_price: BooleanFlag = False
    sum_discount_columns: BooleanFlag = False
    derive_order_time_from_pdd_order_id: BooleanFlag = False
    extract_bybt_supply_price: BooleanFlag = False
    infer_full_refund_from_status: BooleanFlag = False
