import json
from collections import Counter
from dataclasses import dataclass
from decimal import Decimal
from hashlib import sha256
from typing import Annotated, Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import select
from sqlalchemy.dialects.mysql import insert

from .batch_writes import batch_transaction, recompute_orders
from .db import Db, get_record
from .domain import BooleanFlag, ChannelType, DataSource, Platform, RecordId
from .effective_sales import Keyword, source_lines_by_id
from .errors import ApiError
from .ingestion_sources import affected_business_keys, normalized_key, order_key, shop_lookup
from .order_filters import PageNumber, PageSize
from .order_lines import MATCH_CHUNK_SIZE, chunks
from .product_matching import PENDING_MODEL_STATUSES, ChannelKey, ProductMatcher, channel_keys, text_key
from .products import SecondaryId
from .sales_rules import load_rules

router = APIRouter(prefix="/model-review", tags=["Model Review"])
GROUP_FIELDS = (
    "data_source", "shop_id", "channel_type", "external_id",
    "secondary_external_id", "raw_product_summary",
)


class PendingFilters(BaseModel):
    status: Literal["ambiguous", "unmatched", "all"] = "all"
    platform: Platform | None = None
    shop_id: RecordId | None = None
    data_source: DataSource | None = None
    eligibility_status: Literal["valid", "all"] = "all"
    keyword: Keyword | None = None
    page: PageNumber = 1
    page_size: PageSize = 50


class GroupFilter(BaseModel):
    data_source: DataSource
    shop_id: RecordId
    channel_type: ChannelType | None = None
    external_id: SecondaryId | None = None
    secondary_external_id: SecondaryId = ""
    raw_product_summary: Annotated[str, StringConstraints(max_length=512)] | None = None


class ResolveRequest(BaseModel):
    record_ids: list[RecordId] = Field(default_factory=list)
    group_filter: GroupFilter | None = None
    model_id: RecordId
    save_as_mapping_rule: BooleanFlag = False
    rule_scope: Literal["shop", "global"] | None = None


@dataclass(frozen=True)
class PendingRecord:
    row: dict
    lines: list
    key: ChannelKey | None

    @property
    def group_values(self):
        return {
            "data_source": self.row["primary_data_source"],
            "shop_id": self.row["shop_id"],
            "channel_type": self.key.channel_type if self.key else None,
            "external_id": self.key.external_id if self.key else None,
            "secondary_external_id": self.key.secondary_external_id if self.key else "",
            "raw_product_summary": self.row["raw_product_summary"],
        }


def rows_by_id(conn, table, conditions):
    after = 0
    while True:
        part = conn.execute(
            select(table).where(*conditions, table.c.id > after)
            .order_by(table.c.id).limit(MATCH_CHUNK_SIZE)
        ).mappings().all()
        if not part:
            return
        yield part
        if len(part) < MATCH_CHUNK_SIZE:
            return
        after = part[-1]["id"]


def pending_records(conn, tables, shops, conditions=()):
    table = tables["effective_sales_records"]
    query_conditions = [table.c.model_match_status.in_(PENDING_MODEL_STATUSES), *conditions]
    matcher = None
    for part in rows_by_id(conn, table, query_conditions):
        sources = source_lines_by_id(
            conn, tables["order_lines"],
            [id for row in part for id in row["source_order_line_ids"]],
        )
        for row in part:
            linked = [sources[id] for id in row["source_order_line_ids"] if id in sources]
            key = None
            if linked:
                primary = linked[0]
                full_name = bool(shops[row["shop_id"]]["preserve_full_product_name"])
                keys = channel_keys(primary, full_name=full_name)
                matching_method = [key for key in keys if key.channel_type == row["model_match_method"]]
                key = next(iter(matching_method or keys), None)
                if len(matching_method) > 1:
                    if matcher is None:
                        matcher = ProductMatcher(conn, tables)
                    current = matcher.match(primary, shops[row["shop_id"]])
                    if current.channel_key in matching_method:
                        key = current.channel_key
            yield PendingRecord(row, linked, key)


