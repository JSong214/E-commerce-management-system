import logging
import re
from contextlib import contextmanager
from hashlib import sha256

from pydantic import BaseModel
from sqlalchemy import func, literal, select
from sqlalchemy.dialects.mysql import insert
from sqlalchemy.exc import SQLAlchemyError

from .db import get_record, record_json
from .domain import BooleanFlag, DuplicateStrategy
from .errors import ApiError
from .import_validation import prepare_validation
from .order_lines import chunks, identity_matches, identity_table, restore_types

logger = logging.getLogger(__name__)


class CommitRequest(BaseModel):
    validation_id: str
    duplicate_strategy: DuplicateStrategy = "upsert"
    skip_error_rows: BooleanFlag = True


@contextmanager
def batch_transaction(db):
    engine = db.engine
    digest = sha256(engine.url.database.encode()).hexdigest()[:40]
    lock_name = f"sjh-data-batches-{digest}"
    # A schema-wide lock orders commits and rollbacks, including those started by other workers.
    with engine.connect() as conn:
        locked = conn.scalar(select(func.get_lock(lock_name, 30)))
        if locked != 1:
            raise ApiError(
                503, "BATCH_WRITE_BUSY", "其他导入或回滚正在执行，请稍后重试"
            )
        try:
            yield conn
            conn.commit()
        except BaseException:
            conn.rollback()
            raise
        finally:
            try:
                conn.scalar(select(func.release_lock(lock_name)))
            except SQLAlchemyError:
                conn.invalidate()
                logger.exception("Failed to release import batch lock")


def batch_number(validation_id):
    match = re.fullmatch(r"val_([0-9]{8})([0-9a-f]{24})", validation_id)
    if match is None:
        raise ApiError(404, "STAGED_DATA_NOT_FOUND", "暂存数据已不存在，请重新上传文件")
    return f"IMP-{match[1]}-{match[2]}"


def commit_response(batch):
    fields = (
        "batch_no",
        "status",
        "total_rows",
        "valid_rows",
        "inserted_rows",
        "updated_rows",
        "skipped_rows",
        "error_rows",
    )
    return {"batch_id": batch["id"], **{field: batch[field] for field in fields}}


def require_current_shops(conn, db, lines):
    shop_ids = {line["shop_id"] for line in lines}
    if not shop_ids:
        return
    table = db.tables["shops"]
    shops = conn.execute(
        select(table).where(table.c.id.in_(shop_ids)).with_for_update(read=True)
    ).mappings()
    active = {
        row["id"]: (row["shop_name"], row["platform"])
        for row in shops
        if row["is_active"]
    }
    if any(
        active.get(line["shop_id"]) != (line["shop_name"], line["platform"])
        for line in lines
    ):
        raise ApiError(409, "VALIDATION_STALE", "店铺配置已更改，请重新验证文件")


def write_order_lines(conn, db, batch_id, rows, strategy):
    table = db.tables["order_lines"]
    snapshots = db.tables["import_batch_snapshots"]
    counts = {"inserted_rows": 0, "updated_rows": 0, "skipped_rows": 0}
    for chunk in chunks(rows):
        incoming = identity_table(chunk)
        matches = (
            conn.execute(
                select(incoming.c.row_index, incoming.c.first_index, table)
                .select_from(
                    incoming.outerjoin(table, identity_matches(table, incoming))
                )
                .order_by(incoming.c.row_index)
            )
            .mappings()
            .all()
        )

        writes = {}
        prior = {}
        for match in matches:
            index = match["row_index"]
            first_index = match["first_index"]
            existing_id = match["id"]
            if existing_id is None and index == first_index:
                counts["inserted_rows"] += 1
            elif strategy == "skip":
                counts["skipped_rows"] += 1
                continue
            else:
                counts["updated_rows"] += 1

            if (
                existing_id is not None
                and match["last_batch_id"] != batch_id
                and existing_id not in prior
            ):
                prior[existing_id] = record_json(
                    {column.name: match[column.name] for column in table.c}
                )
            writes[first_index] = restore_types(table, chunk[index])

        if prior:
            conn.execute(
                snapshots.insert(),
                [
                    {
                        "batch_id": batch_id,
                        "order_line_id": line_id,
                        "action_type": "update",
                        "before_state": state,
                    }
                    for line_id, state in prior.items()
                ],
            )
        if writes:
            values = [
                {**line, "first_batch_id": batch_id, "last_batch_id": batch_id}
                for line in writes.values()
            ]
            if strategy == "upsert":
                statement = insert(table).values(values)
                update_fields = {
                    field: statement.inserted[field]
                    for field in values[0]
                    if field != "first_batch_id"
                }
                conn.execute(statement.on_duplicate_key_update(**update_fields))
            else:
                conn.execute(table.insert(), values)

    conn.execute(
        snapshots.insert().from_select(
            ["batch_id", "order_line_id", "action_type"],
            select(literal(batch_id), table.c.id, literal("insert")).where(
                table.c.first_batch_id == batch_id
            ),
        )
    )
    return counts


