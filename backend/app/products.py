from collections import defaultdict
from typing import Annotated

from fastapi import APIRouter, Response
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import and_, distinct, func, or_, select
from sqlalchemy.dialects.mysql import insert

from .configurations import configuration_write
from .db import Db, get_record, record_json
from .domain import BooleanFlag, ChannelType, MatchSource, RecordId, UnitType
from .order_filters import PageNumber, PageSize

router = APIRouter(prefix="/products", tags=["Products"])
ProductLabel = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]
ModelName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=191)]
SecondaryId = Annotated[str, StringConstraints(strip_whitespace=True, max_length=191)]
ShopScopeId = Annotated[int, Field(ge=0, le=2**64 - 1)]
CATEGORY_FIELDS = ("business_segment", "category", "brand")
MODEL_FLAGS = ("is_3c_full_name", "is_active")
MAPPING_KEY = (
    "model_id", "channel_type", "external_id", "secondary_external_id", "shop_scope_id",
)


class CategoryInput(BaseModel):
    business_segment: ProductLabel
    category: ProductLabel
    brand: ProductLabel
    report_brand: ProductLabel | None = None


class ModelInput(BaseModel):
    standard_model: ModelName
    business_segment: ProductLabel
    category: ProductLabel
    brand: ProductLabel
    is_3c_full_name: BooleanFlag = False
    is_active: BooleanFlag = True
    notes: Annotated[str, StringConstraints(max_length=512)] | None = None


class ComponentInput(BaseModel):
    component_model: ModelName
    unit_type: UnitType
    mapping_value: ModelName | None = None


class ChannelMappingInput(BaseModel):
    model_id: RecordId
    channel_type: ChannelType
    external_id: ModelName
    secondary_external_id: SecondaryId = ""
    shop_scope_id: ShopScopeId = 0
    match_source: MatchSource = "manual"
    is_active: BooleanFlag = True


def write_row(conn, table, values, id=None):
    if id is None:
        id = conn.execute(table.insert().values(**values)).lastrowid
    else:
        get_record(conn, table, id, lock=True)
        conn.execute(table.update().where(table.c.id == id).values(**values))
    return get_record(conn, table, id)


def delete_row(db, table_name, id):
    table = db.tables[table_name]
    with db.engine.begin() as conn:
        get_record(conn, table, id, lock=True)
        conn.execute(table.delete().where(table.c.id == id))
    return Response(status_code=204)


def category_json(row):
    return {field: row[field] for field in ("id", *CATEGORY_FIELDS, "report_brand")}


def sync_model_categories(conn, models, category):
    conn.execute(
        models.update().where(models.c.category_id == category["id"])
        .values({field: category[field] for field in CATEGORY_FIELDS})
    )


@router.get("/categories")
def list_categories(db: Db):
    table = db.tables["product_categories"]
    with db.engine.connect() as conn:
        rows = conn.execute(select(table).order_by(table.c.id)).mappings()
        return {"items": [category_json(row) for row in rows]}


def save_category(body, db, id=None):
    table = db.tables["product_categories"]
    with configuration_write(db, "CATEGORY_ALREADY_EXISTS", "品类和品牌已存在") as conn:
        row = write_row(conn, table, body.model_dump(), id)
        if id is not None:
            sync_model_categories(conn, db.tables["product_models"], row)
        return category_json(row)


@router.post("/categories", status_code=201)
def create_category(body: CategoryInput, db: Db):
    return save_category(body, db)


@router.put("/categories/{id}")
def update_category(id: RecordId, body: CategoryInput, db: Db):
    return save_category(body, db, id)


@router.delete("/categories/{id}", status_code=204)
def delete_category(id: RecordId, db: Db):
    return delete_row(db, "product_categories", id)


def mapping_conflicts(conn, tables):
    mappings = tables["product_channel_mappings"]
    models = tables["product_models"]
    global_mappings = (
        mappings.c.is_active == 1,
        mappings.c.shop_scope_id == 0,
        mappings.c.secondary_external_id == "",
    )
    conflicts = (
        select(mappings.c.channel_type, mappings.c.external_id)
        .where(*global_mappings)
        .group_by(mappings.c.channel_type, mappings.c.external_id)
        .having(func.count(distinct(mappings.c.model_id)) > 1)
        .subquery()
    )
    rows = conn.execute(
        select(
            mappings.c.id, conflicts.c.channel_type, conflicts.c.external_id,
            mappings.c.model_id, models.c.standard_model, models.c.brand, models.c.category,
        ).select_from(
            mappings.join(conflicts, and_(
                mappings.c.channel_type == conflicts.c.channel_type,
                mappings.c.external_id == conflicts.c.external_id,
            )).join(models, mappings.c.model_id == models.c.id)
        ).where(*global_mappings)
        .order_by(conflicts.c.channel_type, conflicts.c.external_id, models.c.standard_model)
    ).mappings()
    groups = defaultdict(list)
    mapping_groups = {}
    for row in rows:
        key = (row["channel_type"], row["external_id"])
        mapping_groups[row["id"]] = key
        groups[key].append({
            field: row[field] for field in ("model_id", "standard_model", "brand", "category")
        })
    return groups, mapping_groups


