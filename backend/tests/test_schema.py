import os
import subprocess
import sys
from pathlib import Path

from alembic import command
from sqlalchemy import create_engine, inspect, text


def test_mysql_schema_can_upgrade_downgrade_and_upgrade(mysql_url, migration):
    engine = create_engine(mysql_url)
    phase_one_tables = {
        "shops",
        "mapping_templates",
        "status_mappings",
        "import_batches",
        "import_batch_errors",
        "order_lines",
        "import_batch_snapshots",
    }
    tables = phase_one_tables | {
        "shop_aliases",
        "product_categories",
        "product_models",
        "product_unit_components",
        "product_channel_mappings",
        "sales_rules",
        "effective_sales_records",
    }
    try:
        command.upgrade(migration, "0001_phase1")
        with engine.begin() as conn:
            conn.execute(text("""
                INSERT INTO shops (shop_name, platform, is_active)
                VALUES ('示例停用店', 'jd', 0)
            """))
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
        assert (columns["payable_amount"].precision, columns["payable_amount"].scale) == (14, 2)
        with engine.connect() as conn:
            assert conn.scalar(text("SELECT shop_status FROM shops")) == "inactive"
        with engine.begin() as conn:
            batch = conn.execute(text("""
                INSERT INTO import_batches (batch_no, file_name, data_source, template_name_snapshot)
                VALUES ('SYNTH-BATCH', 'synthetic.csv', 'manual', '合成模板')
            """))
            conn.execute(text("""
                INSERT INTO import_batch_snapshots
                    (batch_id, order_line_id, action_type, before_state)
                VALUES (:batch_id, 1, 'update', JSON_OBJECT(
                    'source_role', 'direct_sales', 'paid_amount', '42.00'
                ))
            """), {"batch_id": batch.lastrowid})

        command.downgrade(migration, "0001_phase1")
        assert set(inspect(engine).get_table_names()) - {"alembic_version"} == phase_one_tables
        with engine.connect() as conn:
            assert conn.scalar(text("SELECT is_active FROM shops")) == 0
            assert conn.scalar(text("""
                SELECT JSON_KEYS(before_state) FROM import_batch_snapshots
            """)) == '["paid_amount"]'
        command.downgrade(migration, "base")
        assert set(inspect(engine).get_table_names()) == {"alembic_version"}
        command.upgrade(migration, "head")
        assert set(inspect(engine).get_table_names()) - {"alembic_version"} == tables
    finally:
        engine.dispose()


def test_seed_command_creates_eight_presets_and_preserves_rule_and_status_edits(
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
            conn.execute(text("""
                UPDATE sales_rules SET enabled = 0, config_json = '{"threshold": "500.00"}'
                WHERE rule_key = 'min_sales_amount'
            """))
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
                "tmall_erp_a",
            }
            assert conn.scalar(text("SELECT COUNT(*) FROM mapping_templates")) == 8
            assert (
                conn.scalar(
                    text("""
                SELECT JSON_UNQUOTE(JSON_EXTRACT(column_mapping, '$.paid_amount'))
                FROM mapping_templates WHERE code = 'jd_orders'
            """)
                )
                == "商家应收"
            )
            assert conn.scalar(text("""
                SELECT JSON_UNQUOTE(JSON_EXTRACT(column_mapping, '$.payable_amount'))
                FROM mapping_templates WHERE code = 'jd_orders'
            """)) == "应付金额"
            assert conn.scalar(text("SELECT COUNT(*) FROM status_mappings")) == 48
            assert conn.scalar(text("SELECT COUNT(*) FROM sales_rules")) == 7
            assert conn.execute(text("""
                SELECT enabled, JSON_UNQUOTE(JSON_EXTRACT(config_json, '$.threshold'))
                FROM sales_rules WHERE rule_key = 'min_sales_amount'
            """)).one() == (0, "500.00")
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
