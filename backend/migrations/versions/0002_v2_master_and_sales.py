"""Add V2 master data and effective sales to the Phase 1 schema."""

from alembic import op

revision = "0002_v2_master_and_sales"
down_revision = "0001_phase1"
branch_labels = None
depends_on = None

V2_ORDER_LINE_COLUMNS = (
    "source_role",
    "external_order_id",
    "internal_order_id",
    "order_type",
    "is_reship",
    "payable_amount",
    "erp_paid_amount",
    "amount_source",
    "erp_enriched",
    "erp_enriched_fields",
    "erp_raw_status",
    "raw_model_hint",
    "resolved_model_id",
    "model_match_status",
    "model_match_method",
    "model_match_candidates",
)

DDL = (
    """ALTER TABLE shops
  MODIFY COLUMN platform VARCHAR(32) NOT NULL COMMENT 'taobao|tmall|douyin|jd|pdd|huanxin|other',
  ADD COLUMN operator_type VARCHAR(32) NOT NULL DEFAULT 'self_operated' COMMENT 'self_operated|agency_operated' AFTER platform,
  ADD COLUMN entity_name VARCHAR(128) NULL COMMENT '经营主体' AFTER operator_type,
  ADD COLUMN sales_mode VARCHAR(32) NULL COMMENT 'dealer|distribution|hybrid|NULL' AFTER entity_name,
  ADD COLUMN shop_status VARCHAR(24) NOT NULL DEFAULT 'active' COMMENT 'active|dormant|inactive' AFTER sales_mode,
  ADD COLUMN erp_sales_enabled TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 if ERP/manual can create independent effective sales' AFTER default_data_source,
  ADD COLUMN zero_received_use_paid TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 for shops like 智电汇通3C店 where seller_received=0 falls back to erp_paid_amount' AFTER erp_sales_enabled,
  ADD COLUMN preserve_full_product_name TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 for 3C shops keeping full product_name (capacity/color) as standard_model' AFTER zero_received_use_paid,
  ADD COLUMN notes VARCHAR(512) NULL AFTER preserve_full_product_name,
  ADD KEY idx_shop_status (shop_status),
  ADD KEY idx_operator_type (operator_type)""",
    """CREATE TABLE shop_aliases (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  shop_id BIGINT UNSIGNED NOT NULL,
  alias_name VARCHAR(128) NOT NULL,
  source_hint VARCHAR(32) NULL COMMENT 'Optional hint: taobao|tmall|jushuitan|manual|*',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_alias_name (alias_name),
  KEY idx_shop_id (shop_id),
  CONSTRAINT fk_shop_aliases_shop FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci""",
    """CREATE TABLE product_categories (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_segment VARCHAR(64) NOT NULL COMMENT '业务板块: 家电|3C|...',
  category VARCHAR(64) NOT NULL COMMENT '品类: 空调|手机|热水器|...',
  brand VARCHAR(64) NOT NULL COMMENT '品牌: 美的|华凌|海信|苹果|...',
  report_brand VARCHAR(64) NULL COMMENT 'Optional report grouping override e.g. 海信热水器',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_category_brand (category, brand),
  KEY idx_segment_brand (business_segment, brand)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci""",
    """CREATE TABLE product_models (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  standard_model VARCHAR(191) NOT NULL COMMENT '标准型号 (unique business key)',
  category_id BIGINT UNSIGNED NULL,
  business_segment VARCHAR(64) NOT NULL,
  category VARCHAR(64) NOT NULL,
  brand VARCHAR(64) NOT NULL,
  is_3c_full_name TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 if full 3C product name with capacity/color',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  notes VARCHAR(512) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_standard_model (standard_model),
  KEY idx_brand_category (brand, category),
  KEY idx_category_id (category_id),
  CONSTRAINT fk_models_category FOREIGN KEY (category_id) REFERENCES product_categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci""",
    """CREATE TABLE product_unit_components (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  model_id BIGINT UNSIGNED NOT NULL,
  component_model VARCHAR(191) NOT NULL COMMENT '内外机型号',
  unit_type VARCHAR(16) NOT NULL COMMENT 'indoor|outdoor',
  mapping_value VARCHAR(191) NULL COMMENT '产品内外机 D列 映射值',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_component_model (component_model),
  KEY idx_model_unit_type (model_id, unit_type),
  KEY idx_mapping_value (mapping_value),
  CONSTRAINT fk_components_model FOREIGN KEY (model_id) REFERENCES product_models(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci""",
    """CREATE TABLE product_channel_mappings (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  model_id BIGINT UNSIGNED NOT NULL,
  channel_type VARCHAR(32) NOT NULL COMMENT 'jst_i_id|jst_sku_id|pdd_sku_id|tb_sku_id|tm_sku_id|dy_sku_id|jd_sku_id|merchant_code|custom_title',
  external_id VARCHAR(191) NOT NULL,
  secondary_external_id VARCHAR(191) NOT NULL DEFAULT '' COMMENT 'Optional disambiguator: e.g. jst_sku_id paired with jst_i_id, or sku_spec',
  shop_scope_id BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '0 = global; >0 = scoped to shops.id for conflict disambiguation',
  match_source VARCHAR(24) NOT NULL DEFAULT 'excel_import' COMMENT 'excel_import|manual|learned_from_review',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_channel_mapping_full (model_id, channel_type, external_id, secondary_external_id, shop_scope_id),
  KEY idx_channel_external (channel_type, external_id, is_active),
  KEY idx_model_id (model_id),
  CONSTRAINT fk_channel_mappings_model FOREIGN KEY (model_id) REFERENCES product_models(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci""",
    """CREATE TABLE sales_rules (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  rule_key VARCHAR(64) NOT NULL,
  rule_name VARCHAR(128) NOT NULL,
  rule_group VARCHAR(32) NOT NULL COMMENT 'eligibility|amount|jd_merge|source_priority|brand_normalize',
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  config_json JSON NOT NULL,
  description VARCHAR(512) NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_rule_key (rule_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci""",
    """ALTER TABLE import_batches
  ADD COLUMN source_role VARCHAR(32) NOT NULL DEFAULT 'direct_sales' COMMENT 'direct_sales|erp_enrich|erp_independent_sales' AFTER data_source,
  ADD COLUMN effective_rows INT UNSIGNED NOT NULL DEFAULT 0 AFTER warning_rows,
  ADD COLUMN excluded_rows INT UNSIGNED NOT NULL DEFAULT 0 AFTER effective_rows,
  ADD COLUMN pending_model_rows INT UNSIGNED NOT NULL DEFAULT 0 AFTER excluded_rows,
  ADD COLUMN enriched_rows INT UNSIGNED NOT NULL DEFAULT 0 AFTER pending_model_rows""",
    """ALTER TABLE order_lines
  ADD COLUMN source_role VARCHAR(32) NOT NULL DEFAULT 'direct_sales' AFTER data_source,
  ADD COLUMN external_order_id VARCHAR(64) NULL COMMENT 'LP号/原始线上订单号/系统单号' AFTER sub_order_id,
  ADD COLUMN internal_order_id VARCHAR(64) NULL COMMENT 'ERP内部订单号' AFTER external_order_id,
  ADD COLUMN order_type VARCHAR(64) NULL COMMENT '普通订单/补发订单等' AFTER sku_spec,
  ADD COLUMN is_reship TINYINT(1) NOT NULL DEFAULT 0 AFTER is_gift,
  ADD COLUMN payable_amount DECIMAL(14,2) NULL COMMENT 'JD应付金额(K) or ERP应付金额' AFTER paid_amount,
  ADD COLUMN erp_paid_amount DECIMAL(14,2) NULL COMMENT 'ERP已付金额(V), used for 3C zero-received fallback' AFTER payable_amount,
  ADD COLUMN amount_source VARCHAR(64) NULL COMMENT 'direct_paid|taobao_bybt_supply|jd_payable|erp_seller_received|erp_paid_fallback|...' AFTER erp_paid_amount,
  ADD COLUMN erp_enriched TINYINT(1) NOT NULL DEFAULT 0 AFTER refund_status,
  ADD COLUMN erp_enriched_fields JSON NULL AFTER erp_enriched,
  ADD COLUMN erp_raw_status VARCHAR(128) NULL AFTER erp_enriched_fields,
  ADD COLUMN raw_model_hint VARCHAR(255) NULL AFTER erp_raw_status,
  ADD COLUMN resolved_model_id BIGINT UNSIGNED NULL AFTER raw_model_hint,
  ADD COLUMN model_match_status VARCHAR(24) NOT NULL DEFAULT 'unmatched' COMMENT 'matched|ambiguous|unmatched|manual_confirmed' AFTER resolved_model_id,
  ADD COLUMN model_match_method VARCHAR(64) NULL AFTER model_match_status,
  ADD COLUMN model_match_candidates JSON NULL AFTER model_match_method,
  ADD KEY idx_source_role (source_role),
  ADD KEY idx_resolved_model (resolved_model_id),
  ADD KEY idx_model_match_status (model_match_status),
  ADD CONSTRAINT fk_order_lines_model FOREIGN KEY (resolved_model_id) REFERENCES product_models(id) ON DELETE SET NULL""",
    """CREATE TABLE effective_sales_records (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  platform VARCHAR(32) NOT NULL,
  shop_id BIGINT UNSIGNED NOT NULL,
  shop_name VARCHAR(128) NOT NULL,
  business_order_id VARCHAR(64) NOT NULL COMMENT 'Canonical business order ID per platform rule',
  record_key VARCHAR(128) NOT NULL COMMENT 'whole_unit (for JD merged) or canonical line_key',
  source_role VARCHAR(32) NOT NULL COMMENT 'direct_sales|erp_independent_sales|erp_enrich',
  primary_data_source VARCHAR(32) NOT NULL,
  source_order_line_ids JSON NOT NULL COMMENT 'Array of contributing Layer-1 order_lines.id values',

  business_time DATETIME NOT NULL COMMENT 'pay_time for direct_sales; order_time fallback for manual/ERP',
  order_time DATETIME NOT NULL,
  pay_time DATETIME NULL,

  model_id BIGINT UNSIGNED NULL,
  standard_model VARCHAR(191) NULL,
  brand VARCHAR(64) NULL,
  category VARCHAR(64) NULL,
  business_segment VARCHAR(64) NULL,
  model_match_status VARCHAR(24) NOT NULL DEFAULT 'unmatched' COMMENT 'matched|ambiguous|unmatched|manual_confirmed',
  model_match_method VARCHAR(64) NULL,
  model_match_candidates JSON NULL,
  raw_product_summary VARCHAR(512) NULL COMMENT 'Raw product_name / raw_model_hint for review context',

  sales_quantity INT NOT NULL,
  sales_amount DECIMAL(14,2) NOT NULL,
  amount_source VARCHAR(64) NOT NULL,

  eligibility_status VARCHAR(24) NOT NULL COMMENT 'valid|excluded|needs_review',
  exclusion_reason VARCHAR(64) NULL,
  notices JSON NULL COMMENT 'Array of non-blocking remarks e.g. 低于1000元, ERP状态取消保留直出',

  province VARCHAR(64) NULL,
  city VARCHAR(64) NULL,
  raw_order_status VARCHAR(128) NOT NULL,
  erp_enriched TINYINT(1) NOT NULL DEFAULT 0,

  last_batch_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uk_effective_sales (platform, shop_id, business_order_id, record_key),
  KEY idx_business_time_shop (business_time, platform, shop_id),
  KEY idx_order_time_shop (order_time, platform, shop_id),
  KEY idx_pay_time_shop (pay_time, platform, shop_id),
  KEY idx_eligibility_model (eligibility_status, model_match_status),
  KEY idx_brand_category (brand, category),
  KEY idx_model_id (model_id),
  KEY idx_last_batch (last_batch_id),
  CONSTRAINT fk_effective_shop FOREIGN KEY (shop_id) REFERENCES shops(id),
  CONSTRAINT fk_effective_model FOREIGN KEY (model_id) REFERENCES product_models(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci""",
)


