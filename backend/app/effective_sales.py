from datetime import date, datetime, time
from typing import Annotated, Literal

from fastapi import APIRouter, Query
from openpyxl import Workbook
from pydantic import BaseModel, StringConstraints, model_validator
from sqlalchemy import case, func, or_, select

from .db import Db, get_record, record_json
from .domain import (
    EffectiveTimeBasis, EligibilityStatus, ModelMatchStatus, Platform, RecordId, SourceRole,
)
from .effective_sales_builder import EFFECTIVE_FLAGS
from .order_filters import PageNumber, PageSize
from .order_lines import ORDER_LINE_FLAGS, chunks
from .product_matching import PENDING_MODEL_STATUSES
from .spreadsheets import append_sheet, csv_download, xlsx_download

router = APIRouter(prefix="/effective-sales", tags=["Effective Sales"])
Keyword = Annotated[str, StringConstraints(strip_whitespace=True, max_length=512)]
EXPORT_COLUMNS = (
    ("订单号", "business_order_id"), ("店铺", "shop_name"), ("平台", "platform"),
    ("业务板块", "business_segment"), ("品类", "category"), ("品牌", "brand"),
    ("标准型号", "standard_model"), ("型号匹配状态", "model_match_status"),
    ("业务时间", "business_time"), ("销量", "sales_quantity"), ("销售额", "sales_amount"),
    ("金额来源", "amount_source"), ("有效性状态", "eligibility_status"),
    ("排除/待核对原因", "exclusion_reason"), ("来源角色", "source_role"),
    ("是否ERP补全", "erp_enriched"), ("省份", "province"), ("城市", "city"),
    ("原始订单状态", "raw_order_status"), ("备注提示", "notices"),
)


class EffectiveFilters(BaseModel):
    time_basis: EffectiveTimeBasis = "business_time"
    start_date: date | None = None
    end_date: date | None = None
    platform: Platform | None = None
    shop_id: RecordId | None = None
    brand: str | None = None
    category: str | None = None
    business_segment: str | None = None
    standard_model: str | None = None
    eligibility_status: EligibilityStatus | Literal["all"] = "valid"
    model_match_status: ModelMatchStatus | Literal["pending", "all"] = "all"
    source_role: SourceRole | None = None
    batch_id: RecordId | None = None
    keyword: Keyword | None = None
    page: PageNumber = 1
    page_size: PageSize = 50

    @model_validator(mode="after")
    def validate_dates(self):
        if any(value is not None and value.year < 1000 for value in (self.start_date, self.end_date)):
            raise ValueError("Dates must be in the MySQL DATETIME range")
        if self.start_date and self.end_date and self.start_date > self.end_date:
            raise ValueError("start_date must be on or before end_date")
        return self


class EffectiveExport(EffectiveFilters):
    format: Literal["xlsx", "csv"] = "xlsx"


def sales_conditions(table, filters):
    conditions = [
        table.c[field] == value
        for field, value in (
            ("platform", filters.platform), ("shop_id", filters.shop_id), ("brand", filters.brand),
            ("category", filters.category), ("business_segment", filters.business_segment),
            ("standard_model", filters.standard_model), ("source_role", filters.source_role),
            ("last_batch_id", filters.batch_id),
        )
        if value is not None
    ]
    timestamp = table.c[filters.time_basis]
    if filters.time_basis == "pay_time":
        conditions.append(timestamp.is_not(None))
    if filters.start_date:
        conditions.append(timestamp >= datetime.combine(filters.start_date, time.min))
    if filters.end_date:
        conditions.append(timestamp <= datetime.combine(filters.end_date, time.max))
    if filters.model_match_status == "pending":
        conditions.append(table.c.model_match_status.in_(PENDING_MODEL_STATUSES))
    elif filters.model_match_status != "all":
        conditions.append(table.c.model_match_status == filters.model_match_status)
    if filters.keyword:
        conditions.append(or_(*(
            table.c[field].contains(filters.keyword, autoescape=True)
            for field in ("business_order_id", "standard_model", "raw_product_summary")
        )))
    return conditions


