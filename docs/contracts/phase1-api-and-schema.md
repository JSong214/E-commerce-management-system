# Phase 1 Contract: MySQL Schema, Cleaning Rules & REST API

> **Contract-First Boundary** (see `AGENTS.md`): Both **Codex** (`backend/`) and **Antigravity** (`frontend/`) MUST implement against this contract. Any change to table schemas, metric formulas, or API payloads must update this file first.
>
> All domain terms and metric formulas follow [`GLOSSARY.md`](../../GLOSSARY.md).

---

## 1. Canonical Enums & Constants

### 1.1 `data_source` (Data Source — where the file was exported from)
- `taobao`
- `tmall`
- `douyin`
- `jd`
- `pdd`
- `jushuitan`
- `custom`

### 1.2 `platform` (Platform — marketplace where customer placed the order)
- `taobao`
- `tmall`
- `douyin`
- `jd`
- `pdd`
- `other`

### 1.3 `normalized_status` (Normalized Order Status)
- `pending_pay` — 待付款
- `paid_unshipped` — 已付款待发货
- `shipped` — 已发货 / 待收货
- `completed` — 已完成 / 交易成功
- `closed_cancelled` — 已关闭 / 取消 / 删除

### 1.4 `time_basis` (Report Time Basis — `ship_time` intentionally excluded)
- `order_time` (default)
- `pay_time`

### 1.5 `duplicate_strategy`
- `upsert` (default)
- `skip`

---

## 2. MySQL 8.0 Schema Contract (`utf8mb4_0900_ai_ci`)

