from collections import defaultdict

from sqlalchemy import select, tuple_
from sqlalchemy.dialects.mysql import insert

from .effective_sales_builder import (
    DIRECT, EFFECTIVE_KEY, ENRICH, INDEPENDENT, ROLE_PRIORITY,
    business_order_id, reship_or_price_difference,
)
from .errors import ApiError
from .import_cleaning import ERP_ENRICHMENT_KEY
from .order_lines import chunks, restore_types
from .product_matching import ERP_SOURCES, text_key

ORDER_GROUP = ("platform", "shop_id", "platform_order_id")
ENRICH_FIELDS = ("province", "city", "raw_model_hint", "erp_raw_status")
ORDER_ENRICH_FIELDS = ("province", "city", "erp_raw_status")
MODEL_FIELDS = (
    "resolved_model_id", "model_match_status", "model_match_method", "model_match_candidates",
)


def recommend_role(data_source, file_name):
    manual_name = file_name.casefold().startswith(("手动", "手工", "manual"))
    if data_source == "manual" or (data_source in {None, "custom", "jushuitan"} and manual_name):
        return INDEPENDENT
    return ENRICH if data_source in ERP_SOURCES else DIRECT


def erp_facts(line, rules):
    if reship_or_price_difference(line, rules["exclude_reship_and_price_diff"]):
        return {}
    return {
        **{field: line[field] for field in ENRICH_FIELDS[:-1] if line.get(field)},
        "erp_raw_status": line["raw_order_status"],
    }


def original_erp_facts(line):
    return line["raw_extra"].get(ERP_ENRICHMENT_KEY, {})


def same_product(existing, incoming):
    return all(
        text_key(existing[field]) == text_key(incoming[field])
        for field in ("product_id", "sku_code", "product_name", "sku_spec")
    )


def merge_source_line(existing, incoming, rules):
    if existing is None:
        return dict(incoming)
    current_role = ROLE_PRIORITY[existing["source_role"]]
    next_role = ROLE_PRIORITY[incoming["source_role"]]
    same_shop = existing["shop_id"] == incoming["shop_id"]
    if not same_shop and (current_role != ROLE_PRIORITY[DIRECT] or next_role != current_role):
        raise ApiError(409, "ORDER_SHOP_CONFLICT", "同一订单行对应了不同店铺，请检查店铺绑定")
    if current_role > next_role:
        if not rules["erp_source_priority"]["enabled"]:
            return None
        evidence = erp_facts(incoming, rules)
        if not evidence:
            return None
        return {
            **existing,
            "raw_extra": {
                **existing["raw_extra"],
                ERP_ENRICHMENT_KEY: {**original_erp_facts(existing), **evidence},
            },
        }

    merged = dict(incoming)
    if same_shop:
        evidence = original_erp_facts(existing)
        if next_role > current_role:
            evidence = {**evidence, **erp_facts(existing, rules)}
        if evidence:
            merged["raw_extra"] = {**merged["raw_extra"], ERP_ENRICHMENT_KEY: evidence}
        if existing["model_match_status"] == "manual_confirmed" and same_product(existing, merged):
            merged.update({field: existing[field] for field in MODEL_FIELDS})
    return merged


def order_key(row):
    return tuple(row[field] for field in ORDER_GROUP)


def normalized_key(key):
    return tuple(text_key(value) if isinstance(value, str) else value for value in key)


def order_groups(conn, table, keys):
    groups = defaultdict(list)
    unique_keys = list({normalized_key(key): key for key in keys}.values())
    scope = tuple_(*(table.c[field] for field in ORDER_GROUP))
    for part in chunks(unique_keys):
        rows = conn.execute(
            select(table).where(scope.in_(part)).order_by(table.c.id)
        ).mappings()
        for row in rows:
            groups[normalized_key(order_key(row))].append(dict(row))
    return groups


def affected_business_keys(lines):
    return {(row["platform"], row["shop_id"], business_order_id(row)) for row in lines}