def upgrade():
    for statement in DDL:
        op.execute(statement)
    op.execute("UPDATE shops SET shop_status = 'inactive' WHERE is_active = 0")


def downgrade():
    op.drop_table("effective_sales_records")
    snapshot_paths = ", ".join(f"'$.{column}'" for column in V2_ORDER_LINE_COLUMNS)
    op.execute(f"""
        UPDATE import_batch_snapshots
        SET before_state = JSON_REMOVE(before_state, {snapshot_paths})
        WHERE action_type = 'update' AND before_state IS NOT NULL
    """)
    drop_columns = ",\n          ".join(f"DROP COLUMN {column}" for column in V2_ORDER_LINE_COLUMNS)
    op.execute(f"""
        ALTER TABLE order_lines
          DROP FOREIGN KEY fk_order_lines_model,
          DROP KEY idx_source_role,
          DROP KEY idx_resolved_model,
          DROP KEY idx_model_match_status,
          {drop_columns}
    """)
    op.execute("""
        ALTER TABLE import_batches
          DROP COLUMN source_role,
          DROP COLUMN effective_rows,
          DROP COLUMN excluded_rows,
          DROP COLUMN pending_model_rows,
          DROP COLUMN enriched_rows
    """)
    for table in (
        "sales_rules",
        "product_channel_mappings",
        "product_unit_components",
        "product_models",
        "product_categories",
        "shop_aliases",
    ):
        op.drop_table(table)
    op.execute("""
        ALTER TABLE shops
          MODIFY COLUMN platform VARCHAR(32) NOT NULL COMMENT 'taobao|tmall|douyin|jd|pdd|other',
          DROP KEY idx_shop_status,
          DROP KEY idx_operator_type,
          DROP COLUMN operator_type,
          DROP COLUMN entity_name,
          DROP COLUMN sales_mode,
          DROP COLUMN shop_status,
          DROP COLUMN erp_sales_enabled,
          DROP COLUMN zero_received_use_paid,
          DROP COLUMN preserve_full_product_name,
          DROP COLUMN notes
    """)