def pending_conditions(table, filters):
    return [
        table.c[field] == value
        for field, value in (
            ("model_match_status", filters.status), ("platform", filters.platform),
            ("shop_id", filters.shop_id), ("primary_data_source", filters.data_source),
            ("eligibility_status", filters.eligibility_status),
        )
        if value is not None and value != "all"
    ]


def group_identity(values):
    return normalized_key(tuple(values[field] if values[field] is not None else "" for field in GROUP_FIELDS))


@router.get("/pending")
def list_pending_models(filters: Annotated[PendingFilters, Query()], db: Db):
    tables = db.tables
    table = tables["effective_sales_records"]
    groups = {}
    totals = Counter()
    keyword = text_key(filters.keyword)
    with db.engine.connect() as conn:
        shops = shop_lookup(conn, tables)
        for pending in pending_records(conn, tables, shops, pending_conditions(table, filters)):
            row = pending.row
            values = pending.group_values
            hint = pending.lines[0]["raw_model_hint"] if pending.lines else None
            if keyword and not any(keyword in text_key(value) for value in (
                values["external_id"], values["secondary_external_id"], row["raw_product_summary"], hint,
            )):
                continue
            identity = group_identity(values)
            status = row["model_match_status"]
            if identity not in groups:
                groups[identity] = {
                    **values, "platform": row["platform"], "shop_name": row["shop_name"],
                    "group_key": sha256(json.dumps(identity, ensure_ascii=False).encode()).hexdigest(),
                    "raw_model_hint": hint, "model_match_status": status, "candidates": {},
                    "affected_record_count": 0, "valid_record_count": 0,
                    "total_sales_amount": Decimal("0.00"), "sample_record_ids": [],
                }
            group = groups[identity]
            group["affected_record_count"] += 1
            group["valid_record_count"] += row["eligibility_status"] == "valid"
            group["total_sales_amount"] += row["sales_amount"]
            if status == "ambiguous":
                group["model_match_status"] = status
            for candidate in row["model_match_candidates"] or ():
                group["candidates"][candidate["model_id"]] = candidate
            if len(group["sample_record_ids"]) < 3:
                group["sample_record_ids"].append(row["id"])
            totals[status] += 1

    ordered = sorted(groups.values(), key=lambda group: (-group["affected_record_count"], group["group_key"]))
    offset = (filters.page - 1) * filters.page_size
    result = ordered[offset : offset + filters.page_size]
    for group in result:
        group["total_sales_amount"] = f"{group['total_sales_amount']:.2f}"
        group["candidates"] = list(group["candidates"].values())
    return {
        "groups": result,
        "total_groups": len(ordered),
        "total_pending_records": sum(totals.values()),
        "ambiguous_records": totals["ambiguous"],
        "unmatched_records": totals["unmatched"],
    }


def review_targets(conn, tables, shops, body):
    table = tables["effective_sales_records"]
    if body.record_ids:
        return [
            pending
            for part in chunks(sorted(set(body.record_ids)))
            for pending in pending_records(conn, tables, shops, [table.c.id.in_(part)])
        ]
    group = body.group_filter
    identity = group_identity(group.model_dump())
    conditions = [table.c.primary_data_source == group.data_source, table.c.shop_id == group.shop_id]
    return [
        pending for pending in pending_records(conn, tables, shops, conditions)
        if group_identity(pending.group_values) == identity
    ]


