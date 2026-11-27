# V2 Slice 1 Contract: Master Data Center & Two-Layer Sales Ingestion

> **Contract-First Boundary** (see `AGENTS.md`): Both **Codex** (`backend/`) and **Antigravity** (`frontend/`) MUST implement against this contract. Any change to table schemas, enums, matching rules, or API payloads MUST update this document first.
>
> All domain terms follow [`GLOSSARY.md`](../../GLOSSARY.md) and [`ADR-0004`](../adr/0004-master-data-and-two-layer-sales-model.md).
>
> **Scope**: Module 1 (Shop & Product Master Data Center) + Module 2 (Source-Role Order Ingestion, Effective Sales Derivation, Pending Model Confirmation & Configurable Sales Rules). Preserves existing FastAPI/MySQL/Alembic/React scaffolding and Phase 1 rollback ledger (`0001_phase1` extended by `0002_v2_master_and_sales`).

---

## 1. Canonical Enums & Constants

### 1.1 `platform`
- `taobao` — 淘宝
- `tmall` — 天猫
- `douyin` — 抖音
- `jd` — 京东
- `pdd` — 拼多多
- `huanxin` — 焕新生活 *(NEW in V2)*
- `other` — 其他

### 1.2 `data_source`
- `taobao` | `tmall` | `douyin` | `jd` | `pdd` | `jushuitan` | `manual` *(NEW in V2)* | `custom`

### 1.3 `source_role` *(NEW in V2)*
- `direct_sales` — 平台直出销售（权威销售来源）
- `erp_enrich` — 聚水潭 ERP 补全（只补空字段，绝不覆盖直出销售事实）
- `erp_independent_sales` — ERP/手工独立销售（仅对 `shops.erp_sales_enabled = 1` 的店铺生效）

### 1.4 Shop Master Enums *(NEW in V2)*
- `operator_type`: `self_operated` (自运营) | `agency_operated` (代运营)
- `sales_mode`: `dealer` (经销) | `distribution` (分销) | `hybrid` (混合) | `null` (未启用/空白)
- `shop_status`: `active` (启用) | `dormant` (休眠) | `inactive` (未启用)
  - **Import eligibility**: Both `active` and `dormant` shops are eligible for order import & alias resolution (allowing historical imports). Only `inactive` shops are rejected unless explicitly enabled.

### 1.5 Product Master Enums *(NEW in V2)*
- `unit_type`: `indoor` (内机) | `outdoor` (外机)
- `channel_type`:
  - `jst_i_id` (聚水潭款号/款式编码)
  - `jst_sku_id` (聚水潭商品编码/SKU编码)
  - `pdd_sku_id` (拼多多商品id)
  - `tb_sku_id` (淘宝商品ID)
  - `tm_sku_id` (天猫商品编码/货品编码; Excel header `tm_sku-id` maps here)
  - `dy_sku_id` (抖音商品ID)
  - `jd_sku_id` (京东商品ID)
  - `merchant_code` (通用商家编码)
  - `custom_title` (自定义/3C完整品名映射)
- `match_source`: `excel_import` | `manual` | `learned_from_review`

### 1.6 Effective Sales & Model Confirmation Enums *(NEW in V2)*
- `model_match_status`:
  - `matched` — 自动唯一命中标准型号
  - `ambiguous` — 命中多个候选型号（一对多冲突），待人工确认
  - `unmatched` — 未命中任何标准型号，待人工确认
  - `manual_confirmed` — 人工已确认标准型号
- `eligibility_status`:
  - `valid` — 有效销售（计入有效销量与销售额）
  - `excluded` — 已排除（留档可查，不计入有效销售）
  - `needs_review` — 待核对（如缺失金额、3C 缺品名/品牌等）
- `exclusion_reason`:
  - `BELOW_MIN_AMOUNT` — 销售额低于门槛（默认 `< 400.00`）
  - `RESHIP_ORDER` — 补发订单（`订单类型` 含补发）
  - `PRICE_DIFF` — 补收差价记录
  - `STATUS_CLOSED` — 交易关闭/取消/删除
  - `STATUS_REFUNDED` — 源订单行已全额/成功退款（按源规则判定无效）
  - `NO_PAY_TIME` — 缺失有效付款/成交时间
  - `ERP_NOT_ENABLED` — ERP 补全记录，所属店铺未开启 ERP 独立入销且未命中直出订单
  - `MISSING_AMOUNT` — 无法获取有效金额（如淘宝 N 列与百亿补贴均无有效值）
- `effective_time_basis`:
  - `business_time` *(V2 default)* — 业务日期（平台直出取 `pay_time`，手工/ERP 独立销售无付款时间时按规则取 `order_time`）
  - `order_time` — 下单时间
  - `pay_time` — 付款时间

---

## 2. MySQL 8.0 Schema Contract (`0002_v2_master_and_sales.py`)

Additive migration on top of `0001_phase1` (`utf8mb4_0900_ai_ci`). All Phase 1 tables remain intact; extended columns carry safe defaults so existing tests/data migrate cleanly.

### 2.1 `shops` (ALTER existing table)
Add columns:
```sql
ALTER TABLE shops
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
  ADD KEY idx_operator_type (operator_type);
```
> Keep `is_active` synced on write: `is_active = 1` when `shop_status = 'active'`, else `0`. Import lookup resolves shops with `shop_status IN ('active', 'dormant')`.