def commit_validated_import(db, staging, request):
    number = batch_number(request.validation_id)
    batches = db.tables["import_batches"]
    with batch_transaction(db) as conn:
        existing = (
            conn.execute(select(batches).where(batches.c.batch_no == number))
            .mappings()
            .one_or_none()
        )
        if existing is not None:
            if existing["status"] != "committed":
                raise ApiError(
                    409,
                    "VALIDATION_ALREADY_COMMITTED",
                    "该验证已生成过批次，请重新上传文件",
                )
            response = commit_response(existing)
            validation = staging.load("val", request.validation_id, optional=True)
        else:
            validation = staging.load("val", request.validation_id)
            settings = validation["settings"]
            if validation["unknown_shops"]:
                upload = staging.load("stg", validation["staged_file_id"])
                sheet = upload["sheets"][validation["sheet_name"]]
                validation.update(prepare_validation(conn, db, sheet, settings))
            if validation["unknown_shops"]:
                raise ApiError(
                    400,
                    "UNBOUND_SHOPS",
                    "请先为未绑定的店铺选择平台",
                    {
                        "unknown_shops": validation["unknown_shops"],
                    },
                )
            if validation["errors"] and not request.skip_error_rows:
                raise ApiError(
                    400,
                    "VALIDATION_ERRORS",
                    "文件含有错误行",
                    {
                        "error_rows": validation["summary"]["error_rows"],
                    },
                )

            require_current_shops(conn, db, validation["lines"])
            summary = validation["summary"]
            inserted = conn.execute(
                batches.insert().values(
                    batch_no=number,
                    file_name=validation["file_name"],
                    sheet_name=validation["sheet_name"],
                    file_encoding=validation["file_encoding"],
                    data_source=settings["data_source"],
                    template_id=settings["template_id"],
                    template_name_snapshot=settings["template_name_snapshot"],
                    default_shop_id=settings["default_shop_id"],
                    duplicate_strategy=request.duplicate_strategy,
                    total_rows=summary["total_rows"],
                    valid_rows=summary["valid_rows"],
                    error_rows=summary["error_rows"],
                    warning_rows=summary["warning_rows"],
                )
            )
            batch_id = inserted.lastrowid
            counts = write_order_lines(
                conn, db, batch_id, validation["lines"], request.duplicate_strategy
            )
            errors = db.tables["import_batch_errors"]
            for error_chunk in chunks(validation["errors"]):
                conn.execute(
                    errors.insert(),
                    [{"batch_id": batch_id, **error} for error in error_chunk],
                )
            conn.execute(
                batches.update().where(batches.c.id == batch_id).values(**counts)
            )
            response = commit_response(get_record(conn, batches, batch_id))

    if validation is not None:
        try:
            staging.remove("stg", validation["staged_file_id"])
            staging.remove("val", request.validation_id)
        except OSError:
            logger.exception("Failed to clean staging files for a committed batch")
    return response
