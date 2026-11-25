from datetime import date, datetime
from decimal import Decimal
from functools import cached_property
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy import MetaData, create_engine, select
from sqlalchemy.engine import URL

from .errors import ApiError


class Database:
    def __init__(self, url: str | URL | None):
        self._engine = (
            create_engine(url, pool_pre_ping=True, hide_parameters=True)
            if url
            else None
        )

    @property
    def engine(self):
        if self._engine is None:
            raise ApiError(
                503,
                "DATABASE_NOT_CONFIGURED",
                "请配置 DATABASE_URL 或在 backend/.env 中设置 MYSQL_USER 和 MYSQL_PASSWORD",
            )
        return self._engine

    @cached_property
    def tables(self):
        # Reflect the migrated schema so the contract's DDL has one implementation.
        metadata = MetaData()
        metadata.reflect(
            self.engine,
            only=[
                "shops",
                "mapping_templates",
                "status_mappings",
                "import_batches",
                "import_batch_errors",
                "order_lines",
                "import_batch_snapshots",
            ],
        )
        return metadata.tables

    def close(self):
        if self._engine is not None:
            self._engine.dispose()


def get_database(request: Request) -> Database:
    return request.app.state.database


Db = Annotated[Database, Depends(get_database)]


def get_record(conn, table, id, *, lock=False):
    query = select(table).where(table.c.id == id)
    if lock:
        query = query.with_for_update()
    row = conn.execute(query).mappings().one_or_none()
    if row is None:
        raise ApiError(404, "NOT_FOUND", "记录不存在")
    return row


def record_json(row, *, flags=()):
    values = dict(row)
    for key, value in values.items():
        if key in flags:
            values[key] = bool(value)
        elif isinstance(value, Decimal):
            values[key] = format(value, "f")
        elif isinstance(value, (datetime, date)):
            values[key] = value.isoformat()
    return values