### 2.2 `shop_aliases` (NEW)
```sql
CREATE TABLE shop_aliases (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  shop_id BIGINT UNSIGNED NOT NULL,
  alias_name VARCHAR(128) NOT NULL,
  source_hint VARCHAR(32) NULL COMMENT 'Optional hint: taobao|tmall|jushuitan|manual|*',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_alias_name (alias_name),
  KEY idx_shop_id (shop_id),
  CONSTRAINT fk_shop_aliases_shop FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

### 2.3 `product_categories` (NEW)
```sql
CREATE TABLE product_categories (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_segment VARCHAR(64) NOT NULL COMMENT '业务板块: 家电|3C|...',
  category VARCHAR(64) NOT NULL COMMENT '品类: 空调|手机|热水器|...',
  brand VARCHAR(64) NOT NULL COMMENT '品牌: 美的|华凌|海信|苹果|...',
  report_brand VARCHAR(64) NULL COMMENT 'Optional report grouping override e.g. 海信热水器',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_category_brand (category, brand),
  KEY idx_segment_brand (business_segment, brand)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

### 2.4 `product_models` (NEW)
```sql
CREATE TABLE product_models (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

### 2.5 `product_unit_components` (NEW)
```sql
CREATE TABLE product_unit_components (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

### 2.6 `product_channel_mappings` (NEW)
```sql
CREATE TABLE product_channel_mappings (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```
> **Ambiguity semantics**: An active mapping `(channel_type, external_id)` is **ambiguous** when `shop_scope_id = 0` AND `secondary_external_id = ''` matches `> 1` distinct `model_id`s (or when the scoped lookup for an incoming row still returns `> 1` distinct `model_id`s). Storing 1-to-many rows without dropping them is intentional so conflicts remain visible in the Master Data conflict view and review queue.

### 2.7 `sales_rules` (NEW)
```sql
CREATE TABLE sales_rules (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  rule_key VARCHAR(64) NOT NULL,
  rule_name VARCHAR(128) NOT NULL,
  rule_group VARCHAR(32) NOT NULL COMMENT 'eligibility|amount|jd_merge|source_priority|brand_normalize',
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  config_json JSON NOT NULL,
  description VARCHAR(512) NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_rule_key (rule_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

### 2.8 `import_batches` (ALTER existing table)
```sql
ALTER TABLE import_batches
  ADD COLUMN source_role VARCHAR(32) NOT NULL DEFAULT 'direct_sales' COMMENT 'direct_sales|erp_enrich|erp_independent_sales' AFTER data_source,
  ADD COLUMN effective_rows INT UNSIGNED NOT NULL DEFAULT 0 AFTER warning_rows,
  ADD COLUMN excluded_rows INT UNSIGNED NOT NULL DEFAULT 0 AFTER effective_rows,
  ADD COLUMN pending_model_rows INT UNSIGNED NOT NULL DEFAULT 0 AFTER excluded_rows,
  ADD COLUMN enriched_rows INT UNSIGNED NOT NULL DEFAULT 0 AFTER pending_model_rows;
```

### 2.9 `order_lines` (ALTER existing table — Layer 1)
```sql
ALTER TABLE order_lines
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
  ADD CONSTRAINT fk_order_lines_model FOREIGN KEY (resolved_model_id) REFERENCES product_models(id) ON DELETE SET NULL;
```

### 2.10 `effective_sales_records` (NEW — Layer 2)
```sql
CREATE TABLE effective_sales_records (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

---

## 3. Built-in Rules & Deterministic Business Logic

### 3.1 Seeded Configurable `sales_rules`
Seeded idempotently (insert-if-missing so user edits persist):

| `rule_key` | `rule_group` | Default `enabled` | Default `config_json` |
| :--- | :--- | :---: | :--- |
| `min_sales_amount` | `eligibility` | `1` | `{"threshold": "400.00", "exclude_reason": "BELOW_MIN_AMOUNT"}` |
| `taobao_subsidy_fallback` | `amount` | `1` | `{"primary_column": "买家实付金额", "subsidy_column": "百亿补贴超链订单信息", "low_amount_notice_threshold": "1000.00"}` |
| `jd_whole_unit_merge` | `jd_merge` | `1` | `{"amount_field": "payable_amount", "exclude_outdoor_keyword": "外机", "prefer_positive_amount_main_row": true}` |
| `zero_received_use_paid` | `amount` | `1` | `{"brand_aliases": {"苹果手机": "苹果"}}` |
| `exclude_reship_and_price_diff` | `eligibility` | `1` | `{"reship_order_types": ["补发", "补发订单"], "price_diff_keywords": ["补收差价"]}` |
| `erp_source_priority` | `source_priority` | `1` | `{"default_erp_mode": "enrich_only", "enrich_fields": ["province", "city", "raw_model_hint", "erp_raw_status"], "never_overwrite_direct_fields": ["paid_amount", "payable_amount", "quantity", "pay_time", "raw_order_status"]}` |
| `tmall_order_id_priority` | `source_priority` | `1` | `{"prefer_lp_prefix": "LP", "fallback_order": ["交易订单号", "外部订单号", "分销订单号"], "fixed_shop_name": "天猫优品"}` |

### 3.2 Shop Resolution Order (Module 1 + Module 2)
When resolving a raw shop name (from file column or user-selected `default_shop_id`):
1. Normalize whitespace.
2. Exact match `shops.shop_name` where `shop_status IN ('active', 'dormant')`.
3. Exact match `shop_aliases.alias_name` → joined `shops` where `shop_status IN ('active', 'dormant')`.
4. Special Tmall ERP-A rule: if `tmall_order_id_priority.enabled` and file has `分销商店铺名称` without a matching shop/alias, suggest binding `分销商店铺名称` as a `shop_alias` of `天猫优品` (or auto-resolve once `天猫优品` + alias exist).
5. If shop exists with `shop_status = 'inactive'`, flag validation error `SHOP_INACTIVE` (do not silently treat as unknown).
6. If not found at all, list under `unknown_shops` (can be bound/created in Step 3 of Import Wizard).

### 3.3 Product Standard Model Matching Cascade (Module 1 + Module 2)
Given an incoming `order_line` with `(data_source, platform, shop_id, product_id, sku_code, product_name, sku_spec, raw_model_hint)`:

1. **3C Full-Name Shop Rule**: If `shop.preserve_full_product_name = 1`:
   - Take trimmed `product_name` as candidate `standard_model`, normalize brand via `zero_received_use_paid.brand_aliases` (`苹果手机` → `苹果`).
   - If `product_name` is blank → `model_match_status = 'unmatched'`, `eligibility_status = 'needs_review'`.
   - Else look up `product_models.standard_model` exact match (case-insensitive): if found → `matched` (`3c_full_name`); if not in `product_models` yet, still surface as `unmatched` with `raw_product_summary = product_name` so analyst can confirm/create in 1 click (or auto-match once created).
2. **Channel ID Lookup (Scoped → Secondary-keyed → Global)** using source-appropriate channel columns:
   - `jd`: `product_id` → `jd_sku_id`; fallback `sku_code` → `jst_sku_id` / `merchant_code`
   - `tmall` (ERP A): `sku_code` (`商品编码`/`货品编码`) → `tm_sku_id`; fallback `jst_sku_id`
   - `douyin`: `product_id` → `dy_sku_id`; fallback `sku_code` → `jst_i_id` / `merchant_code`; fallback `sku_spec` → `standard_model` exact
   - `pdd`: `product_id` (`商品id`) → `pdd_sku_id`; `sku_code` (`商家编码-规格维度` / `商家编码-商品维度`) → `jst_sku_id` / `jst_i_id` / `standard_model`
   - `taobao`: `product_id` (`商品ID`) → `tb_sku_id`; fallback `sku_code` → `merchant_code`
   - `jushuitan` / `manual`:
     - First try composite `(channel_type='jst_i_id', external_id=款号, secondary_external_id=商品编码)` and shop-scoped `shop_scope_id = shop.id`
     - Then `商品编码`/`原始商品编码` → `jst_sku_id`, `款号` → `jst_i_id`
     - Then platform-scoped `店铺款式编码` → (`pdd_sku_id` if `platform='pdd'`, `tb_sku_id` if `platform='taobao'`, etc.)
     - Then `标准商品名` / `款号` → `product_models.standard_model` exact
   - **Disambiguation order within each lookup**:
     1. Active mappings matching `(channel_type, external_id, secondary_external_id, shop_scope_id = shop.id)`
     2. Active mappings matching `(channel_type, external_id, secondary_external_id='', shop_scope_id = shop.id)`
     3. Active mappings matching `(channel_type, external_id, secondary_external_id = row_secondary, shop_scope_id = 0)`
     4. Active mappings matching `(channel_type, external_id, secondary_external_id='', shop_scope_id = 0)`
   - At the first tier with hits:
     - **1 distinct `model_id`** → `matched`!
     - **>1 distinct `model_id`** → STOP cascading and mark `ambiguous`, saving all candidate `{model_id, standard_model, brand, category}` into `model_match_candidates`! (Never silently guess!)
3. **Indoor/Outdoor Component Lookup**:
   - Normalize `raw_model_hint` / `sku_code` / `sku_spec` / extracted `KFR-...` token (strip Chinese chars, decode Excel `_x2162_` escapes, trim, `casefold`).
   - Match against `product_unit_components.component_model` OR `product_unit_components.mapping_value` (normalized).
   - 1 unique parent `model_id` → `matched` (`component_model`); >1 → `ambiguous`.
4. **Direct Standard Model Lookup**:
   - Normalized `raw_model_hint` / `sku_code` / `sku_spec` / `KFR-...` regex match against `product_models.standard_model`.
   - 1 unique hit → `matched` (`standard_model_exact` / `kfr_extract`); >1 → `ambiguous`; 0 → `unmatched`.

### 3.4 Source-Role Precedence & Upload-Order Independence
When committing rows to Layer 1 (`order_lines`):

| Existing Row in `order_lines` | Incoming Batch `source_role` | Behavior (Snapshots ALWAYS recorded before mutation!) |
| :--- | :--- | :--- |
| *(None)* | `direct_sales` | Insert row with `source_role = 'direct_sales'`. |
| *(None)* | `erp_independent_sales` | Insert row with `source_role = 'erp_independent_sales'` (only eligible if `shop.erp_sales_enabled = 1`; else stored with `source_role = 'erp_enrich'`). |
| *(None)* | `erp_enrich` | Insert row with `source_role = 'erp_enrich'` (held in Layer 1 so later `direct_sales` can inherit its province/city/ERP fields; in Layer 2 marked `excluded` with `ERP_NOT_ENABLED` unless `shop.erp_sales_enabled = 1`). |
| `direct_sales` | `direct_sales` | Standard `upsert` / `skip` strategy; preserve existing `erp_enriched_fields` (`province`, `city`, `erp_raw_status`) when the new direct file leaves them blank. |
| `direct_sales` | `erp_enrich` | **ENRICH ONLY**: NEVER overwrite `paid_amount`, `payable_amount`, `quantity`, `pay_time`, `order_time`, `raw_order_status`, `source_role`, `data_source`. Fill ONLY currently blank fields in `erp_source_priority.enrich_fields` (`province`, `city`, `raw_model_hint`), record `erp_raw_status`, set `erp_enriched = 1`, record filled field names in `erp_enriched_fields`. If `erp_raw_status` is `取消` while direct row is valid, add notice `"ERP状态为取消，保留直出判定"`. |
| `erp_enrich` | `direct_sales` | **PROMOTE TO DIRECT**: `direct_sales` takes full ownership (`source_role = 'direct_sales'`, direct amounts/quantities/times/status), while preserving previously captured non-empty ERP `province`, `city`, `erp_raw_status`, and marking `erp_enriched = 1` if any blank direct field inherited from ERP! |
| `erp_independent_sales` | `direct_sales` | Same as above: `direct_sales` takes precedence over ERP! |

> **Order-level ERP enrichment fallback**: When an `erp_enrich` row does not match by `(platform, platform_order_id, line_key)`, look up existing `direct_sales` rows sharing `(platform, platform_order_id)`. If the ERP batch provides a single unambiguous non-empty value for `province` / `city` / `erp_raw_status` on that order, enrich the blank fields on those existing direct lines (recording snapshots) without creating duplicate effective sales rows!

### 3.5 Platform Amount, Quantity & Eligibility Derivation (Layer 1 → Layer 2)
For every touched `(platform, shop_id, business_order_id)` group, `EffectiveSalesBuilder` deterministically derives `effective_sales_records`:

1. **Reshipment & Price-Diff Exclusion** (when `exclude_reship_and_price_diff.enabled = 1`):
   - If `is_reship = 1` (e.g. ERP `订单类型` contains `补发`) → `eligibility_status = 'excluded'`, `exclusion_reason = 'RESHIP_ORDER'`.
   - If product name / remarks contain `补收差价` → `eligibility_status = 'excluded'`, `exclusion_reason = 'PRICE_DIFF'`.
2. **JD Whole-Unit Merging** (when `platform = 'jd'` and `jd_whole_unit_merge.enabled = 1`):
   - Group all Layer 1 `order_lines` for `(platform='jd', shop_id, platform_order_id)`.
   - Collect all `source_order_line_ids`.
   - Check combined raw statuses across all lines in the order: if ANY line status contains `取消`, `关闭`, or `(删除)` / `删除` → `eligibility_status = 'excluded'`, `exclusion_reason = 'STATUS_CLOSED'`.
   - Pick **Primary Row**: first line where `product_name` does NOT contain `外机` AND `payable_amount > 0` (fallback: first non-outdoor line; fallback: first line).
   - `sales_quantity` = primary row's `quantity` (whole-unit count; outdoor unit row is linked in `source_order_line_ids` and NOT added to quantity!).
   - `sales_amount` = primary row's `payable_amount` (`应付金额(K)`), `amount_source = 'jd_payable'` (fallback to `paid_amount` only if `payable_amount` is null, marked `jd_paid_fallback`).
   - `model_id` / `model_match_status` = resolved from primary row (if primary row is indoor component, component mapping already maps it to the parent whole-unit `standard_model`!).
   - `record_key = 'whole_unit'` (if an order legitimately contains >1 distinct non-outdoor main products, emit one record per main row with `record_key = main_line.line_key`).
3. **Taobao Rules** (when `data_source = 'taobao'`):
   - `business_order_id` = `sub_order_id` if present else `platform_order_id`.
   - When `taobao_subsidy_fallback.enabled = 1`:
     - If `N` (`买家实付金额`) > 0 → `sales_amount = N`, `amount_source = 'taobao_buyer_paid'`. If `0 < N < low_amount_notice_threshold (1000.00)` → append notice `"买家实付低于1000元({N})"`.
     - Else if `AI` (`百亿补贴超链订单信息`) contains parseable `供货单价` → `sales_amount = supply_unit_price * quantity`, `amount_source = 'taobao_bybt_supply'`.
     - Else → `eligibility_status = 'needs_review'`, `exclusion_reason = 'MISSING_AMOUNT'`.
   - Exclude if `raw_order_status` contains `交易关闭` (`STATUS_CLOSED`), `refund_status` contains `退款成功` (`STATUS_REFUNDED`), or `pay_time` is null (`NO_PAY_TIME`).
4. **Tmall ERP-A Rules** (when `data_source = 'tmall'` / `tmall_erp_a`):
   - `business_order_id` priority (when `tmall_order_id_priority.enabled = 1`): `发货LP号` (if starts with `LP`) > `交易订单号` > `外部订单号` > `分销订单号` > `系统单号`.
   - `sales_amount = 实收金额` (`amount_source = 'tmall_actual_received'`), `sales_quantity = 订货数量`.
   - Exclude if `raw_order_status == '关闭'` (`STATUS_CLOSED`), `refund_status == '是'` (`STATUS_REFUNDED`), or `pay_time` is null (`NO_PAY_TIME`).
5. **Pinduoduo Rules**:
   - `sales_amount = 商家实收金额` (`amount_source = 'pdd_merchant_received'`), `business_time = pay_time` (`订单成交时间`).
   - Exclude if `pay_time` is null (`NO_PAY_TIME` — note: Layer 1 still retains the row with derived `order_time` from order ID prefix!), `raw_order_status` contains `取消` or `退款成功`, or `refund_status` contains `退款成功`.
6. **Douyin Rules**:
   - `business_order_id` = `platform_order_id` (主订单编号), `sales_amount = 订单应付金额` (`amount_source = 'douyin_payable'`), `business_time = pay_time`.
   - Exclude if `pay_time` is null (`NO_PAY_TIME`), `raw_order_status` contains `关闭` or `取消`, or `refund_status` contains `退款成功` or `已全额退款`.
7. **Jushuitan ERP / Manual Independent Sales Rules**:
   - Only eligible when `shop.erp_sales_enabled = 1` AND `source_role = 'erp_independent_sales'`; otherwise `excluded` (`ERP_NOT_ENABLED`).
   - `business_time = pay_time or order_time` (for manual/ERP-independent shops, `order_time` is valid when `pay_time` is null).
   - If `shop.zero_received_use_paid = 1` (e.g. `智电汇通3C店`) AND `zero_received_use_paid.enabled = 1` AND `卖家实收金额 == 0`:
     - If `erp_paid_amount` (`已付金额(V)`) is null → `needs_review` (`MISSING_AMOUNT`).
     - Else use `erp_paid_amount` as whole-row `sales_amount` (`amount_source = 'erp_paid_fallback'`), append notice `"卖家实收为0，改取已付金额"`.
   - Exclude if `refund_status` is non-empty and not in `('未申请退款', '退款关闭')` or status is `取消`/`关闭`.
8. **Minimum Sales Amount Threshold** (applied last to otherwise-valid records when `min_sales_amount.enabled = 1`):
   - If `sales_amount < Decimal(threshold)` (default `400.00`) → `eligibility_status = 'excluded'`, `exclusion_reason = 'BELOW_MIN_AMOUNT'`. (`sales_amount == 400.00` is KEPT as `valid`.)
9. **No Fake Refund Inference in V2 Effective Sales**:
   - V2 `effective_sales_records` records pure **sales facts** (`sales_quantity`, `sales_amount`) and status-based sales validity. Actual financial refunds and net-sales recalculations belong to **Module 3** (never fabricate refund amounts inside Module 2 effective sales!).

---

## 4. REST API Contract (`/api/v1/...`)

All errors follow the existing Phase 1 envelope:
```json
{ "error": { "code": "ERROR_CODE", "message": "Human readable Chinese/English message", "details": {} } }
```

### 4.1 Master Data — Shops & Aliases

#### `GET /api/v1/shops`
Query params: `platform?`, `operator_type?`, `sales_mode?`, `shop_status?`, `erp_sales_enabled?` (`true|false`), `keyword?`
Response `200`:
```json
{
  "items": [
    {
      "id": 1,
      "shop_name": "智电汇通3C店",
      "platform": "taobao",
      "operator_type": "self_operated",
      "entity_name": "示例主体A",
      "sales_mode": "hybrid",
      "shop_status": "active",
      "is_active": true,
      "default_data_source": "jushuitan",
      "erp_sales_enabled": true,
      "zero_received_use_paid": true,
      "preserve_full_product_name": true,
      "notes": null,
      "aliases": [
        { "id": 1, "shop_id": 1, "alias_name": "展翅豪鹏3C店", "source_hint": "manual" }
      ],
      "created_at": "2026-11-27T08:00:00",
      "updated_at": "2026-11-27T08:00:00"
    }
  ],
  "summary": {
    "total": 38,
    "active": 18,
    "dormant": 5,
    "inactive": 15,
    "erp_sales_enabled": 8
  }
}
```

#### `POST /api/v1/shops` & `PUT /api/v1/shops/{shop_id}` & `DELETE /api/v1/shops/{shop_id}`
Request body (`POST` / `PUT`):
```json
{
  "shop_name": "华凌华晟联采专卖店",
  "platform": "tmall",
  "operator_type": "self_operated",
  "entity_name": "主体名称",
  "sales_mode": "hybrid",
  "shop_status": "active",
  "default_data_source": "tmall",
  "erp_sales_enabled": true,
  "zero_received_use_paid": false,
  "preserve_full_product_name": false,
  "notes": ""
}
```
> Keep backward compatibility with Phase 1 callers that send only `{shop_name, platform, default_data_source, is_active}` by defaulting missing V2 fields (`operator_type='self_operated'`, `shop_status='active'` if `is_active` else `'inactive'`).

#### `POST /api/v1/shops/{shop_id}/aliases` & `DELETE /api/v1/shops/aliases/{alias_id}`
Request (`POST`): `{ "alias_name": "展翅豪鹏3C店", "source_hint": "manual" }` → `201` returns alias object. Duplicate `alias_name` returns `409 ALIAS_ALREADY_EXISTS`.

#### `POST /api/v1/master-data/shops/import-excel`
`multipart/form-data`: `file` (`店铺基础信息.xlsx`)
Behavior: Reads `店铺信息` (and validates against `运营方与平台` / `主体` / `销售模式` / `店铺状态` sheets when present). Maps Chinese labels → canonical enums (`代运营→agency_operated`, `自运营→self_operated`, `经销→dealer`, `分销→distribution`, `混合→hybrid`, `启用→active`, `休眠→dormant`, `未启用→inactive`, `焕新生活→huanxin`, `淘宝→taobao`, `天猫→tmall`, `拼多多→pdd`, `京东→jd`, `抖音→douyin`). Upserts by `shop_name` without wiping existing `aliases` or per-shop flags (`erp_sales_enabled`, etc.).
Response `200`:
```json
{
  "total_rows": 38,
  "inserted": 38,
  "updated": 0,
  "skipped": 0,
  "warnings": []
}
```

---

### 4.2 Master Data — Products (Categories, Models, Components, Channel Mappings)

#### `GET /api/v1/products/categories` & `POST /api/v1/products/categories` & `PUT /api/v1/products/categories/{id}` & `DELETE /api/v1/products/categories/{id}`
Item shape: `{ "id": 1, "business_segment": "家电", "category": "空调", "brand": "美的", "report_brand": null }`.

#### `GET /api/v1/products/models`
Query params: `business_segment?`, `category?`, `brand?`, `keyword?`, `only_with_components?`, `only_ambiguous?`, `page=1`, `page_size=50`
Response `200`:
```json
{
  "items": [
    {
      "id": 10,
      "standard_model": "KFR-35GW/N8HE1Ⅱ",
      "category_id": 1,
      "business_segment": "家电",
      "category": "空调",
      "brand": "华凌",
      "is_3c_full_name": false,
      "is_active": true,
      "notes": null,
      "component_count": 2,
      "mapping_count": 5,
      "has_ambiguous_mapping": false,
      "components": [
        { "id": 1, "model_id": 10, "component_model": "KFR-35G/N8HE1Ⅱ", "unit_type": "indoor", "mapping_value": null },
        { "id": 2, "model_id": 10, "component_model": "KFR-35W/N8HE1Ⅱ", "unit_type": "outdoor", "mapping_value": null }
      ],
      "channel_mappings": [
        { "id": 100, "model_id": 10, "channel_type": "jd_sku_id", "external_id": "1000123456", "secondary_external_id": "", "shop_scope_id": 0, "shop_scope_name": null, "match_source": "excel_import", "is_active": true, "is_ambiguous": false }
      ]
    }
  ],
  "total": 173,
  "page": 1,
  "page_size": 50,
  "summary": {
    "total_categories": 13,
    "total_models": 173,
    "total_components": 78,
    "total_channel_mappings": 494,
    "ambiguous_id_groups": 9
  }
}
```

#### `POST /api/v1/products/models` & `PUT /api/v1/products/models/{model_id}` & `DELETE /api/v1/products/models/{model_id}`
Body: `{ "standard_model", "business_segment", "category", "brand", "is_3c_full_name?", "is_active?", "notes?" }` (auto-links or creates `product_categories` row).

#### `POST /api/v1/products/models/{model_id}/components` & `PUT /api/v1/products/components/{id}` & `DELETE /api/v1/products/components/{id}`
Body: `{ "component_model": "KFR-35G/...", "unit_type": "indoor", "mapping_value": null }`.

#### `GET /api/v1/products/channel-mappings`
Query params: `channel_type?`, `external_id?`, `model_id?`, `only_ambiguous?` (`true|false`), `keyword?`, `page=1`, `page_size=50`
Response `200`:
```json
{
  "items": [
    {
      "id": 12,
      "model_id": 10,
      "standard_model": "KFR-35GW/...",
      "brand": "华凌",
      "category": "空调",
      "channel_type": "jst_sku_id",
      "external_id": "SKU-CONFLICT-01",
      "secondary_external_id": "",
      "shop_scope_id": 0,
      "shop_scope_name": null,
      "match_source": "excel_import",
      "is_active": true,
      "is_ambiguous": true,
      "conflict_models": [
        { "model_id": 10, "standard_model": "MODEL-A", "brand": "华凌" },
        { "model_id": 11, "standard_model": "MODEL-B", "brand": "华凌" }
      ]
    }
  ],
  "total": 12,
  "ambiguous_groups": [
    {
      "channel_type": "jst_sku_id",
      "external_id": "SKU-CONFLICT-01",
      "candidate_models": [
        { "model_id": 10, "standard_model": "MODEL-A", "brand": "华凌", "category": "空调" },
        { "model_id": 11, "standard_model": "MODEL-B", "brand": "华凌", "category": "空调" }
      ]
    }
  ]
}
```

#### `POST /api/v1/products/channel-mappings` & `PUT /api/v1/products/channel-mappings/{id}` & `DELETE /api/v1/products/channel-mappings/{id}`
Body: `{ "model_id", "channel_type", "external_id", "secondary_external_id?", "shop_scope_id?", "match_source?", "is_active?" }`.

#### `POST /api/v1/master-data/products/import-excel`
`multipart/form-data`: `file` (`产品基础信息.xlsx`)
Behavior: Reads 4 sheets (`产品分类`, `产品型号`, `产品内外机`, `产品ID匹配`). Normalizes header `tm_sku-id` → `tm_sku_id`. Unpivots non-empty ID columns per row into `product_channel_mappings` (preserving `jst_i_id` + `jst_sku_id` pairs as individual channel rows AND recording `secondary_external_id = jst_sku_id` when both present if desired, OR storing clean per-channel rows so ambiguity matches audit expectations: store each non-empty column as `(channel_type, external_id, secondary_external_id='')` AND when both `jst_i_id` and `jst_sku_id` exist on the same row, also store a paired disambiguator or check both at match time — **Contract Rule**: store each non-empty column as its own `(model_id, channel_type, external_id, secondary_external_id='', shop_scope_id=0)` row so all 7 channel columns are independently searchable, and detect all 1-to-many conflicts cleanly!).
Response `200`:
```json
{
  "categories": { "inserted": 13, "updated": 0 },
  "models": { "inserted": 173, "updated": 0 },
  "components": { "inserted": 78, "updated": 0 },
  "channel_mappings": { "inserted": 494, "updated": 0 },
  "ambiguous_conflicts": [
    {
      "channel_type": "pdd_sku_id",
      "external_id": "...",
      "models": ["MODEL-A", "MODEL-B"]
    }
  ],
  "warnings": []
}
```

---

### 4.3 Configurable Sales Rules

#### `GET /api/v1/sales-rules`
Response `200`: `{ "items": [ { "rule_key", "rule_name", "rule_group", "enabled", "config_json", "description", "updated_at" } ] }`

#### `PUT /api/v1/sales-rules/{rule_key}`
Request body: `{ "enabled": true, "config_json": { ... } }` → `200` returns updated rule. Unknown `rule_key` returns `404 RULE_NOT_FOUND`.

---

### 4.4 Enhanced V2 Order Ingestion Endpoints

#### `POST /api/v1/imports/parse-preview`
Same `multipart/form-data` (`file`, `sheet_name?`).
Enhanced response adds:
- `recommended_source_role`: `'direct_sales' | 'erp_enrich' | 'erp_independent_sales'` (e.g., `jushuitan_erp_b` defaults to `'erp_enrich'`; `tmall_erp_a` / `jd_orders` / `pdd_orders` / `taobao_tmall_orders` / `douyin_orders` default to `'direct_sales'`; manual ERP files default to `'erp_independent_sales'`)
- Built-in template `tmall_erp_a` (for `天猫订单.xlsx` header fingerprint `["系统单号", "发货LP号", "分销商店铺名称", "实收金额"]`, distinct from `taobao_tmall_orders`!).

#### `POST /api/v1/imports/validate`
Enhanced request body adds optional `source_role` (`direct_sales|erp_enrich|erp_independent_sales`, defaults to template recommendation).
Enhanced response keeps all Phase 1 fields AND adds `v2_summary`:
```json
{
  "validation_id": "val_...",
  "source_role": "direct_sales",
  "summary": {
    "total_rows": 1765,
    "valid_rows": 1765,
    "error_rows": 0,
    "warning_rows": 12,
    "estimated_inserts": 1765,
    "estimated_updates": 0,
    "prorated_orders": 0
  },
  "v2_summary": {
    "estimated_effective_valid": 660,
    "estimated_excluded": 232,
    "estimated_needs_review": 0,
    "estimated_erp_enriched": 0,
    "jd_merged_orders": 871,
    "model_matched": 645,
    "model_ambiguous": 5,
    "model_unmatched": 10,
    "exclusion_breakdown": {
      "STATUS_CLOSED": 210,
      "BELOW_MIN_AMOUNT": 22
    }
  },
  "unknown_shops": [],
  "inactive_shops": [],
  "unknown_statuses": [],
  "errors_preview": [],
  "warnings_preview": [],
  "ambiguous_model_preview": [
    {
      "row_number": 42,
      "platform_order_id": "ORD...",
      "channel_type": "pdd_sku_id",
      "external_id": "123456",
      "raw_product_name": "...",
      "model_match_status": "ambiguous",
      "candidates": [
        { "model_id": 10, "standard_model": "MODEL-A", "brand": "华凌", "category": "空调" }
      ]
    }
  ],
  "cleaned_sample_rows": []
}
```

#### `POST /api/v1/imports/commit`
Same request body (`validation_id`, `duplicate_strategy`, `skip_error_rows`).
Enhanced response keeps all Phase 1 fields AND adds:
`source_role`, `effective_rows`, `excluded_rows`, `pending_model_rows`, `enriched_rows`.

#### `POST /api/v1/batches/{batch_id}/rollback`
Same endpoint & conflict rule (`409 ROLLBACK_CONFLICT`).
Enhanced behavior: inside the same transaction, after restoring `order_lines` from `import_batch_snapshots`, deterministically rebuilds (or removes if no contributing `order_lines` remain) every `effective_sales_records` row whose `(platform, shop_id, business_order_id)` was touched by the rolled-back batch!

---

### 4.5 Effective Sales Workbench & Export

#### `GET /api/v1/effective-sales`
Query params:
- `time_basis`: `business_time` (default) | `order_time` | `pay_time` (reject `ship_time` with `422`)
- `start_date`, `end_date` (`YYYY-MM-DD`, inclusive)
- `platform?`, `shop_id?`, `brand?`, `category?`, `business_segment?`, `standard_model?`
- `eligibility_status?`: `valid` (default) | `excluded` | `needs_review` | `all`
- `model_match_status?`: `matched` | `ambiguous` | `unmatched` | `manual_confirmed` | `pending` (`ambiguous` + `unmatched`) | `all`
- `source_role?`, `batch_id?`, `keyword?` (matches `business_order_id`, `standard_model`, `raw_product_summary`)
- `page=1`, `page_size=50`

Response `200`:
```json
{
  "items": [
    {
      "id": 101,
      "platform": "jd",
      "shop_id": 5,
      "shop_name": "华凌京东自营示例店",
      "business_order_id": "JD20261124001",
      "record_key": "whole_unit",
      "source_role": "direct_sales",
      "primary_data_source": "jd",
      "source_order_line_ids": [501, 502],
      "business_time": "2026-11-24T10:15:00",
      "order_time": "2026-11-24T10:12:00",
      "pay_time": "2026-11-24T10:15:00",
      "model_id": 10,
      "standard_model": "KFR-35GW/N8HE1Ⅱ",
      "brand": "华凌",
      "category": "空调",
      "business_segment": "家电",
      "model_match_status": "matched",
      "model_match_method": "jd_sku_id",
      "model_match_candidates": null,
      "raw_product_summary": "华凌大1.5匹空调...",
      "sales_quantity": 1,
      "sales_amount": "2499.00",
      "amount_source": "jd_payable",
      "eligibility_status": "valid",
      "exclusion_reason": null,
      "notices": [],
      "province": "广东省",
      "city": "佛山市",
      "raw_order_status": "完成",
      "erp_enriched": false,
      "last_batch_id": 12
    }
  ],
  "total": 660,
  "page": 1,
  "page_size": 50,
  "kpi": {
    "total_records": 892,
    "valid_records": 660,
    "valid_sales_quantity": 672,
    "valid_sales_amount": "1824500.00",
    "excluded_records": 232,
    "needs_review_records": 0,
    "pending_model_records": 15
  }
}
```

#### `GET /api/v1/effective-sales/{record_id}`
Response `200`: returns the `effective_sales_records` object PLUS `source_order_lines: OrderLine[]` (full Layer 1 rows, e.g., both indoor and outdoor rows for a merged JD order, with `raw_extra`, `payable_amount`, `paid_amount`, `erp_enriched_fields`, `erp_raw_status`).

#### `GET /api/v1/effective-sales/export`
Same filter params as `GET /api/v1/effective-sales` + `format=xlsx|csv` (default `xlsx`).
Columns: `订单号`, `店铺`, `平台`, `业务板块`, `品类`, `品牌`, `标准型号`, `型号匹配状态`, `业务时间`, `销量`, `销售额`, `金额来源`, `有效性状态`, `排除/待核对原因`, `来源角色`, `是否ERP补全`, `省份`, `城市`, `原始订单状态`, `备注提示`.
Long order IDs MUST be formatted as text (`@`) in `.xlsx` and UTF-8-BOM in `.csv`.

---

### 4.6 Pending Model Confirmation Queue & One-Click Rule Learning

#### `GET /api/v1/model-review/pending`
Query params: `status?` (`ambiguous|unmatched|all`, default `all`), `platform?`, `shop_id?`, `data_source?`, `eligibility_status?` (`valid|all`, default `all`), `keyword?`, `page=1`, `page_size=50`
Returns **grouped** pending items so analysts can confirm dozens/hundreds of identical raw products in a single action!
Response `200`:
```json
{
  "groups": [
    {
      "group_key": "pdd|pdd_sku_id|987654321|0",
      "data_source": "pdd",
      "platform": "pdd",
      "shop_id": 3,
      "shop_name": "拼多多示例店",
      "channel_type": "pdd_sku_id",
      "external_id": "987654321",
      "secondary_external_id": "",
      "raw_model_hint": "KFR-35...",
      "raw_product_summary": "示例空调挂机...",
      "model_match_status": "ambiguous",
      "candidates": [
        { "model_id": 10, "standard_model": "MODEL-A", "brand": "华凌", "category": "空调" },
        { "model_id": 11, "standard_model": "MODEL-B", "brand": "华凌", "category": "空调" }
      ],
      "affected_record_count": 48,
      "valid_record_count": 42,
      "total_sales_amount": "98400.00",
      "sample_record_ids": [101, 102, 103]
    }
  ],
  "total_groups": 6,
  "total_pending_records": 84,
  "ambiguous_records": 52,
  "unmatched_records": 32
}
```

#### `POST /api/v1/model-review/resolve`
Request body:
```json
{
  "record_ids": [101, 102],
  "group_filter": {
    "data_source": "pdd",
    "shop_id": 3,
    "channel_type": "pdd_sku_id",
    "external_id": "987654321",
    "secondary_external_id": "",
    "raw_product_summary": "示例空调挂机..."
  },
  "model_id": 10,
  "save_as_mapping_rule": true,
  "rule_scope": "shop"
}
```
> Either `record_ids` (non-empty array) OR `group_filter` MUST be provided.
> `rule_scope`: `'shop'` (default when resolving an `ambiguous` conflict — creates a shop-scoped rule `shop_scope_id = shop_id` so it breaks the 1-to-many tie cleanly!) or `'global'` (`shop_scope_id = 0`, ideal when resolving an `unmatched` new external_id!).
> When `save_as_mapping_rule = true`, backend inserts/activates the `product_channel_mappings` row (`match_source = 'learned_from_review'`) AND retroactively updates all matching pending `order_lines` + `effective_sales_records` to `manual_confirmed`!

Response `200`:
```json
{
  "resolved_effective_records": 48,
  "resolved_order_lines": 48,
  "saved_mapping_id": 501,
  "retroactively_resolved_records": 48
}
```

---

## 5. Error Codes Additions

| Code | HTTP | Meaning |
| :--- | :---: | :--- |
| `SHOP_INACTIVE` | 422 | Referenced shop exists in master data with `shop_status = 'inactive'` |
| `ALIAS_ALREADY_EXISTS` | 409 | Shop alias name is already bound to another shop |
| `MODEL_ALREADY_EXISTS` | 409 | `standard_model` already exists in `product_models` |
| `COMPONENT_ALREADY_EXISTS` | 409 | `component_model` already bound to a standard model |
| `RULE_NOT_FOUND` | 404 | Unknown `sales_rules.rule_key` |
| `INVALID_MASTER_EXCEL` | 422 | Uploaded master-data Excel is missing required sheets or column headers |
| `INVALID_REVIEW_TARGET` | 422 | Neither `record_ids` nor `group_filter` provided in `/model-review/resolve` |
