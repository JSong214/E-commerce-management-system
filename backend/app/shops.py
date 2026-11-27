from collections import defaultdict
from typing import Annotated, Literal

from fastapi import APIRouter, Response
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError

from .configurations import configuration_write
from .db import Db, get_record, record_json
from .domain import (
    BooleanFlag, DataSource, Name, OperatorType, Platform, RecordId, SalesMode, ShopStatus,
)
from .errors import ApiError

router = APIRouter(prefix="/shops", tags=["Shops"])
SHOP_FLAGS = (
    "is_active", "erp_sales_enabled", "zero_received_use_paid", "preserve_full_product_name",
)


class ShopBinding(BaseModel):
    shop_name: Name
    platform: Platform


class ShopInput(ShopBinding):
    operator_type: OperatorType = "self_operated"
    entity_name: Annotated[str, StringConstraints(strip_whitespace=True, max_length=128)] | None = None
    sales_mode: SalesMode | None = None
    shop_status: ShopStatus = "active"
    default_data_source: DataSource | None = None
    is_active: BooleanFlag = True
    erp_sales_enabled: BooleanFlag = False
    zero_received_use_paid: BooleanFlag = False
    preserve_full_product_name: BooleanFlag = False
    notes: Annotated[str, StringConstraints(max_length=512)] | None = None

    def values(self, *, updating=False):
        values = self.model_dump(exclude_unset=updating, exclude={"is_active"})
        if "shop_status" not in self.model_fields_set:
            values["shop_status"] = "active" if self.is_active else "inactive"
        values["is_active"] = values["shop_status"] == "active"
        return values


class ShopBindings(BaseModel):
    items: list[ShopBinding] = Field(min_length=1)


class AliasInput(BaseModel):
    alias_name: Name
    source_hint: DataSource | Literal["*"] | None = None


def alias_json(row):
    return {field: row[field] for field in ("id", "shop_id", "alias_name", "source_hint")}


def shop_aliases(conn, table, shop_ids):
    result = defaultdict(list)
    for row in conn.execute(
        select(table).where(table.c.shop_id.in_(shop_ids)).order_by(table.c.id)
    ).mappings():
        result[row["shop_id"]].append(alias_json(row))
    return result


def shop_json(row, aliases=()):
    return {**record_json(row, flags=SHOP_FLAGS), "aliases": list(aliases)}


@router.get("")
def list_shops(
    db: Db,
    platform: Platform | None = None,
    operator_type: OperatorType | None = None,
    sales_mode: SalesMode | None = None,
    shop_status: ShopStatus | None = None,
    erp_sales_enabled: bool | None = None,
    keyword: str | None = None,
):
    shops = db.tables["shops"]
    aliases = db.tables["shop_aliases"]
    filters = [
        shops.c[field] == value
        for field, value in (
            ("platform", platform), ("operator_type", operator_type),
            ("sales_mode", sales_mode), ("shop_status", shop_status),
            ("erp_sales_enabled", erp_sales_enabled),
        )
        if value is not None
    ]
    if keyword and (term := keyword.strip()):
        filters.append(or_(
            shops.c.shop_name.contains(term, autoescape=True),
            shops.c.entity_name.contains(term, autoescape=True),
            select(aliases.c.id).where(
                aliases.c.shop_id == shops.c.id,
                aliases.c.alias_name.contains(term, autoescape=True),
            ).exists(),
        ))
    summary = dict.fromkeys(("total", "active", "dormant", "inactive", "erp_sales_enabled"), 0)
    with db.engine.connect() as conn:
        rows = conn.execute(select(shops).where(*filters).order_by(shops.c.id)).mappings().all()
        by_shop = shop_aliases(conn, aliases, [row["id"] for row in rows])
        for status, enabled, count in conn.execute(
            select(shops.c.shop_status, shops.c.erp_sales_enabled, func.count())
            .group_by(shops.c.shop_status, shops.c.erp_sales_enabled)
        ):
            summary[status] += count
            summary["total"] += count
            if enabled:
                summary["erp_sales_enabled"] += count
    return {"items": [shop_json(row, by_shop[row["id"]]) for row in rows], "summary": summary}


def insert_shop(conn, table, values):
    row = conn.execute(table.insert().values(**values))
    return shop_json(get_record(conn, table, row.lastrowid))


@router.post("", status_code=201)
def create_shop(body: ShopInput, db: Db):
    table = db.tables["shops"]
    with configuration_write(db, "DUPLICATE_SHOP", "店铺名称已存在") as conn:
        return insert_shop(conn, table, body.values())


@router.post("/batch-bind", status_code=201)
def batch_bind_shops(body: ShopBindings, db: Db):
    table = db.tables["shops"]
    with configuration_write(db, "DUPLICATE_SHOP", "店铺名称已存在") as conn:
        return {"items": [insert_shop(conn, table, shop.model_dump()) for shop in body.items]}


@router.put("/{id}")
def update_shop(id: RecordId, body: ShopInput, db: Db):
    table = db.tables["shops"]
    with configuration_write(db, "DUPLICATE_SHOP", "店铺名称已存在") as conn:
        get_record(conn, table, id, lock=True)
        conn.execute(table.update().where(table.c.id == id).values(**body.values(updating=True)))
        aliases = shop_aliases(conn, db.tables["shop_aliases"], [id])
        return shop_json(get_record(conn, table, id), aliases[id])


@router.delete("/{id}", status_code=204)
def delete_shop(id: RecordId, db: Db):
    shops = db.tables["shops"]
    mappings = db.tables["product_channel_mappings"]
    try:
        with db.engine.begin() as conn:
            get_record(conn, shops, id, lock=True)
            if conn.scalar(select(
                select(mappings.c.id).where(mappings.c.shop_scope_id == id).exists()
            )):
                raise ApiError(409, "SHOP_IN_USE", "此店铺已有渠道 ID 映射")
            conn.execute(shops.delete().where(shops.c.id == id))
    except IntegrityError as exc:
        if exc.orig.args[0] == 1451:
            raise ApiError(409, "SHOP_IN_USE", "此店铺已有订单记录") from exc
        raise
    return Response(status_code=204)


@router.post("/{shop_id}/aliases", status_code=201)
def create_alias(shop_id: RecordId, body: AliasInput, db: Db):
    table = db.tables["shop_aliases"]
    with configuration_write(db, "ALIAS_ALREADY_EXISTS", "店铺别名已存在") as conn:
        get_record(conn, db.tables["shops"], shop_id, lock=True)
        result = conn.execute(table.insert().values(shop_id=shop_id, **body.model_dump()))
        return alias_json(get_record(conn, table, result.lastrowid))


@router.delete("/aliases/{alias_id}", status_code=204)
def delete_alias(alias_id: RecordId, db: Db):
    table = db.tables["shop_aliases"]
    with db.engine.begin() as conn:
        get_record(conn, table, alias_id, lock=True)
        conn.execute(table.delete().where(table.c.id == alias_id))
    return Response(status_code=204)