def learn_mapping(conn, tables, targets, model, rule_scope):
    if rule_scope is None:
        rule_scope = "shop" if any(
            target.row["model_match_status"] == "ambiguous" for target in targets
        ) else "global"
    scopes = {target.row["shop_id"] if rule_scope == "shop" else 0 for target in targets}
    signatures = {normalized_key(target.key) for target in targets if target.key}
    if not model["is_active"] or len(scopes) != 1 or len(signatures) != 1 or any(
        target.key is None for target in targets
    ):
        raise ApiError(422, "INVALID_REVIEW_TARGET", "保存映射需要启用的型号和同一个渠道 ID、次级 ID 及店铺范围")

    shop_scope = scopes.pop()
    key = targets[0].key
    mappings = tables["product_channel_mappings"]
    models = tables["product_models"]
    values = {
        "channel_type": key.channel_type, "external_id": key.external_id,
        "secondary_external_id": key.secondary_external_id, "shop_scope_id": shop_scope,
    }
    scope = [mappings.c[field] == value for field, value in values.items()]
    conflict = conn.scalar(
        select(mappings.c.id).join(models, models.c.id == mappings.c.model_id)
        .where(*scope, mappings.c.is_active == 1, models.c.is_active == 1, mappings.c.model_id != model["id"])
        .limit(1)
    )
    if conflict is not None:
        raise ApiError(409, "MAPPING_RULE_CONFLICT", "此范围已有其他启用型号，请调整已有映射或选择更具体的范围")
    learned = {"match_source": "learned_from_review", "is_active": True}
    statement = insert(mappings).values(**values, model_id=model["id"], **learned)
    conn.execute(statement.on_duplicate_key_update(**learned))
    saved_id = conn.scalar(select(mappings.c.id).where(*scope, mappings.c.model_id == model["id"]))
    return saved_id, shop_scope, key


def matching_pending_lines(conn, tables, shops, scope, key, model_id):
    lines = tables["order_lines"]
    matcher = ProductMatcher(conn, tables)
    conditions = [lines.c.model_match_status.in_(PENDING_MODEL_STATUSES)]
    if scope:
        conditions.append(lines.c.shop_id == scope)
    for part in rows_by_id(conn, lines, conditions):
        for row in part:
            match = matcher.match(row, shops[row["shop_id"]])
            match_key = match.channel_key
            if (
                match.model_id == model_id and match_key
                and match_key.channel_type == key.channel_type
                and text_key(match_key.external_id) == text_key(key.external_id)
                and (not key.secondary_external_id
                     or text_key(match_key.secondary_external_id) == text_key(key.secondary_external_id))
            ):
                yield row


@router.post("/resolve")
def resolve_models(body: ResolveRequest, db: Db):
    if not body.record_ids and body.group_filter is None:
        raise ApiError(422, "INVALID_REVIEW_TARGET", "请选择待确认记录或提供分组筛选条件")
    tables = db.tables
    with batch_transaction(db) as conn:
        model = get_record(conn, tables["product_models"], body.model_id, lock=True)
        shops = shop_lookup(conn, tables)
        targets = review_targets(conn, tables, shops, body)
        selected = {target.lines[0]["id"] for target in targets if target.lines}
        updated = {
            line["id"]: line for target in targets for line in target.lines
            if line["model_match_status"] in PENDING_MODEL_STATUSES
        }
        saved_id = None
        if targets and body.save_as_mapping_rule:
            saved_id, scope, key = learn_mapping(conn, tables, targets, model, body.rule_scope)
            for row in matching_pending_lines(conn, tables, shops, scope, key, model["id"]):
                updated[row["id"]] = row
        lines = tables["order_lines"]
        for ids in chunks(list(updated)):
            conn.execute(lines.update().where(lines.c.id.in_(ids)).values(
                resolved_model_id=model["id"], model_match_status="manual_confirmed",
                model_match_method="manual_review", model_match_candidates=None,
            ))
        rules = load_rules(conn, tables["sales_rules"])
        changed = recompute_orders(
            conn, db, {order_key(row) for row in updated.values()},
            affected_business_keys(updated.values()), rules, shops,
        )
        confirmed = [
            row["source_order_line_ids"][0] for row in changed
            if row["model_match_status"] == "manual_confirmed"
            and row["source_order_line_ids"] and row["source_order_line_ids"][0] in updated
        ]
    return {
        "resolved_effective_records": len(confirmed),
        "resolved_order_lines": len(updated),
        "saved_mapping_id": saved_id,
        "retroactively_resolved_records": sum(id not in selected for id in confirmed) if saved_id else 0,
    }