def sales_query(table, filters, conditions):
    query = select(table).where(*conditions)
    if filters.eligibility_status != "all":
        query = query.where(table.c.eligibility_status == filters.eligibility_status)
    return query.order_by(table.c[filters.time_basis].desc(), table.c.id.desc())


def sales_kpi(conn, table, conditions):
    status = table.c.eligibility_status
    valid = status == "valid"
    sums = (
        ("valid_records", valid, 1),
        ("excluded_records", status == "excluded", 1),
        ("needs_review_records", status == "needs_review", 1),
        ("pending_model_records", table.c.model_match_status.in_(PENDING_MODEL_STATUSES), 1),
        ("valid_sales_quantity", valid, table.c.sales_quantity),
        ("valid_sales_amount", valid, table.c.sales_amount),
    )
    row = conn.execute(
        select(
            func.count().label("total_records"),
            *(func.coalesce(func.sum(case((condition, value), else_=0)), 0).label(name)
              for name, condition, value in sums),
        ).select_from(table).where(*conditions)
    ).mappings().one()
    return {
        name: f"{value:.2f}" if name == "valid_sales_amount" else int(value)
        for name, value in row.items()
    }


def source_lines_by_id(conn, table, ids):
    return {
        row["id"]: row
        for part in chunks(sorted(set(ids)))
        for row in conn.execute(select(table).where(table.c.id.in_(part))).mappings()
    }


@router.get("")
def list_effective_sales(filters: Annotated[EffectiveFilters, Query()], db: Db):
    table = db.tables["effective_sales_records"]
    conditions = sales_conditions(table, filters)
    query = sales_query(table, filters, conditions).offset(
        (filters.page - 1) * filters.page_size
    ).limit(filters.page_size)
    with db.engine.connect() as conn:
        kpi = sales_kpi(conn, table, conditions)
        items = [record_json(row, flags=EFFECTIVE_FLAGS) for row in conn.execute(query).mappings()]
    count = "total_records" if filters.eligibility_status == "all" else f"{filters.eligibility_status}_records"
    return {
        "items": items, "total": kpi[count], "page": filters.page,
        "page_size": filters.page_size, "kpi": kpi,
    }


def export_sales_rows(conn, query):
    with conn.execution_options(yield_per=1000).execute(query) as result:
        for row in result.mappings():
            values = {
                **row, "erp_enriched": "是" if row["erp_enriched"] else "否",
                "notices": "、".join(row["notices"] or ()),
            }
            yield [values[field] for _, field in EXPORT_COLUMNS]


@router.get("/export")
def export_effective_sales(filters: Annotated[EffectiveExport, Query()], db: Db):
    table = db.tables["effective_sales_records"]
    query = sales_query(table, filters, sales_conditions(table, filters))
    columns = tuple(title for title, _ in EXPORT_COLUMNS)
    with db.engine.connect() as conn:
        rows = export_sales_rows(conn, query)
        if filters.format == "csv":
            return csv_download(columns, rows, "effective-sales.csv")
        book = Workbook(write_only=True)
        append_sheet(
            book, "有效销售", columns, rows,
            text_columns=("订单号",), money_columns=("销售额",),
        )
    return xlsx_download(book, "effective-sales.xlsx")


@router.get("/{record_id}")
def get_effective_sale(record_id: RecordId, db: Db):
    tables = db.tables
    with db.engine.connect() as conn:
        record = get_record(conn, tables["effective_sales_records"], record_id)
        ids = record["source_order_line_ids"]
        lines = source_lines_by_id(conn, tables["order_lines"], ids)
    return {
        **record_json(record, flags=EFFECTIVE_FLAGS),
        "source_order_lines": [
            record_json(lines[id], flags=ORDER_LINE_FLAGS) for id in ids if id in lines
        ],
    }
