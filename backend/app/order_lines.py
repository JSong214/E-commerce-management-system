import json
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Integer, String, and_, text
from sqlalchemy.sql.sqltypes import DateTime, Numeric

ORDER_LINE_FLAGS = ("is_gift", "is_amount_prorated", "is_valid_for_gmv", "is_reship", "erp_enriched")
IDENTITY_FIELDS = ("platform", "platform_order_id", "line_key")
MATCH_CHUNK_SIZE = 500


def chunks(rows):
    for offset in range(0, len(rows), MATCH_CHUNK_SIZE):
        yield rows[offset : offset + MATCH_CHUNK_SIZE]


def identity_table(lines):
    # Use the same collation as uk_order_line for case and accent equivalence.
    source = text("""
        SELECT source_index - 1 AS row_index, platform, platform_order_id, line_key,
               MIN(source_index - 1) OVER (
                   PARTITION BY platform COLLATE utf8mb4_0900_ai_ci,
                                platform_order_id COLLATE utf8mb4_0900_ai_ci,
                                line_key COLLATE utf8mb4_0900_ai_ci
               ) AS first_index
        FROM JSON_TABLE(:line_identities, '$[*]' COLUMNS (
            source_index FOR ORDINALITY,
            platform VARCHAR(32) CHARACTER SET utf8mb4 PATH '$[0]',
            platform_order_id VARCHAR(64) CHARACTER SET utf8mb4 PATH '$[1]',
            line_key VARCHAR(128) CHARACTER SET utf8mb4 PATH '$[2]'
        )) AS source_keys
    """).bindparams(
        line_identities=json.dumps(
            [[line[field] for field in IDENTITY_FIELDS] for line in lines],
            ensure_ascii=False,
        )
    )
    return source.columns(
        row_index=Integer,
        platform=String,
        platform_order_id=String,
        line_key=String,
        first_index=Integer,
    ).subquery()


def identity_matches(table, incoming):
    return and_(
        *(
            table.c[field] == incoming.c[field].collate("utf8mb4_0900_ai_ci")
            for field in IDENTITY_FIELDS
        )
    )


def restore_types(table, values):
    result = dict(values)
    for key, value in result.items():
        if value is None or not isinstance(value, str):
            continue
        column_type = table.c[key].type
        if isinstance(column_type, DateTime):
            result[key] = datetime.fromisoformat(value)
        elif isinstance(column_type, Numeric):
            result[key] = Decimal(value)
    return result
