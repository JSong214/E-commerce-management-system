from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    StrictBool,
    StringConstraints,
)

DataSource = Literal["taobao", "tmall", "douyin", "jd", "pdd", "jushuitan", "custom"]
Platform = Literal["taobao", "tmall", "douyin", "jd", "pdd", "other"]
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
    "order_time",
    "pay_time",
    "ship_time",
    "finish_time",
    "product_id",
    "sku_code",
    "product_name",
    "sku_spec",
    "is_gift",
    "quantity",
    "unit_price",
    "gross_amount",
    "discount_amount",
    "shipping_fee",
    "paid_amount",
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
