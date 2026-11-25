from typing import Annotated, Literal

from fastapi import APIRouter, Body, Query
from openpyxl import Workbook
from pydantic import BaseModel
from sqlalchemy import and_, case, func, null, select

from .db import Db, record_json
from .domain import BooleanFlag
from .order_filters import OrderScope, PageNumber, PageSize, scope_conditions
from .order_queries import append_order_lines_sheet, ordered_lines
from .spreadsheets import append_sheet, xlsx_download

router = APIRouter(prefix="/reports", tags=["Reports"])
MONEY_METRICS = ("gmv", "refund_amount", "net_sales")
RANKING_DIMENSIONS = ("sku_code", "product_id", "product_name", "platform")


class SummaryFilters(OrderScope):
    granularity: Literal["day", "week", "month"] = "day"
    group_by: Literal["platform", "shop", "none"] = "none"


class RankingFilters(OrderScope):
    sort_by: Literal["net_sales", "gmv", "units_sold", "order_count"] = "net_sales"
    page: PageNumber = 1
    page_size: PageSize = 50


class SummaryExport(BaseModel):
    report_type: Literal["summary"]
    include_detail_sheet: BooleanFlag = False
    filters: SummaryFilters


class RankingExport(BaseModel):
    report_type: Literal["sku_ranking"]
    include_detail_sheet: BooleanFlag = False
    filters: RankingFilters


def metrics(lines):
    gmv = func.coalesce(func.sum(lines.c.paid_amount), 0)
    refunds = func.coalesce(func.sum(lines.c.refund_amount), 0)
    return (
        gmv.label("gmv"),
        refunds.label("refund_amount"),
        (gmv - refunds).label("net_sales"),
        func.count(lines.c.platform_order_id.distinct()).label("order_count"),
        func.coalesce(func.sum(lines.c.quantity), 0).label("units_sold"),
    )


def report_conditions(lines, filters):
    return [*scope_conditions(lines, filters), lines.c.is_valid_for_gmv == 1]


def report_json(row):
    result = record_json(row)
    result.update({name: f"{row[name]:.2f}" for name in MONEY_METRICS})
    result["order_count"] = int(row["order_count"])
    result["units_sold"] = int(row["units_sold"])
    return result


def report_kpi(conn, lines, conditions):
    return report_json(
        conn.execute(select(*metrics(lines)).select_from(lines).where(*conditions))
        .mappings()
        .one()
    )


def summary_rows(db, lines, filters, conditions):
    timestamp = lines.c[filters.time_basis]
    if filters.granularity == "month":
        period = func.date_format(timestamp, "%Y-%m-01")
    elif filters.granularity == "week":
        period = func.subdate(func.date(timestamp), func.weekday(timestamp))
    else:
        period = func.date(timestamp)

    source = lines
    grouping = [period]
    platform, shop_id, shop_name = null(), null(), null()
    if filters.group_by != "none":
        platform = lines.c.platform
        grouping.append(platform)
    if filters.group_by == "shop":
        shops = db.tables["shops"]
        source = lines.join(shops, lines.c.shop_id == shops.c.id)
        shop_id, shop_name = lines.c.shop_id, shops.c.shop_name
        grouping.extend((shop_id, shop_name))

    return (
        select(
            period.label("period"),
            platform.label("platform"),
            shop_id.label("shop_id"),
            shop_name.label("shop_name"),
            *metrics(lines),
        )
        .select_from(source)
        .where(*conditions)
        .group_by(*grouping)
        .order_by(*grouping)
    )


def ranking_rows(lines, filters, conditions):
    no_sku = lines.c.sku_code.is_(None)
    no_product = lines.c.product_id.is_(None)
    grouped = (
        select(
            func.min(lines.c.id).label("representative_id"),
            *metrics(lines),
        )
        .where(*conditions)
        .group_by(
            lines.c.platform,
            lines.c.sku_code,
            case((no_sku, lines.c.product_id)),
            case((and_(no_sku, no_product), lines.c.product_name)),
        )
        .subquery()
    )
    query = (
        select(
            *(lines.c[name] for name in RANKING_DIMENSIONS),
            *(column for column in grouped.c if column.key != "representative_id"),
        )
        .select_from(grouped.join(lines, lines.c.id == grouped.c.representative_id))
        .order_by(grouped.c[filters.sort_by].desc(), grouped.c.representative_id)
    )
    return query, grouped


@router.get("/summary")
def summary_report(filters: Annotated[SummaryFilters, Query()], db: Db):
    lines = db.tables["order_lines"]
    conditions = report_conditions(lines, filters)
    with db.engine.connect() as conn:
        return {
            "kpi": report_kpi(conn, lines, conditions),
            "rows": [
                report_json(row)
                for row in conn.execute(
                    summary_rows(db, lines, filters, conditions)
                ).mappings()
            ],
        }


@router.get("/sku-ranking")
def sku_ranking(filters: Annotated[RankingFilters, Query()], db: Db):
    lines = db.tables["order_lines"]
    conditions = report_conditions(lines, filters)
    query, groups = ranking_rows(lines, filters, conditions)
    with db.engine.connect() as conn:
        return {
            "kpi": report_kpi(conn, lines, conditions),
            "total": conn.scalar(select(func.count()).select_from(groups)),
            "items": [
                report_json(row)
                for row in conn.execute(
                    query.offset((filters.page - 1) * filters.page_size).limit(
                        filters.page_size
                    )
                ).mappings()
            ],
        }


@router.post("/export")
def export_report(
    body: Annotated[SummaryExport | RankingExport, Body(discriminator="report_type")],
    db: Db,
):
    lines = db.tables["order_lines"]
    filters = body.filters
    conditions = report_conditions(lines, filters)
    if isinstance(body, SummaryExport):
        query = summary_rows(db, lines, filters, conditions)
        filename = "summary-report.xlsx"
    else:
        query, _ = ranking_rows(lines, filters, conditions)
        filename = "sku-ranking.xlsx"

    book = Workbook(write_only=True)
    columns = tuple(query.selected_columns.keys())
    with db.engine.connect() as conn:
        with conn.execution_options(yield_per=1000).execute(query) as result:
            rows = (record_json(row).values() for row in result.mappings())
            append_sheet(
                book,
                "汇总报表",
                columns,
                rows,
                text_columns=("sku_code", "product_id"),
                money_columns=MONEY_METRICS,
            )
        if body.include_detail_sheet:
            detail = ordered_lines(lines, filters.time_basis, conditions)
            append_order_lines_sheet(book, conn, lines, detail)
    return xlsx_download(book, filename)