def enrichment_changes(group, rules):
    rule = rules["erp_source_priority"]
    fields = tuple(field for field in ENRICH_FIELDS if field in rule["config_json"]["enrich_fields"])
    priority = max(ROLE_PRIORITY[line["source_role"]] for line in group)
    if priority == ROLE_PRIORITY[ENRICH]:
        return
    authoritative = [line for line in group if ROLE_PRIORITY[line["source_role"]] == priority]
    unmatched = [erp_facts(line, rules) for line in group if ROLE_PRIORITY[line["source_role"]] < priority]
    unique = {}
    if any(unmatched):
        candidates = unmatched + [original_erp_facts(line) for line in authoritative]
        for field in ORDER_ENRICH_FIELDS:
            values = {item[field] for item in candidates if item.get(field)}
            if len(values) == 1:
                unique[field] = values.pop()

    for line in authoritative:
        values = {field: line[field] for field in ENRICH_FIELDS}
        for field in line["erp_enriched_fields"] or ():
            if field in values:
                values[field] = None
        filled = []
        if rule["enabled"]:
            exact = original_erp_facts(line)
            for field in fields:
                value = exact.get(field) or unique.get(field)
                if not values[field] and value:
                    values[field] = value
                    filled.append(field)
        yield line, {**values, "erp_enriched": bool(filled), "erp_enriched_fields": filled or None}


def refresh_groups(groups, shops, matcher, rules, *, rematch_all=True):
    for group in groups.values():
        changed = {}
        for line, enrichment in enrichment_changes(group, rules):
            delta = {key: value for key, value in enrichment.items() if line[key] != value}
            if delta:
                line.update(delta)
                changed[id(line)] = delta
        for line in group:
            updates = changed.get(id(line), {})
            if rematch_all or "raw_model_hint" in updates:
                match = matcher.match(line, shops[line["shop_id"]]).line_values()
                updates.update({key: value for key, value in match.items() if line[key] != value})
                line.update(updates)
            if updates:
                yield line, updates


def project_groups(conn, table, lines, shops, matcher, rules):
    groups = order_groups(conn, table, (order_key(line) for line in lines))
    indexed = {
        key: {text_key(line["line_key"]): line for line in group}
        for key, group in groups.items()
    }
    for line in lines:
        key = normalized_key(order_key(line))
        group = indexed.setdefault(key, {})
        identity = text_key(line["line_key"])
        current = group.get(identity)
        merged = merge_source_line(current, line, rules)
        if merged is not None:
            group[identity] = merged
    projected = {key: list(group.values()) for key, group in indexed.items()}
    for _ in refresh_groups(projected, shops, matcher, rules):
        pass
    return projected


def shop_lookup(conn, tables):
    shops = tables["shops"]
    return {row["id"]: row for row in conn.execute(select(shops)).mappings()}


def rebuild_effective_sales(conn, table, groups, builder, prior_keys=()):
    records = [record for group in groups.values() for record in builder.records(group)]
    scope_fields = EFFECTIVE_KEY[:3]
    affected = set(prior_keys)
    for group in groups.values():
        affected.update(affected_business_keys(group))
    keep = {normalized_key(tuple(row[field] for field in EFFECTIVE_KEY)) for row in records}
    scope = tuple_(*(table.c[field] for field in scope_fields))
    obsolete = []
    for part in chunks(list(affected)):
        for row in conn.execute(
            select(table.c.id, *(table.c[field] for field in EFFECTIVE_KEY)).where(scope.in_(part))
        ).mappings():
            if normalized_key(tuple(row[field] for field in EFFECTIVE_KEY)) not in keep:
                obsolete.append(row["id"])
    for part in chunks(obsolete):
        conn.execute(table.delete().where(table.c.id.in_(part)))
    for part in chunks(records):
        statement = insert(table).values([restore_types(table, row) for row in part])
        conn.execute(statement.on_duplicate_key_update(**{
            field: statement.inserted[field] for field in part[0] if field not in EFFECTIVE_KEY
        }))
    return records
