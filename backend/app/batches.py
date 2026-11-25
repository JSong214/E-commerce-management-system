from typing import Annotated, Literal

from fastapi import APIRouter, Query
from sqlalchemy import bindparam, func, select

from .batch_writes import batch_transaction
from .db import Db, get_record, record_json
from .domain import BatchStatus, DataSource, RecordId
from .errors import ApiError
from .order_lines import chunks, restore_types
from .spreadsheets import error_workbook

router = APIRouter(prefix="/batches", tags=["Batches"])


def find_blockers(conn, db, batch_ids):
    result = {batch_id: [] for batch_id in batch_ids}
    if not result:
        return result
    snapshots = db.tables["import_batch_snapshots"]
    target = snapshots.alias("target")
    newer = snapshots.alias("newer")
    batches = db.tables["import_batches"]
    matches = conn.execute(
        select(target.c.batch_id, batches.c.batch_no, batches.c.id)
        .select_from(
            target.join(newer, newer.c.order_line_id == target.c.order_line_id).join(
                batches, batches.c.id == newer.c.batch_id
            )
        )
        .where(
            target.c.batch_id.in_(result),
            newer.c.batch_id > target.c.batch_id,
            batches.c.status == "committed",
        )
        .distinct()
        .order_by(target.c.batch_id, batches.c.id.desc())
    )
    for batch_id, batch_no, _ in matches:
        result[batch_id].append(batch_no)
    return result


def batch_detail(batch, blockers):
    return {
        **record_json(batch),
        "can_rollback": batch["status"] == "committed" and not blockers,
        "blocking_batches": blockers,
    }


@router.get("")
def list_batches(
    db: Db,
    page: Annotated[int, Query(ge=1, le=2**31 - 1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=200)] = 20,
    data_source: DataSource | Literal[""] | None = None,
    status: BatchStatus | Literal[""] | None = None,
):
    batches = db.tables["import_batches"]
    filters = []
    if data_source:
        filters.append(batches.c.data_source == data_source)
    if status:
        filters.append(batches.c.status == status)
    with db.engine.connect() as conn:
        total = conn.scalar(select(func.count()).select_from(batches).where(*filters))
        rows = (
            conn.execute(
                select(batches)
                .where(*filters)
                .order_by(batches.c.id.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
            .mappings()
            .all()
        )
        blockers = find_blockers(
            conn, db, [row["id"] for row in rows if row["status"] == "committed"]
        )
    return {
        "items": [batch_detail(row, blockers.get(row["id"], [])) for row in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/{batch_id}")
def get_batch(batch_id: RecordId, db: Db):
    batches = db.tables["import_batches"]
    with db.engine.connect() as conn:
        batch = get_record(conn, batches, batch_id)
        blockers = (
            find_blockers(conn, db, [batch_id])[batch_id]
            if batch["status"] == "committed"
            else []
        )
        return batch_detail(batch, blockers)


@router.get("/{batch_id}/errors/export")
def export_batch_errors(batch_id: RecordId, db: Db):
    batches = db.tables["import_batches"]
    errors = db.tables["import_batch_errors"]
    with db.engine.connect() as conn:
        get_record(conn, batches, batch_id)
        rows = (
            conn.execute(
                select(errors)
                .where(errors.c.batch_id == batch_id)
                .order_by(errors.c.row_number, errors.c.id)
            )
            .mappings()
            .all()
        )
    return error_workbook(rows)


def rollback_conflict(message, blockers=()):
    return ApiError(
        409, "ROLLBACK_CONFLICT", message, {"blocking_batches": list(blockers)}
    )


@router.post("/{batch_id}/rollback")
def rollback_batch(batch_id: RecordId, db: Db):
    batches = db.tables["import_batches"]
    snapshots = db.tables["import_batch_snapshots"]
    lines = db.tables["order_lines"]
    with batch_transaction(db) as conn:
        batch = get_record(conn, batches, batch_id, lock=True)
        if batch["status"] != "committed":
            raise rollback_conflict("该批次已回滚")

        blockers = find_blockers(conn, db, [batch_id])[batch_id]
        if blockers:
            raise rollback_conflict(
                "较新的批次已更新部分订单行，请先回滚这些批次", blockers
            )

        inserted_ids = select(snapshots.c.order_line_id).where(
            snapshots.c.batch_id == batch_id, snapshots.c.action_type == "insert"
        )
        deleted = conn.execute(
            lines.delete().where(lines.c.id.in_(inserted_ids))
        ).rowcount
        states = conn.scalars(
            select(snapshots.c.before_state).where(
                snapshots.c.batch_id == batch_id, snapshots.c.action_type == "update"
            )
        ).all()

        restored = 0
        restore = lines.update().where(lines.c.id == bindparam("snapshot_line_id"))
        for state_chunk in chunks(states):
            updates = []
            for state in state_chunk:
                values = restore_types(lines, state)
                values["snapshot_line_id"] = values.pop("id")
                updates.append(values)
            restored += conn.execute(restore, updates).rowcount
        if restored != len(states):
            raise rollback_conflict("待恢复的订单行不存在")

        conn.execute(
            batches.update()
            .where(batches.c.id == batch_id)
            .values(status="rolled_back", rolled_back_at=func.now())
        )
    return {
        "batch_id": batch_id,
        "status": "rolled_back",
        "deleted_rows": deleted,
        "restored_rows": restored,
    }