def mapping_query(tables):
    mappings = tables["product_channel_mappings"]
    models = tables["product_models"]
    shops = tables["shops"]
    return select(
        mappings, models.c.standard_model, models.c.brand, models.c.category,
        shops.c.shop_name.label("shop_scope_name"),
    ).select_from(
        mappings.join(models, mappings.c.model_id == models.c.id)
        .outerjoin(shops, mappings.c.shop_scope_id == shops.c.id)
    )


def mapping_json(row, mapping_groups, *, candidates=None):
    values = record_json(row, flags=("is_active",))
    values["is_ambiguous"] = row["id"] in mapping_groups
    if candidates is not None:
        values["conflict_models"] = candidates.get(mapping_groups.get(row["id"]), [])
    return values


def paginated(conn, query, order, page, page_size):
    total = conn.scalar(select(func.count()).select_from(query.subquery()))
    rows = conn.execute(
        query.order_by(order).offset((page - 1) * page_size).limit(page_size)
    ).mappings().all()
    return rows, total


@router.get("/models")
def list_models(
    db: Db,
    business_segment: str | None = None,
    category: str | None = None,
    brand: str | None = None,
    keyword: str | None = None,
    only_with_components: bool = False,
    only_ambiguous: bool = False,
    page: PageNumber = 1,
    page_size: PageSize = 50,
):
    tables = db.tables
    models = tables["product_models"]
    components = tables["product_unit_components"]
    mappings = tables["product_channel_mappings"]
    query = select(models).where(*[
        models.c[field] == value
        for field, value in zip(CATEGORY_FIELDS, (business_segment, category, brand))
        if value is not None
    ])
    if keyword and (term := keyword.strip()):
        query = query.where(or_(
            models.c.standard_model.contains(term, autoescape=True),
            models.c.brand.contains(term, autoescape=True),
        ))
    if only_with_components:
        query = query.where(select(components.c.id).where(components.c.model_id == models.c.id).exists())

    with db.engine.connect() as conn:
        groups, mapping_groups = mapping_conflicts(conn, tables)
        ambiguous_model_ids = {model["model_id"] for group in groups.values() for model in group}
        if only_ambiguous:
            query = query.where(models.c.id.in_(ambiguous_model_ids))
        rows, total = paginated(conn, query, models.c.id, page, page_size)
        ids = [row["id"] for row in rows]
        component_rows = conn.execute(
            select(components).where(components.c.model_id.in_(ids)).order_by(components.c.id)
        ).mappings()
        mapping_rows = conn.execute(
            mapping_query(tables).where(mappings.c.model_id.in_(ids)).order_by(mappings.c.id)
        ).mappings()
        by_component, by_mapping = defaultdict(list), defaultdict(list)
        for row in component_rows:
            by_component[row["model_id"]].append(record_json(row))
        for row in mapping_rows:
            by_mapping[row["model_id"]].append(mapping_json(row, mapping_groups))
        summary = {
            key: conn.scalar(select(func.count()).select_from(table))
            for key, table in (
                ("total_categories", tables["product_categories"]), ("total_models", models),
                ("total_components", components), ("total_channel_mappings", mappings),
            )
        }

    return {
        "items": [
            {
                **record_json(row, flags=MODEL_FLAGS),
                "component_count": len(by_component[row["id"]]),
                "mapping_count": len(by_mapping[row["id"]]),
                "has_ambiguous_mapping": row["id"] in ambiguous_model_ids,
                "components": by_component[row["id"]],
                "channel_mappings": by_mapping[row["id"]],
            }
            for row in rows
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
        "summary": {**summary, "ambiguous_id_groups": len(groups)},
    }


def save_model(body, db, id=None):
    models = db.tables["product_models"]
    categories = db.tables["product_categories"]
    category_values = body.model_dump(include=set(CATEGORY_FIELDS))
    with configuration_write(db, "MODEL_ALREADY_EXISTS", "标准型号已存在") as conn:
        conn.execute(insert(categories).values(**category_values).on_duplicate_key_update(id=categories.c.id))
        category = conn.execute(
            select(categories).where(categories.c.category == body.category, categories.c.brand == body.brand)
        ).mappings().one()
        values = {
            **body.model_dump(exclude_unset=id is not None),
            **{field: category[field] for field in CATEGORY_FIELDS},
            "category_id": category["id"],
        }
        return record_json(write_row(conn, models, values, id), flags=MODEL_FLAGS)


@router.post("/models", status_code=201)
def create_model(body: ModelInput, db: Db):
    return save_model(body, db)


@router.put("/models/{id}")
def update_model(id: RecordId, body: ModelInput, db: Db):
    return save_model(body, db, id)


@router.delete("/models/{id}", status_code=204)
def delete_model(id: RecordId, db: Db):
    return delete_row(db, "product_models", id)


@router.post("/models/{model_id}/components", status_code=201)
def create_component(model_id: RecordId, body: ComponentInput, db: Db):
    table = db.tables["product_unit_components"]
    with configuration_write(db, "COMPONENT_ALREADY_EXISTS", "内外机型号已存在") as conn:
        get_record(conn, db.tables["product_models"], model_id, lock=True)
        return record_json(write_row(conn, table, {**body.model_dump(), "model_id": model_id}))


@router.put("/components/{id}")
def update_component(id: RecordId, body: ComponentInput, db: Db):
    table = db.tables["product_unit_components"]
    with configuration_write(db, "COMPONENT_ALREADY_EXISTS", "内外机型号已存在") as conn:
        return record_json(write_row(conn, table, body.model_dump(), id))


@router.delete("/components/{id}", status_code=204)
def delete_component(id: RecordId, db: Db):
    return delete_row(db, "product_unit_components", id)


@router.get("/channel-mappings")
def list_channel_mappings(
    db: Db,
    channel_type: ChannelType | None = None,
    external_id: ModelName | None = None,
    model_id: RecordId | None = None,
    only_ambiguous: bool = False,
    keyword: str | None = None,
    page: PageNumber = 1,
    page_size: PageSize = 50,
):
    tables = db.tables
    mappings = tables["product_channel_mappings"]
    query = mapping_query(tables).where(*[
        mappings.c[field] == value
        for field, value in (("channel_type", channel_type), ("external_id", external_id), ("model_id", model_id))
        if value is not None
    ])
    if keyword and (term := keyword.strip()):
        query = query.where(or_(
            mappings.c.external_id.contains(term, autoescape=True),
            mappings.c.secondary_external_id.contains(term, autoescape=True),
            tables["product_models"].c.standard_model.contains(term, autoescape=True),
        ))
    with db.engine.connect() as conn:
        groups, mapping_groups = mapping_conflicts(conn, tables)
        ambiguous = query.where(mappings.c.id.in_(mapping_groups))
        group_keys = {
            mapping_groups[id] for id in conn.scalars(ambiguous.with_only_columns(mappings.c.id))
        }
        rows, total = paginated(
            conn, ambiguous if only_ambiguous else query, mappings.c.id, page, page_size
        )
    return {
        "items": [mapping_json(row, mapping_groups, candidates=groups) for row in rows],
        "total": total,
        "ambiguous_groups": [
            {"channel_type": channel, "external_id": external, "candidate_models": models}
            for (channel, external), models in groups.items()
            if (channel, external) in group_keys
        ],
    }


def save_channel_mapping(body, db, id=None):
    tables = db.tables
    table = tables["product_channel_mappings"]
    with configuration_write(db, "MAPPING_ALREADY_EXISTS", "此型号已有相同的渠道 ID 映射") as conn:
        if body.shop_scope_id:
            get_record(conn, tables["shops"], body.shop_scope_id, lock=True)
        get_record(conn, tables["product_models"], body.model_id, lock=True)
        saved = write_row(conn, table, body.model_dump(), id)
        row = conn.execute(mapping_query(tables).where(table.c.id == saved["id"])).mappings().one()
        groups, mapping_groups = mapping_conflicts(conn, tables)
        return mapping_json(row, mapping_groups, candidates=groups)


@router.post("/channel-mappings", status_code=201)
def create_channel_mapping(body: ChannelMappingInput, db: Db):
    return save_channel_mapping(body, db)


@router.put("/channel-mappings/{id}")
def update_channel_mapping(id: RecordId, body: ChannelMappingInput, db: Db):
    return save_channel_mapping(body, db, id)


@router.delete("/channel-mappings/{id}", status_code=204)
def delete_channel_mapping(id: RecordId, db: Db):
    return delete_row(db, "product_channel_mappings", id)
