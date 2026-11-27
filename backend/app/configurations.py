from contextlib import contextmanager
from typing import Annotated, Literal

from fastapi import APIRouter, Response
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import and_, select
from sqlalchemy.dialects.mysql import insert
from sqlalchemy.exc import IntegrityError

from .db import Db, get_record, record_json
from .domain import (
    BooleanFlag,
    ColumnMapping,
    DataSource,
    Header,
    Name,
    NormalizedStatus,
    Platform,
    RecordId,
    TemplateRules,
)
from .errors import ApiError

router = APIRouter(tags=["Configuration"])


class TemplateInput(BaseModel):
    code: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)
    ]
    name: Name
    data_source: DataSource
    header_fingerprint: list[Header] = Field(default_factory=list)
    column_mapping: ColumnMapping
    rules: TemplateRules = Field(default_factory=TemplateRules)
    default_platform: Platform | None = None

    def values(self):
        return {**self.model_dump(), "rules": self.rules.model_dump(exclude_unset=True)}


@contextmanager
def configuration_write(db, conflict_code, conflict_message):
    try:
        with db.engine.begin() as conn:
            yield conn
    except IntegrityError as exc:
        if exc.orig.args[0] == 1062:
            raise ApiError(409, conflict_code, conflict_message) from exc
        raise


def list_records(db, table_name, flag):
    table = db.tables[table_name]
    with db.engine.connect() as conn:
        return {
            "items": [
                record_json(row, flags=(flag,))
                for row in conn.execute(select(table).order_by(table.c.id)).mappings()
            ]
        }


def require_custom(template):
    if template["is_builtin"]:
        raise ApiError(403, "BUILTIN_READONLY", "内置模板为只读，可复制为自定义模板")


@router.get("/templates")
def list_templates(db: Db):
    return list_records(db, "mapping_templates", "is_builtin")


@router.post("/templates", status_code=201)
def create_template(body: TemplateInput, db: Db):
    table = db.tables["mapping_templates"]
    with configuration_write(db, "DUPLICATE_TEMPLATE", "模板代码已存在") as conn:
        result = conn.execute(table.insert().values(**body.values(), is_builtin=False))
        return record_json(
            get_record(conn, table, result.lastrowid), flags=("is_builtin",)
        )


@router.put("/templates/{id}")
def update_template(id: RecordId, body: TemplateInput, db: Db):
    table = db.tables["mapping_templates"]
    with configuration_write(db, "DUPLICATE_TEMPLATE", "模板代码已存在") as conn:
        require_custom(get_record(conn, table, id, lock=True))
        conn.execute(table.update().where(table.c.id == id).values(**body.values()))
        return record_json(get_record(conn, table, id), flags=("is_builtin",))


@router.delete("/templates/{id}", status_code=204)
def delete_template(id: RecordId, db: Db):
    table = db.tables["mapping_templates"]
    with db.engine.begin() as conn:
        require_custom(get_record(conn, table, id, lock=True))
        conn.execute(table.delete().where(table.c.id == id))
    return Response(status_code=204)
class StatusMappingInput(BaseModel):
    data_source: DataSource | Literal["*"]
    raw_status: Name
    normalized_status: NormalizedStatus
    is_valid_for_gmv: BooleanFlag = True


class StatusMappingBatchInput(BaseModel):
    items: list[StatusMappingInput] = Field(min_length=1)


@router.get("/status-mappings")
def list_status_mappings(db: Db):
    return list_records(db, "status_mappings", "is_valid_for_gmv")


@router.post("/status-mappings", status_code=201)
def create_status_mapping(body: StatusMappingInput, db: Db):
    table = db.tables["status_mappings"]
    with configuration_write(
        db, "DUPLICATE_STATUS_MAPPING", "该来源已配置此订单状态"
    ) as conn:
        result = conn.execute(table.insert().values(**body.model_dump()))
        return record_json(
            get_record(conn, table, result.lastrowid), flags=("is_valid_for_gmv",)
        )


@router.post("/status-mappings/batch-upsert", status_code=201)
def batch_upsert_status_mappings(body: StatusMappingBatchInput, db: Db):
    table = db.tables["status_mappings"]
    stmt = insert(table)
    payloads = [item.model_dump() for item in body.items]
    with db.engine.begin() as conn:
        conn.execute(
            stmt.on_duplicate_key_update(
                normalized_status=stmt.inserted.normalized_status,
                is_valid_for_gmv=stmt.inserted.is_valid_for_gmv,
            ),
            payloads,
        )
        rows = [
            record_json(
                conn.execute(
                    select(table).where(
                        and_(
                            table.c.data_source == item["data_source"],
                            table.c.raw_status == item["raw_status"],
                        )
                    )
                )
                .mappings()
                .one(),
                flags=("is_valid_for_gmv",),
            )
            for item in payloads
        ]
    return {"items": rows}


@router.put("/status-mappings/{id}")
def update_status_mapping(id: RecordId, body: StatusMappingInput, db: Db):
    table = db.tables["status_mappings"]
    with configuration_write(
        db, "DUPLICATE_STATUS_MAPPING", "该来源已配置此订单状态"
    ) as conn:
        get_record(conn, table, id, lock=True)
        conn.execute(table.update().where(table.c.id == id).values(**body.model_dump()))
        return record_json(get_record(conn, table, id), flags=("is_valid_for_gmv",))


@router.delete("/status-mappings/{id}", status_code=204)
def delete_status_mapping(id: RecordId, db: Db):
    table = db.tables["status_mappings"]
    with db.engine.begin() as conn:
        get_record(conn, table, id, lock=True)
        conn.execute(table.delete().where(table.c.id == id))
    return Response(status_code=204)
