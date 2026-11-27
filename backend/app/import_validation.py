from collections import Counter

from pydantic import BaseModel, Field
from sqlalchemy import select

from .db import get_record, record_json
from .domain import ColumnMapping, DataSource, RecordId, SourceRole, TemplateRules
from .effective_sales_builder import EffectiveSalesBuilder, sales_counts
from .errors import ApiError
from .import_cleaning import clean_sheet
from .import_parser import header_key, match_template
from .ingestion_sources import project_groups, recommend_role, shop_lookup
from .order_lines import ORDER_LINE_FLAGS, chunks, identity_matches, identity_table
from .product_matching import ProductMatcher
from .sales_rules import load_rules


class ValidationRequest(BaseModel):
    staged_file_id: str
    sheet_name: str | None = None
    data_source: DataSource
    source_role: SourceRole | None = None
    template_id: RecordId | None = None
    column_mapping: ColumnMapping = Field(default_factory=dict)
    rules: TemplateRules = Field(default_factory=TemplateRules)
    default_shop_id: RecordId | None = None


def validation_settings(conn, db, body, sheet, file_name):
    templates = db.tables["mapping_templates"]
    if body.template_id is not None:
        template = get_record(conn, templates, body.template_id)
    else:
        source_filter = templates.c.data_source == body.data_source
        if body.data_source == "manual":
            source_filter = source_filter | (templates.c.code == "jushuitan_erp_b")
        matches = conn.execute(select(templates).where(source_filter).order_by(templates.c.id)).mappings()
        template, _ = match_template(sheet["headers"], matches)

    template_rules = template["rules"] if template else {}
    rules = {**template_rules, **body.rules.model_dump(exclude_unset=True)}
    rules["pii_columns"] = list(
        dict.fromkeys([*template_rules.get("pii_columns", []), *body.rules.pii_columns])
    )
    return {
        "data_source": body.data_source,
        "source_role": body.source_role or recommend_role(
            template["data_source"] if template and body.data_source != "manual" else body.data_source,
            file_name,
        ),
        "template_id": template["id"] if template else None,
        "template_code": template["code"] if template else None,
        "template_name_snapshot": template["name"] if template else "自定义映射",
        "default_shop_id": body.default_shop_id,
        "column_mapping": {
            **(template["column_mapping"] if template else {}),
            **body.column_mapping,
        },
        "rules": rules,
    }


def prepare_validation(conn, db, sheet, settings):
    tables = db.tables
    shops = shop_lookup(conn, tables)
    aliases = conn.execute(select(tables["shop_aliases"])).mappings()
    alias_shops = {header_key(alias["alias_name"]): shops[alias["shop_id"]] for alias in aliases}
    canonical_shops = {header_key(shop["shop_name"]): shop for shop in shops.values()}
    by_name = {**alias_shops, **canonical_shops}
    for lookup in (alias_shops, canonical_shops):
        by_name.update({name: shop for name, shop in lookup.items() if shop["shop_status"] != "inactive"})
    default_id = settings["default_shop_id"]
    default = shops.get(default_id)
    if default_id is not None and default is None:
        raise ApiError(422, "INVALID_DEFAULT_SHOP", "默认店铺不存在")
    if default and default["shop_status"] == "inactive":
        raise ApiError(
            422, "SHOP_INACTIVE", "默认店铺未启用", {"inactive_shops": [default["shop_name"]]}
        )

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
    rules = load_rules(conn, tables["sales_rules"])
    rows, unknown_shops, unknown_statuses, prorated_orders = clean_sheet(
        sheet, settings, by_name, default, status_lookup, rules
    )

    matcher = ProductMatcher(conn, tables)
    builder = EffectiveSalesBuilder(shops, matcher, rules)
    valid_lines = []
    ambiguous_preview = []
    for row in rows:
        if row.errors:
            continue
        line = row.line
        shop = shops.get(line["shop_id"])
        if shop:
            match = matcher.match(line, shop)
            line.update(match.line_values())
            jd = line["platform"] == "jd" and rules["jd_whole_unit_merge"]["enabled"]
            amount, source, _ = builder.amount(line, shop, jd=jd)
            if amount is not None:
                line["amount_source"] = source
            if match.status == "ambiguous" and len(ambiguous_preview) < 10:
                channel = match.channel_key
                ambiguous_preview.append({
                    "row_number": row.number,
                    "platform_order_id": line["platform_order_id"],
                    "channel_type": channel.channel_type if channel else None,
                    "external_id": channel.external_id if channel else None,
                    "raw_product_name": line["product_name"],
                    "model_match_status": match.status,
                    "candidates": match.candidates,
                })
        valid_lines.append(line)

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
    groups = project_groups(conn, order_lines, candidates, shops, matcher, rules)
    records = [record for group in groups.values() for record in builder.records(group)]
    counts = sales_counts(records)
    models = Counter(record["model_match_status"] for record in records)
    return {
        "lines": [record_json(line, flags=ORDER_LINE_FLAGS) for line in valid_lines],
        "errors": [error for row in rows for error in row.errors],
        "warnings": [warning for row in rows for warning in row.warnings],
        "unknown_shops": unknown_shops,
        "inactive_shops": [],
        "unknown_statuses": unknown_statuses,
        "ambiguous_model_preview": ambiguous_preview,
        "v2_summary": {
            "estimated_effective_valid": counts["effective_rows"],
            "estimated_excluded": counts["excluded_rows"],
            "estimated_needs_review": sum(record["eligibility_status"] == "needs_review" for record in records),
            "estimated_erp_enriched": counts["enriched_rows"],
            "jd_merged_orders": builder.merged_orders,
            "model_matched": models["matched"],
            "model_ambiguous": models["ambiguous"],
            "model_unmatched": models["unmatched"],
            "exclusion_breakdown": dict(Counter(
                record["exclusion_reason"] for record in records
                if record["eligibility_status"] == "excluded"
            )),
        },
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
