"""Create the seven Phase 1 tables from the MySQL contract."""

from alembic import op

revision = "0001_phase1"
down_revision = None
branch_labels = None
depends_on = None

DDL = (
    """CREATE TABLE shops (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  shop_name VARCHAR(128) NOT NULL,
  platform VARCHAR(32) NOT NULL COMMENT 'taobao|tmall|douyin|jd|pdd|other',
  default_data_source VARCHAR(32) NULL COMMENT 'Optional hint: taobao|tmall|douyin|jd|pdd|jushuitan',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_shop_name (shop_name),
  KEY idx_platform (platform)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci""",
    """CREATE TABLE mapping_templates (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(64) NOT NULL COMMENT 'Unique slug, e.g. jd_orders, jushuitan_erp_a',
  name VARCHAR(128) NOT NULL,
  data_source VARCHAR(32) NOT NULL COMMENT 'taobao|tmall|douyin|jd|pdd|jushuitan|custom',
  is_builtin TINYINT(1) NOT NULL DEFAULT 0,
  header_fingerprint JSON NOT NULL COMMENT 'Array of characteristic raw column names used for auto-matching',
  column_mapping JSON NOT NULL COMMENT 'Map: canonical_field -> raw_column_name (or ordered fallback array)',
  rules JSON NOT NULL COMMENT 'Cleaning rules, e.g. {"prorate_order_amount": true, "prorate_weight_field": "unit_price", "pii_columns": [...]}',
  default_platform VARCHAR(32) NULL COMMENT 'Optional default platform when source is single-platform',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_template_code (code),
  KEY idx_data_source (data_source)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci""",
    """CREATE TABLE status_mappings (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  data_source VARCHAR(32) NOT NULL COMMENT 'Source code or * for global fallback',
  raw_status VARCHAR(128) NOT NULL,
  normalized_status VARCHAR(32) NOT NULL COMMENT 'pending_pay|paid_unshipped|shipped|completed|closed_cancelled',
  is_valid_for_gmv TINYINT(1) NOT NULL DEFAULT 1 COMMENT '0 for pending_pay and pre-payment cancellations',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_source_raw_status (data_source, raw_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci""",
    """CREATE TABLE import_batches (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  batch_no VARCHAR(40) NOT NULL COMMENT 'Human-readable ID, e.g. IMP-20261124-0001',
  file_name VARCHAR(255) NOT NULL,
  sheet_name VARCHAR(128) NULL,
  file_encoding VARCHAR(32) NULL,
  data_source VARCHAR(32) NOT NULL,
  template_id BIGINT UNSIGNED NULL,
  template_name_snapshot VARCHAR(128) NOT NULL,
  default_shop_id BIGINT UNSIGNED NULL,
  duplicate_strategy VARCHAR(16) NOT NULL DEFAULT 'upsert' COMMENT 'upsert|skip',
  status VARCHAR(24) NOT NULL DEFAULT 'committed' COMMENT 'committed|rolled_back',
  total_rows INT UNSIGNED NOT NULL DEFAULT 0,
  valid_rows INT UNSIGNED NOT NULL DEFAULT 0,
  inserted_rows INT UNSIGNED NOT NULL DEFAULT 0,
  updated_rows INT UNSIGNED NOT NULL DEFAULT 0,
  skipped_rows INT UNSIGNED NOT NULL DEFAULT 0,
  error_rows INT UNSIGNED NOT NULL DEFAULT 0,
  warning_rows INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  rolled_back_at DATETIME NULL,
  UNIQUE KEY uk_batch_no (batch_no),
  KEY idx_created_at (created_at),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci""",
    """CREATE TABLE import_batch_errors (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  batch_id BIGINT UNSIGNED NOT NULL,
  `row_number` INT UNSIGNED NOT NULL COMMENT '1-based source file row number (excluding header or clearly stated)',
  field_name VARCHAR(64) NOT NULL,
  raw_value VARCHAR(512) NULL,
  error_code VARCHAR(64) NOT NULL,
  error_message VARCHAR(255) NOT NULL,
  raw_row_sanitized JSON NOT NULL COMMENT 'Original row with buyer PII already stripped, used for error-row Excel export',
  KEY idx_batch_id (batch_id),
  CONSTRAINT fk_errors_batch FOREIGN KEY (batch_id) REFERENCES import_batches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci""",
    """CREATE TABLE order_lines (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  platform VARCHAR(32) NOT NULL COMMENT 'taobao|tmall|douyin|jd|pdd|other',
  shop_id BIGINT UNSIGNED NOT NULL,
  shop_name VARCHAR(128) NOT NULL,
  data_source VARCHAR(32) NOT NULL COMMENT 'Latest source that wrote this line',
  platform_order_id VARCHAR(64) NOT NULL,
  sub_order_id VARCHAR(64) NULL,
  line_key VARCHAR(128) NOT NULL COMMENT 'sub_order_id if present, else deterministic {sku_or_product_id}#{occurrence_index}',

  order_time DATETIME NOT NULL,
  pay_time DATETIME NULL,
  ship_time DATETIME NULL,
  finish_time DATETIME NULL,

  product_id VARCHAR(64) NULL,
  sku_code VARCHAR(128) NULL,
  product_name VARCHAR(512) NOT NULL,
  sku_spec VARCHAR(255) NULL,
  is_gift TINYINT(1) NOT NULL DEFAULT 0,

  quantity INT NOT NULL,
  unit_price DECIMAL(14,2) NULL COMMENT 'Single unit list/platform price (used as proration weight for JD)',
  gross_amount DECIMAL(14,2) NULL COMMENT 'Pre-discount line amount',
  discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  shipping_fee DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  paid_amount DECIMAL(14,2) NOT NULL COMMENT 'Actual line paid amount (prorated for order-level sources like JD)',
  is_amount_prorated TINYINT(1) NOT NULL DEFAULT 0,
  refund_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,

  raw_order_status VARCHAR(128) NOT NULL,
  normalized_status VARCHAR(32) NOT NULL COMMENT 'pending_pay|paid_unshipped|shipped|completed|closed_cancelled',
  is_valid_for_gmv TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1 if included in GMV/Order Count/Units Sold',
  refund_status VARCHAR(64) NULL,

  province VARCHAR(64) NULL,
  city VARCHAR(64) NULL,
  seller_note VARCHAR(512) NULL,
  buyer_note VARCHAR(512) NULL,

  raw_extra JSON NOT NULL COMMENT 'Non-PII unmapped source columns preserved as JSON object',

  first_batch_id BIGINT UNSIGNED NOT NULL,
  last_batch_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uk_order_line (platform, platform_order_id, line_key),
  KEY idx_order_time_platform (order_time, platform, shop_id),
  KEY idx_pay_time_platform (pay_time, platform, shop_id),
  KEY idx_sku_code (sku_code),
  KEY idx_product_id (product_id),
  KEY idx_normalized_status (normalized_status),
  KEY idx_first_batch (first_batch_id),
  KEY idx_last_batch (last_batch_id),
  CONSTRAINT fk_lines_shop FOREIGN KEY (shop_id) REFERENCES shops(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci""",
    """CREATE TABLE import_batch_snapshots (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  batch_id BIGINT UNSIGNED NOT NULL,
  order_line_id BIGINT UNSIGNED NOT NULL,
  action_type VARCHAR(16) NOT NULL COMMENT 'insert|update',
  before_state JSON NULL COMMENT 'Full pre-update column snapshot of order_lines when action_type=update; NULL when insert',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_batch_action (batch_id, action_type),
  KEY idx_order_line_batch (order_line_id, batch_id),
  CONSTRAINT fk_snapshots_batch FOREIGN KEY (batch_id) REFERENCES import_batches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci""",
)


def upgrade():
    for statement in DDL:
        op.execute(statement)


def downgrade():
    for table in (
        "import_batch_snapshots",
        "order_lines",
        "import_batch_errors",
        "import_batches",
        "status_mappings",
        "mapping_templates",
        "shops",
    ):
        op.drop_table(table)
