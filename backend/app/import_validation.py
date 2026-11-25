from pydantic import BaseModel, Field
from sqlalchemy import select

from .db import get_record, record_json
from .domain import ColumnMapping, DataSource, RecordId, TemplateRules
from .errors import ApiError
from .import_cleaning import clean_sheet
from .import_parser import match_template
from .order_lines import ORDER_LINE_FLAGS, chunks, identity_matches, identity_table


class ValidationRequest(BaseModel):
    staged_file_id: str
    sheet_name: str | None = None
    data_source: DataSource
    template_id: RecordId | None = None
    column_mapping: ColumnMapping = Field(default_factory=dict)
    rules: TemplateRules = Field(default_factory=TemplateRules)
    default_shop_id: RecordId | None = None


def validation_settings(conn, db, body, sheet):
    templates = db.tables["mapping_templates"]
    if body.template_id is not None:
        template = get_record(conn, templates, body.template_id)
    else:
        matches = conn.execute(
            select(templates)
            .where(templates.c.data_source == body.data_source)
            .order_by(templates.c.id)
        ).mappings()
        template, _ = match_template(sheet["headers"], matches)

    template_rules = template["rules"] if template else {}
    rules = {**template_rules, **body.rules.model_dump(exclude_unset=True)}
    rules["pii_columns"] = list(
        dict.fromkeys([*template_rules.get("pii_columns", []), *body.rules.pii_columns])
    )
    return {
        "data_source": body.data_source,
        "template_id": template["id"] if template else None,
        "template_name_snapshot": template["name"] if template else "自定义映射",
        "default_shop_id": body.default_shop_id,
        "column_mapping": {
            **(template["column_mapping"] if template else {}),
            **body.column_mapping,
        },
        "rules": rules,
    }


def prepare_validation(conn, db, sheet, settings):
    shops = db.tables["shops"]
    active_shops = (
        conn.execute(select(shops).where(shops.c.is_active == 1)).mappings().all()
    )
    by_name = {shop["shop_name"].casefold(): shop for shop in active_shops}
    default_id = settings["default_shop_id"]
    default = next((shop for shop in active_shops if shop["id"] == default_id), None)
    if default_id is not None and default is None:
        raise ApiError(422, "INVALID_DEFAULT_SHOP", "默认店铺不存在或已停用")

    statuses = db.tables["status_mappings"]
    configured_statuses = conn.execute(
        select(statuses).where(
            statuses.c.data_source.in_(("*", settings["data_source"]))
        )
    ).mappings()
    status_lookup = {
        (row["data_source"], row["raw_status"].casefold()): row
        for row in configured_statuses
    }
    rows, unknown_shops, unknown_statuses, prorated_orders = clean_sheet(
        sheet,
        settings["column_mapping"],
        TemplateRules.model_validate(settings["rules"]),
        settings["data_source"],
        by_name,
        default,
        status_lookup,
    )

    valid_lines = [
        record_json(row.line, flags=ORDER_LINE_FLAGS) for row in rows if not row.errors
    ]
    candidates = [line for line in valid_lines if line["shop_id"] is not None]
    estimated_updates = 0
    order_lines = db.tables["order_lines"]
    for chunk in chunks(candidates):
        incoming = identity_table(chunk)
        estimated_updates += len(
            conn.execute(
                select(incoming.c.row_index).select_from(
                    incoming.join(order_lines, identity_matches(order_lines, incoming))
                )
            ).all()
        )
    return {
        "lines": valid_lines,
        "errors": [error for row in rows for error in row.errors],
        "warnings": [warning for row in rows for warning in row.warnings],
        "unknown_shops": unknown_shops,
        "unknown_statuses": unknown_statuses,
        "summary": {
            "total_rows": len(rows),
            "valid_rows": len(valid_lines),
            "error_rows": len(rows) - len(valid_lines),
            "warning_rows": sum(bool(row.warnings) for row in rows),
            "estimated_inserts": len(candidates) - estimated_updates,
            "estimated_updates": estimated_updates,
            "prorated_orders": prorated_orders,
        },
    }