### 2.1 `shops` — Shop to Platform Mapping
```sql
CREATE TABLE shops (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  shop_name VARCHAR(128) NOT NULL,
  platform VARCHAR(32) NOT NULL COMMENT 'taobao|tmall|douyin|jd|pdd|other',
  default_data_source VARCHAR(32) NULL COMMENT 'Optional hint: taobao|tmall|douyin|jd|pdd|jushuitan',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_shop_name (shop_name),
  KEY idx_platform (platform)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

### 2.2 `mapping_templates` — Source Column Mapping Templates
```sql
CREATE TABLE mapping_templates (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

### 2.3 `status_mappings` — Platform Status Normalization Dictionary
```sql
CREATE TABLE status_mappings (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  data_source VARCHAR(32) NOT NULL COMMENT 'Source code or * for global fallback',
  raw_status VARCHAR(128) NOT NULL,
  normalized_status VARCHAR(32) NOT NULL COMMENT 'pending_pay|paid_unshipped|shipped|completed|closed_cancelled',
  is_valid_for_gmv TINYINT(1) NOT NULL DEFAULT 1 COMMENT '0 for pending_pay and pre-payment cancellations',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_source_raw_status (data_source, raw_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

### 2.4 `import_batches` — Import Execution Ledger
```sql
CREATE TABLE import_batches (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

### 2.5 `import_batch_errors` — Validation Error Rows (Retained for Download)
```sql
CREATE TABLE import_batch_errors (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  batch_id BIGINT UNSIGNED NOT NULL,
  row_number INT UNSIGNED NOT NULL COMMENT '1-based source file row number (excluding header or clearly stated)',
  field_name VARCHAR(64) NOT NULL,
  raw_value VARCHAR(512) NULL,
  error_code VARCHAR(64) NOT NULL,
  error_message VARCHAR(255) NOT NULL,
  raw_row_sanitized JSON NOT NULL COMMENT 'Original row with buyer PII already stripped, used for error-row Excel export',
  KEY idx_batch_id (batch_id),
  CONSTRAINT fk_errors_batch FOREIGN KEY (batch_id) REFERENCES import_batches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

### 2.6 `order_lines` — Canonical Sales Fact Table (Order-SKU Grain)
```sql
CREATE TABLE order_lines (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

### 2.7 `import_batch_snapshots` — Pre-Update Snapshots for Exact Batch Rollback
```sql
CREATE TABLE import_batch_snapshots (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  batch_id BIGINT UNSIGNED NOT NULL,
  order_line_id BIGINT UNSIGNED NOT NULL,
  action_type VARCHAR(16) NOT NULL COMMENT 'insert|update',
  before_state JSON NULL COMMENT 'Full pre-update column snapshot of order_lines when action_type=update; NULL when insert',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_batch_action (batch_id, action_type),
  KEY idx_order_line_batch (order_line_id, batch_id),
  CONSTRAINT fk_snapshots_batch FOREIGN KEY (batch_id) REFERENCES import_batches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

**Exact Rollback Algorithm (`POST /api/v1/batches/{batch_id}/rollback`)**:
1. Reject with HTTP `409` (`ROLLBACK_CONFLICT`) if `batch.status != 'committed'`, OR if there exists any **newer committed batch** (`b.id > batch_id AND b.status = 'committed'`) that has a snapshot referencing any `order_line_id` touched by `batch_id` (return the blocking `batch_no` list in `details.blocking_batches`).
2. Inside one DB transaction:
   - Delete all `order_lines` where `id IN (SELECT order_line_id FROM import_batch_snapshots WHERE batch_id = :batch_id AND action_type = 'insert')`.
   - For all rows with `action_type = 'update'`, restore every column of `order_lines` (including `last_batch_id` and `raw_extra`) from `before_state` JSON.
   - Update `import_batches` set `status = 'rolled_back'`, `rolled_back_at = NOW()`.

---

## 3. Built-in Mapping Templates (7 Presets Seeded from Real Headers)

### Global PII Strip List (NEVER persisted in canonical columns OR `raw_extra`)
Any column matching (case-insensitive / trimmed) these names is dropped immediately on parse:
`收件人`, `收货人`, `收货人姓名`, `收件人手机号`, `手机`, `电话`, `联系电话`, `联系方式备注`, `收货人地址`, `详细地址`, `地址(包含省市区)`, `区`, `区县`, `街道`, `买家昵称`, `下单帐号`, `邮箱地址`, `纳税人识别号`, `名称（个人）`, `单位地址`, `单位电话`, `开户银行`, `银行账号`, `门店联系人`, `门店联系电话`, `门店地址`.
*(Allowed geographic fields: `省`/`省份` → `province`, `市`/`城市` → `city`.)*

### Global Cleaning Rules (Calibrated Against Real Multi-Platform Exports)
1. **Order/Sub-order/Product/SKU IDs**: Always read as strings (never float). Strip leading/trailing whitespace, leading `'`, and Excel formula wrapper `="..."` (e.g., `="3622464000487748"` → `3622464000487748`).
2. **Numeric / Currency & Placeholder Sanitization**: Strip `¥`, `￥`, `,`, whitespace, and trailing parenthetical annotations such as `（系统计算中，该值仅供参考）` or `(仅供参考)`. Example: `"2449.00（系统计算中，该值仅供参考）"` → `Decimal("2449.00")`. Placeholders such as `无退款申请`, `-`, `--`, `无`, `暂无`, `None`, `null` on optional money columns default to `0.00` (and `NULL` on optional date columns); literal `None`/`null` in multi-column fallbacks (e.g., Jushuitan `子订单状态` → `状态`) falls through to the next candidate column.
3. **Merchant Receivable Caliber (商家实收口径)**: Built-in templates align `paid_amount` to merchant-received sales (including platform/government subsidies): JD `商家应收`, PDD `商家实收金额(元)`, Jushuitan ERP A `实收金额` (fallback `商品小计`), Jushuitan ERP B `卖家实收金额` / `卖家实收` (fallback `买家实付金额` / `买家实付`), Douyin `订单应付金额`, Taobao/Tmall `买家实付金额` (with 百亿补贴超链 `供货单价 × 数量` fallback when enabled).
4. **JD Order-Level Amount Proration** (enabled when `rules.prorate_order_amount == true`):
   - Group rows in the uploaded file by `platform_order_id`.
   - If an order has > 1 row and every row carries the repeated order-level `paid_amount` (or only the first row carries it):
     - Take the unique order total `T` (from the first non-null positive/zero order-level value; raise validation warning if conflicting non-zero totals appear in the same order).
     - Compute line weight `w_i = (unit_price_i or 0) * quantity_i`.
     - If `SUM(w_i) > 0`: allocate `floor_2dp(T * w_i / SUM(w_i))` to each positive-weight row (`0.00` to zero-weight rows like `0.00`-priced AC outdoor units), and add the cent remainder `T - SUM(allocated)` to the last row with `w_i > 0`.
     - Else if `SUM(quantity_i) > 0`: allocate proportionally by `quantity_i` with cent remainder on the last row.
     - Mark `is_amount_prorated = 1`.
5. **Taobao 百亿补贴超链 Supply Price Extraction** (`rules.extract_bybt_supply_price == true`):
   - When `paid_amount` is `0.00` or empty and `百亿补贴超链订单信息` / `超链半托管订单信息` contains `供货单价:¥<amount>`: populate `unit_price`, `gross_amount`, and (for paid orders) `paid_amount = supply_price * quantity`. Unpaid closed/pending orders with blank `paid_amount` default to `0.00`.
6. **PDD Unpaid Order Date Derivation** (`rules.derive_order_time_from_pdd_order_id == true`):
   - When `订单成交时间` is empty on unpaid/cancelled PDD rows and `platform_order_id` matches `^YYMMDD-`, derive `order_time = 20YY-MM-DD 00:00:00` while keeping `pay_time = NULL` (`is_valid_for_gmv = 0`).
7. **Deterministic `line_key` & Cross-Source PDD Deduplication**:
   - If `sub_order_id` is mapped and non-empty (excluding synthetic Jushuitan PDD sub-order IDs like `{pdd_order_id}_{sku_id}` or UUIDs on `platform == 'pdd'` so PDD direct exports and Jushuitan PDD exports share identical keys while keeping reissue IDs distinct) → `line_key = sub_order_id`.
   - Else → `base = product_id or sku_code or sha1_8(product_name)` on `platform == 'pdd'` (guaranteeing 100% cross-source key identity between PDD `商品id` and Jushuitan `店铺款式编码`), and `base = sku_code or product_id or sha1_8(product_name)` on other platforms. Within each `platform_order_id` in file row order, count occurrences of `base` starting at `1`: `line_key = f"{base}#{occ}"`.
8. **GMV Validity (`is_valid_for_gmv`) & Default Full-Refund Estimation (`rules.infer_full_refund_from_status`)**:
   - `is_valid_for_gmv = 0` when `normalized_status == 'pending_pay'`, OR when `raw_order_status` starts with `(删除)` (JD deleted/paused orders), OR when `normalized_status == 'closed_cancelled'` AND `pay_time IS NULL` (pre-payment cancellation).
   - `is_valid_for_gmv = 1` otherwise (paid orders including post-payment refunds, since `Net Sales = GMV - Refund Amount`).
   - When `rules.infer_full_refund_from_status == true`, `is_valid_for_gmv == 1`, `pay_time IS NOT NULL`, `paid_amount > 0`, and no positive numeric `refund_amount` was supplied, rows whose status/refund_status unambiguously indicate full refund (`refund_status in {'退款成功','已全额退款','成功退款'}`, `raw_order_status in {'未发货，退款成功','已发货，退款成功','已收货，退款成功'}`, or `normalized_status == 'closed_cancelled' and refund_status == '是'`) default `refund_amount = paid_amount` with a warning (later overwritable via Upsert of manually cleaned refund files).

### 7 Built-in Preset Mappings

| Preset Code | Source | Needs Default Shop? | Key Header Fingerprint | Canonical Field Mapping |
| :--- | :--- | :--- | :--- | :--- |
| `jd_orders` | `jd` | **Yes** | `订单号`, `京东价`, `商家应收`, `商家SKUID`, `应付金额` | `platform_order_id`: `订单号`; `order_time`: `下单时间`; `pay_time`: `付款确认时间`; `ship_time`: `订单出库时间`; `finish_time`: `订单完成时间`; `product_id`: `商品ID`; `sku_code`: `商家SKUID`; `product_name`: `商品名称`; `quantity`: `订购数量`; `unit_price`: `京东价`; `gross_amount`: `订单金额` (fallback `京东价*数量`); `paid_amount`: `商家应收` (**prorate_order_amount=true**, strip trailing Chinese annotations; `应付金额` kept in `raw_extra`); `shipping_fee`: `运费金额`; `raw_order_status`: `订单状态`; `seller_note`: `商家备注`; `buyer_note`: `订单备注` |
| `pdd_orders` | `pdd` | **Yes** | `商品总价(元)`, `用户实付金额(元)`, `商家实收金额(元)`, `商家编码-规格维度`, `订单成交时间` | `platform_order_id`: `订单号`; `order_time`: `订单成交时间` (**derive_order_time_from_pdd_order_id=true**); `pay_time`: `订单成交时间`; `ship_time`: `发货时间`; `finish_time`: `确认收货时间`; `product_id`: `商品id`; `sku_code`: `商家编码-规格维度` (fallback `商家编码-商品维度`); `product_name`: `商品`; `sku_spec`: `商品规格`; `quantity`: `商品数量(件)`; `gross_amount`: `商品总价(元)`; `paid_amount`: `商家实收金额(元)` (`用户实付金额(元)` kept in `raw_extra`); `shipping_fee`: `邮费(元)`; `discount_amount`: `店铺优惠折扣(元)` + `平台优惠折扣(元)` + `多多支付立减金额(元)`; `raw_order_status`: `订单状态`; `refund_status`: `售后状态` (**infer_full_refund_from_status=true**); `seller_note`: `商家备注` |
| `taobao_tmall_orders` | `taobao` (also cloneable for `tmall`) | **Yes** | `子订单编号`, `主订单编号`, `买家应付货款`, `买家实付金额`, `订单创建时间` | `platform_order_id`: `主订单编号`; `sub_order_id`: `子订单编号`; `order_time`: `订单创建时间`; `pay_time`: `订单付款时间`; `ship_time`: `发货时间`; `finish_time`: `确认收货时间`; `product_id`: `商品ID`; `sku_code`: `商家编码`; `product_name`: `商品标题`; `sku_spec`: `商品属性`; `unit_price`: `商品价格`; `quantity`: `购买数量`; `gross_amount`: `买家应付货款`; `paid_amount`: `买家实付金额` (**extract_bybt_supply_price=true**); `refund_amount`: `退款金额` (**infer_full_refund_from_status=true**); `refund_status`: `退款状态`; `raw_order_status`: `订单状态`; `seller_note`: `商家备注`; `buyer_note`: `主订单买家留言` |
| `tmall_orders` | `tmall` | **Yes** | Same schema as `taobao_tmall_orders` with `default_platform='tmall'` | Identical column mapping & rules to `taobao_tmall_orders` |
| `douyin_orders` | `douyin` | **Yes** | `选购商品`, `订单应付金额`, `订单提交时间`, `支付完成时间`, `达人ID` | `platform_order_id`: `主订单编号`; `sub_order_id`: `子订单编号`; `order_time`: `订单提交时间`; `pay_time`: `支付完成时间`; `ship_time`: `发货时间`; `finish_time`: `订单完成时间`; `product_id`: `商品ID`; `sku_code`: `商家编码`; `product_name`: `选购商品`; `sku_spec`: `商品规格`; `unit_price`: `商品单价`; `quantity`: `商品数量`; `paid_amount`: `订单应付金额`; `discount_amount`: `优惠总金额`; `shipping_fee`: `运费`; `raw_order_status`: `订单状态`; `refund_status`: `售后状态` (**infer_full_refund_from_status=true**); `province`: `省`; `city`: `市`; `seller_note`: `商家备注`; `buyer_note`: `买家留言` |
| `jushuitan_erp_a` | `jushuitan` | Auto-detect (`店铺名称` / `分销商店铺名称` non-empty) | `店铺名称`, `系统单号`, `外部订单号`, `货品编码`, `商品小计`, `赠品标识` | `shop_name`: `店铺名称` (fallback `分销商店铺名称`); `platform_order_id`: `外部订单号` (fallback `交易订单号`, `系统单号`); `order_time`: `下单时间`; `pay_time`: `支付时间`; `ship_time`: `发货时间`; `finish_time`: `签收时间`; `sku_code`: `商品编码` (fallback `货品编码`, `货号`); `product_name`: `商品名称`; `quantity`: `订货数量`; `unit_price`: `商品售价`; `gross_amount`: `商品总售价`; `paid_amount`: `实收金额` (fallback `商品小计`); `discount_amount`: `商品优惠`; `shipping_fee`: `快递费用`; `is_gift`: `赠品标识`; `raw_order_status`: `状态`; `refund_status`: `退款` (**infer_full_refund_from_status=true**); `province`: `省`; `city`: `市`; `seller_note`: `卖家备注` |
| `jushuitan_erp_b` | `jushuitan` | Auto-detect (`店铺名称` non-empty) | `内部订单号`, `线上订单号`, `标准商品名`, `线上子订单编号`, `买家实付金额`, `是否赠品` | `shop_name`: `店铺名称`; `platform_order_id`: `线上订单号` (fallback `原始线上订单号`, `内部订单号`); `sub_order_id`: `线上子订单编号` (fallback `子订单编号`); `order_time`: `下单时间`; `pay_time`: `付款日期`; `ship_time`: `发货日期`; `finish_time`: `确认收货时间`; `product_id`: `店铺款式编码` (fallback `款号`); `sku_code`: `原始商品编码` (fallback `商品编码`, `店铺商品编码`); `product_name`: `商品名称` (fallback `标准商品名`); `sku_spec`: `颜色及规格`; `quantity`: `数量`; `unit_price`: `商品单价`; `gross_amount`: `商品金额` (fallback `原价`); `paid_amount`: `卖家实收金额` (fallback `卖家实收`, `买家实付金额`, `买家实付`); `discount_amount`: `抵扣金额`; `shipping_fee`: `运费`; `refund_amount`: `订单退款金额`; `refund_status`: `退款状态`; `is_gift`: `是否赠品`; `raw_order_status`: `子订单状态` (fallback `状态`); `province`: `省份`; `city`: `城市` |

### Default Seed `status_mappings` (Calibrated from All 6 Platform Exports; Editable via UI)
- `completed`: `完成`, `已完成`, `交易成功`, `已签收`, `已收货`, `确认收货`, `TRADE_FINISHED`
- `shipped`: `等待确认收货`, `已发货`, `卖家已发货`, `卖家已发货，等待买家确认`, `已发货，待收货`, `待收货`, `发货中`, `已出库`, `已揽收`, `线上发货`
- `paid_unshipped`: `等待出库`, `等待发货`, `等待卖家发货`, `买家已付款`, `买家已付款,等待卖家发货`, `买家已付款，等待卖家发货`, `待发货`, `已付款`, `备货中`, `待成团`, `异常`
- `pending_pay`: `等待付款`, `待付款`, `未付款`, `等待买家付款`
- `closed_cancelled`: `(删除)等待出库`, `(删除)暂停`, `(删除)等待确认收货`, `(删除)延迟付款确认`, `(删除)货到付款退货`, `已取消`, `交易关闭`, `已关闭`, `关闭`, `取消`, `订单关闭`, `发货后取消`, `付款前交易关闭`, `付款后交易关闭`, `未发货，退款成功`, `已发货，退款成功`, `已收货，退款成功`
*(Unknown raw statuses default to `paid_unshipped` if `pay_time` present else `pending_pay`, and are surfaced in Import Wizard Step 3 with inline batch mapping & commit guard.)*

---

## 4. REST API Contract (`/api/v1`)

### Standard Error Envelope (All 4xx / 5xx Responses)
```json
{
  "error": {
    "code": "ROLLBACK_CONFLICT",
    "message": "无法回滚：批次 IMP-20261124-0003 已更新了本批次的部分订单行，请先回滚较新的批次。",
    "details": {}
  }
}
```

### 4.1 Import Wizard Endpoints

#### `POST /api/v1/imports/parse-preview`
Multipart upload (`file`, optional `sheet_name`). Detects encoding, sheets, headers, and auto-matches top template.
- **Response `200`**:
```json
{
  "staged_file_id": "stg_8f3a2c1e",
  "file_name": "jd_2026_11.csv",
  "file_encoding": "gb18030",
  "sheets": ["Sheet1"],
  "selected_sheet": "Sheet1",
  "total_rows": 12450,
  "headers": ["订单号", "商品ID", "商品名称", "..."],
  "sample_rows": [ { "订单号": "3691453007789022", "...": "..." } ],
  "matched_template": {
    "id": 1,
    "code": "jd_orders",
    "name": "京东订单明细（标准）",
    "data_source": "jd",
    "match_score": 0.96,
    "needs_default_shop": true
  },
  "pii_columns_detected": ["下单帐号", "邮箱地址"]
}
```

#### `POST /api/v1/imports/validate`
Runs full parsing, cleaning (incl. JD proration), PII stripping, shop-platform lookup, duplicate check, and validation without mutating `order_lines`.
- **Request**:
```json
{
  "staged_file_id": "stg_8f3a2c1e",
  "sheet_name": "Sheet1",
  "data_source": "jd",
  "template_id": 1,
  "column_mapping": { "platform_order_id": "订单号", "paid_amount": "商家应收" },
  "rules": { "prorate_order_amount": true },
  "default_shop_id": 2
}
```
- **Response `200`**:
```json
{
  "validation_id": "val_91ab02",
  "summary": {
    "total_rows": 12450,
    "valid_rows": 12438,
    "error_rows": 12,
    "warning_rows": 3,
    "estimated_inserts": 12000,
    "estimated_updates": 438,
    "prorated_orders": 215
  },
  "unknown_shops": ["某未绑定聚水潭店铺"],
  "unknown_statuses": ["特殊自定义状态"],
  "errors_preview": [
    {
      "row_number": 42,
      "field_name": "order_time",
      "raw_value": "",
      "error_code": "REQUIRED_MISSING",
      "error_message": "必填字段「下单时间」为空"
    }
  ],
  "warnings_preview": [
    {
      "row_number": 105,
      "field_name": "paid_amount",
      "message": "已按京东整单实付分摊规则分摊（4行共 5748.01 元）"
    }
  ],
  "cleaned_sample_rows": [ { "platform_order_id": "3691453007789022", "paid_amount": "3537.38", "is_amount_prorated": true } ]
}
```

#### `GET /api/v1/imports/validations/{validation_id}/errors/export`
Streams `.xlsx` of error rows (PII-stripped + appended `错误行号`, `错误字段`, `错误原因` columns).

#### `POST /api/v1/imports/commit`
Commits validated rows into `order_lines` and creates `import_batches`, `import_batch_errors`, and `import_batch_snapshots`.
- **Request**:
```json
{
  "validation_id": "val_91ab02",
  "duplicate_strategy": "upsert",
  "skip_error_rows": true
}
```
*(Rejects with `400 UNBOUND_SHOPS` if `unknown_shops` have not been bound via `/api/v1/shops/batch-bind` yet.)*
- **Response `201`**:
```json
{
  "batch_id": 15,
  "batch_no": "IMP-20261124-0015",
  "status": "committed",
  "total_rows": 12450,
  "valid_rows": 12438,
  "inserted_rows": 12000,
  "updated_rows": 438,
  "skipped_rows": 0,
  "error_rows": 12
}
```

### 4.2 Import Batch & Rollback Endpoints

- `GET /api/v1/batches?page=1&page_size=20&data_source=&status=` → Paginated list of `import_batches`.
- `GET /api/v1/batches/{batch_id}` → Single batch detail + rollback eligibility (`can_rollback: boolean`, `blocking_batches: string[]`).
- `GET /api/v1/batches/{batch_id}/errors/export` → Streams `.xlsx` of persisted `import_batch_errors`.
- `POST /api/v1/batches/{batch_id}/rollback` → Executes exact rollback; returns `200` with `{ "batch_id", "status": "rolled_back", "deleted_rows", "restored_rows" }` or `409 ROLLBACK_CONFLICT`.

### 4.3 Configuration Endpoints (Templates, Shops, Statuses)

- `GET /api/v1/templates` → List all built-in and custom `mapping_templates`.
- `POST /api/v1/templates` → Create custom template (`is_builtin=0`).
- `PUT /api/v1/templates/{id}` → Update custom template (returns `403 BUILTIN_READONLY` if attempting to delete builtin; cloning builtin into custom is supported).
- `DELETE /api/v1/templates/{id}` → Delete custom template.
- `GET /api/v1/shops` / `POST /api/v1/shops` / `PUT /api/v1/shops/{id}` → Manage `shops` (`shop_name` ↔ `platform`).
- `POST /api/v1/shops/batch-bind` → Body: `{ "items": [{ "shop_name": "海信抖音店", "platform": "douyin" }] }` — used directly inside the Import Wizard to bind newly discovered shops in one click.
- `GET /api/v1/status-mappings` / `POST /api/v1/status-mappings` / `PUT /api/v1/status-mappings/{id}` / `DELETE /api/v1/status-mappings/{id}` → Manage `status_mappings`.
- `POST /api/v1/status-mappings/batch-upsert` → Body: `{ "items": [{ "data_source": "pdd", "raw_status": "未发货，退款成功", "normalized_status": "closed_cancelled", "is_valid_for_gmv": true }] }` — used directly inside Import Wizard Step 3 to configure newly discovered `unknown_statuses` in one click before re-validating.

### 4.4 Standardized Order Lines Query & Export

#### `GET /api/v1/order-lines`
Query parameters:
- `time_basis`: `order_time` (default) | `pay_time` *(reject `ship_time` with `422`)*
- `date_from`, `date_to` (`YYYY-MM-DD` or ISO datetime)
- `platform` (comma-separated or repeated), `shop_id`, `data_source`, `normalized_status`, `batch_id`
- `keyword` (matches `platform_order_id`, `sku_code`, `product_id`, `product_name`)
- `page` (default `1`), `page_size` (default `50`, max `200`)
- **Response `200`**: `{ "items": [...], "total": 12438, "page": 1, "page_size": 50 }`

#### `POST /api/v1/order-lines/export`
Body accepts the same filter parameters plus `"format": "xlsx" | "csv"`. Streams binary file download with `Content-Disposition: attachment`. In `.xlsx`, ID columns (`platform_order_id`, `sub_order_id`, `product_id`, `sku_code`) MUST be written with text cell format `@`; in `.csv`, UTF-8 with BOM (`utf-8-sig`).

### 4.5 Summary Reports & Export

#### `GET /api/v1/reports/summary`
Query parameters: `time_basis` (`order_time` | `pay_time`), `date_from`, `date_to`, `granularity` (`day` | `week` | `month`), `group_by` (`platform` | `shop` | `none`), `platform`, `shop_id`, `normalized_status`.
- **Response `200`**:
```json
{
  "kpi": {
    "gmv": "1256800.50",
    "refund_amount": "45200.00",
    "net_sales": "1211600.50",
    "order_count": 412,
    "units_sold": 468
  },
  "rows": [
    {
      "period": "2026-11-23",
      "platform": "jd",
      "shop_id": 2,
      "shop_name": "海信空调京东旗舰店",
      "gmv": "5748.01",
      "refund_amount": "0.00",
      "net_sales": "5748.01",
      "order_count": 1,
      "units_sold": 4
    }
  ]
}
```
*(Monetary values serialized as decimal strings to avoid JS floating-point precision loss.)*

#### `GET /api/v1/reports/sku-ranking`
Query parameters: `time_basis`, `date_from`, `date_to`, `platform`, `shop_id`, `normalized_status`, `sort_by` (`net_sales` | `gmv` | `units_sold` | `order_count`), `page`, `page_size`.
- **Response `200`**: `{ "kpi": {...}, "items": [{ "sku_code", "product_id", "product_name", "platform", "gmv", "refund_amount", "net_sales", "order_count", "units_sold" }], "total": 128 }`

#### `POST /api/v1/reports/export`
Body:
```json
{
  "report_type": "summary",
  "include_detail_sheet": true,
  "filters": { "time_basis": "order_time", "date_from": "2026-11-01", "date_to": "2026-11-30", "granularity": "day", "group_by": "shop" }
}
```
Streams `.xlsx` containing the formatted Summary sheet (`汇总报表`), and when `include_detail_sheet=true`, a second sheet (`标准化明细`) containing the matching `order_lines`.
