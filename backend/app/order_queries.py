from typing import Annotated, Literal

from fastapi import APIRouter, Query
from openpyxl import Workbook
from sqlalchemy import func, or_, select

from .db import Db, record_json
from .order_filters import OrderFilters, scope_conditions
from .order_lines import ORDER_LINE_FLAGS
from .spreadsheets import append_sheet, csv_download, xlsx_download

router = APIRouter(prefix="/order-lines", tags=["Order lines"])
TEXT_ID_COLUMNS = ("platform_order_id", "sub_order_id", "product_id", "sku_code")
ORDER_MONEY_COLUMNS = (
    "unit_price",
    "gross_amount",
    "discount_amount",
    "shipping_fee",
    "paid_amount",
    "refund_amount",
)


class OrderExport(OrderFilters):
    format: Literal["xlsx", "csv"]


def order_conditions(db, table, filters):
    conditions = scope_conditions(table, filters)
    if filters.data_source is not None:
        conditions.append(table.c.data_source == filters.data_source)
    if filters.keyword:
        conditions.append(
            or_(
                *(
                    table.c[field].contains(filters.keyword, autoescape=True)
                    for field in (
                        "platform_order_id",
                        "sku_code",
                        "product_id",
                        "product_name",
                    )
                )
            )
        )
    if filters.batch_id is not None:
        snapshots = db.tables["import_batch_snapshots"]
        batches = db.tables["import_batches"]
        touched = (
            select(snapshots.c.id)
            .select_from(snapshots.join(batches, snapshots.c.batch_id == batches.c.id))
            .where(
                snapshots.c.batch_id == filters.batch_id,
                snapshots.c.order_line_id == table.c.id,
                batches.c.status == "committed",
            )
            .exists()
        )
        conditions.append(
            or_(
                table.c.first_batch_id == filters.batch_id,
                table.c.last_batch_id == filters.batch_id,
                touched,
            )
        )
    return conditions


def ordered_lines(table, time_basis, conditions):
    return (
        select(table)
        .where(*conditions)
        .order_by(table.c[time_basis].desc(), table.c.id.desc())
    )


def export_rows(conn, query, columns):
    with conn.execution_options(yield_per=1000).execute(query) as result:
        for row in result.mappings():
            yield [
                bool(row[name]) if name in ORDER_LINE_FLAGS else row[name]
                for name in columns
            ]


def append_order_lines_sheet(book, conn, table, query):
    columns = tuple(table.c.keys())
    append_sheet(
        book,
        "标准化明细",
        columns,
        export_rows(conn, query, columns),
        text_columns=TEXT_ID_COLUMNS,
        money_columns=ORDER_MONEY_COLUMNS,
    )


@router.get("")
def list_order_lines(filters: Annotated[OrderFilters, Query()], db: Db):
    lines = db.tables["order_lines"]
    conditions = order_conditions(db, lines, filters)
    page_query = (
        ordered_lines(lines, filters.time_basis, conditions)
        .offset((filters.page - 1) * filters.page_size)
        .limit(filters.page_size)
    )
    with db.engine.connect() as conn:
        total = conn.scalar(select(func.count()).select_from(lines).where(*conditions))
        rows = [
            record_json(line, flags=ORDER_LINE_FLAGS)
            for line in conn.execute(page_query).mappings()
        ]
    return {
        "items": rows,
        "total": total,
        "page": filters.page,
        "page_size": filters.page_size,
    }


@router.post("/export")
def export_order_lines(filters: OrderExport, db: Db):
    lines = db.tables["order_lines"]
    query = ordered_lines(
        lines, filters.time_basis, order_conditions(db, lines, filters)
    )
    with db.engine.connect() as conn:
        if filters.format == "csv":
            columns = tuple(lines.c.keys())
            return csv_download(
                columns, export_rows(conn, query, columns), "order-lines.csv"
            )
        book = Workbook(write_only=True)
        append_order_lines_sheet(book, conn, lines, query)
    return xlsx_download(book, "order-lines.xlsx")
