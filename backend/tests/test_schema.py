import os
import subprocess
import sys
from pathlib import Path

from alembic import command
from sqlalchemy import create_engine, inspect, text


def test_mysql_schema_can_upgrade_downgrade_and_upgrade(mysql_url, migration):
    engine = create_engine(mysql_url)
    tables = {
        "shops",
        "mapping_templates",
        "status_mappings",
        "import_batches",
        "import_batch_errors",
        "order_lines",
        "import_batch_snapshots",
    }
    try:
        command.upgrade(migration, "head")
        schema = inspect(engine)
        assert set(schema.get_table_names()) - {"alembic_version"} == tables
        columns = {
            column["name"]: column["type"]
            for column in schema.get_columns("order_lines")
        }
        assert (columns["paid_amount"].precision, columns["paid_amount"].scale) == (
            14,
            2,
        )
        assert str(columns["raw_extra"]) == "JSON"
        indexes = {index["name"]: index for index in schema.get_indexes("order_lines")}
        assert indexes["uk_order_line"]["unique"]
        assert indexes["uk_order_line"]["column_names"] == [
            "platform",
            "platform_order_id",
            "line_key",
        ]
        assert indexes["idx_pay_time_platform"]["column_names"] == [
            "pay_time",
            "platform",
            "shop_id",
        ]

        command.downgrade(migration, "base")
        assert set(inspect(engine).get_table_names()) == {"alembic_version"}
        command.upgrade(migration, "head")
        assert set(inspect(engine).get_table_names()) - {"alembic_version"} == tables
    finally:
        engine.dispose()


def test_seed_command_creates_seven_presets_and_keeps_user_status_edits(
    mysql_url, migration
):
    command.upgrade(migration, "head")
    env = {
        **os.environ,
        "DATABASE_URL": mysql_url.render_as_string(hide_password=False),
    }
    backend = Path(__file__).resolve().parents[1]
    engine = create_engine(mysql_url)
    try:
        subprocess.run(
            [sys.executable, "-m", "app.seed"], env=env, cwd=backend, check=True
        )
        with engine.begin() as conn:
            conn.execute(
                text("""
                UPDATE status_mappings SET normalized_status = 'shipped'
                WHERE raw_status = '已完成' AND data_source = '*'
            """)
            )
        subprocess.run(
            [sys.executable, "-m", "app.seed"], env=env, cwd=backend, check=True
        )
        with engine.connect() as conn:
            codes = conn.scalars(
                text("SELECT code FROM mapping_templates WHERE is_builtin = 1")
            )
            assert set(codes) == {
                "jd_orders",
                "pdd_orders",
                "taobao_tmall_orders",
                "tmall_orders",
                "douyin_orders",
                "jushuitan_erp_a",
                "jushuitan_erp_b",
            }
            assert conn.scalar(text("SELECT COUNT(*) FROM mapping_templates")) == 7
            assert (
                conn.scalar(
                    text("""
                SELECT JSON_UNQUOTE(JSON_EXTRACT(column_mapping, '$.paid_amount'))
                FROM mapping_templates WHERE code = 'jd_orders'
            """)
                )
                == "商家应收"
            )
            assert conn.scalar(text("SELECT COUNT(*) FROM status_mappings")) == 29
            assert (
                conn.scalar(
                    text("""
                SELECT normalized_status FROM status_mappings
                WHERE raw_status = '已完成' AND data_source = '*'
            """)
                )
                == "shipped"
            )
    finally:
        engine.dispose()
