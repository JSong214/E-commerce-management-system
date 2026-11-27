# SJH-DATA

E-commerce sales data management and analytics platform for unifying, validating, storing, reconciling, and reporting multi-platform sales operations.

## Language

### Master Data

**Business Segment (业务板块)**:
Top-level product line grouping defined in `产品基础信息.xlsx` (e.g., `家电`, `3C`). Each `(Category, Brand)` pair belongs to one **Business Segment**.
_Avoid_: Division, vertical

**Standard Model (标准型号)**:
The canonical product identifier used across sales, purchasing, and reporting (e.g., `KFR-35GW/N8HE1Ⅱ` for appliances, or full product name retaining capacity & color for 3C phones/laptops). Defined in `product_models`.
_Avoid_: Raw SKU, item code, title

**Unit Component (产品内外机)**:
An individual indoor (`indoor` / 内机) or outdoor (`outdoor` / 外机) component belonging to a split-unit appliance **Standard Model**, optionally carrying an alternate `mapping_value` (映射值). Used to map component-level rows back to their whole-unit **Standard Model**.
_Avoid_: Accessory part, sub-product

**Channel Product Mapping (产品渠道ID映射)**:
A mapping linking a source-specific product/SKU identifier (`jst_i_id`, `jst_sku_id`, `pdd_sku_id`, `tb_sku_id`, `tm_sku_id`, `dy_sku_id`, `jd_sku_id`, `merchant_code`) — optionally narrowed by secondary ID or **Shop** scope — to a **Standard Model**. When an unscoped `(channel_type, external_id)` points to more than one **Standard Model**, it is flagged as **Ambiguous** and routed to **Pending Model Confirmation**.
_Avoid_: SKU lookup table, ID map

**Shop**:
A specific merchant store operating on one **Platform** (e.g., `华凌华晟联采专卖店`, `智电汇通3C店`). Carries master attributes from `店铺基础信息.xlsx`: **Operator Type** (`self_operated` 自运营 / `agency_operated` 代运营), **Entity** (主体), **Sales Mode** (`dealer` 经销 / `distribution` 分销 / `hybrid` 混合 / empty), **Shop Status** (`active` 启用 / `dormant` 休眠 / `inactive` 未启用), and per-shop ingestion flags (`erp_sales_enabled`, `zero_received_use_paid`, `preserve_full_product_name`). Dormant shops remain eligible for historical order imports.
_Avoid_: Account, store_account

**Shop Alias (店铺别名)**:
A historical or export-specific store name mapped to a canonical **Shop** (e.g., `展翅豪鹏3C店` → `智电汇通3C店`, `海信温泽电器专卖店6463` → `海信温泽电器专卖店`, Tmall `分销商店铺名称` → `天猫优品`).
_Avoid_: Legacy store, alternate name

### Data Ingestion & Source Priority

**Data Source**:
The system or portal from which a raw Excel/CSV export file was downloaded (`taobao`, `tmall`, `douyin`, `jd`, `pdd`, `jushuitan`, `manual`, `custom`). Distinct from **Platform**, because an ERP source (`jushuitan`) can export orders originating from multiple sales platforms.
_Avoid_: Channel, origin, platform (when referring to the export file's system)

**Platform**:
The e-commerce marketplace where the customer placed the order (`taobao`, `tmall`, `douyin`, `jd`, `pdd`, `huanxin`, `other`). Includes `huanxin` (焕新生活).
_Avoid_: Data source, portal

**Source Role (来源角色)**:
The operational authority assigned to an **Import Batch**:
- `direct_sales` (平台直出销售): Primary authoritative source for sales facts.
- `erp_enrich` (聚水潭ERP补全): Enrichment-only source that fills blank non-conflicting fields (such as province, city, model hint, ERP status reference) without ever overwriting direct-export amounts, quantities, times, or statuses — regardless of upload order.
- `erp_independent_sales` (ERP/手工独立销售): Authoritative sales source ONLY for shops configured with `erp_sales_enabled = true` (shops without direct platform exports or manual 3C/ERP flows).
_Avoid_: Import mode, upload type

**Mapping Template**:
A reusable column-mapping configuration that translates raw column headers of a **Data Source** export into canonical **Order Line** fields. Includes built-in presets per source and user-saved custom templates.
_Avoid_: Schema config, import profile

**Import Batch**:
A single file upload and ingestion execution tracked with its **Data Source**, **Source Role**, template, validation summary, row counts, and rollback state.
_Avoid_: Upload job, import task, file record

**Batch Rollback**:
Reverting an **Import Batch** by deleting rows it newly inserted and restoring rows it updated back to their pre-batch state, then recomputing affected **Effective Sales Records**. Allowed in reverse chronological order for conflicting batches to prevent cross-batch corruption.
_Avoid_: Batch delete, undo upload

### Two-Layer Sales Data Model

**Order Line (原始标准化订单行 — Layer 1)**:
The preserved, PII-stripped line-item record parsed from an uploaded file (stored in `order_lines`). Retains original component rows (such as JD indoor and `0.00`-priced outdoor rows), reshipments, excluded low-value rows, `payable_amount`, `erp_paid_amount`, `amount_source`, and non-PII `raw_extra` for full auditability and exact rollback.
_Avoid_: Sub-order row, sale item, raw record

**Line Key**:
The deterministic identifier distinguishing each **Order Line** within the same `(Platform, platform_order_id)`. Uses `sub_order_id` when exported by the source (ignoring synthetic ERP sub-order IDs); otherwise falls back to a stable composite of product/SKU identifier and intra-order sequence index.
_Avoid_: Row ID, composite key, dedup key

**Effective Sales Record (有效销售明细 — Layer 2)**:
The business-ready sales fact record derived deterministically from **Order Lines**, **Shop/Product Master Data**, and **Sales Rules** (stored in `effective_sales_records`). Applies JD **Whole-Unit Merging**, **Source Role** precedence, configurable eligibility thresholds, and **Standard Model** resolution. Carries `eligibility_status` (`valid`, `excluded`, `needs_review`), `exclusion_reason`, `amount_source`, and `source_order_line_ids` for full lineage back to Layer 1.
_Avoid_: Cleaned order, report row

**Whole-Unit Merging (整机合并 — JD)**:
The V2 Layer-2 aggregation rule for multi-row JD appliance orders containing an indoor unit and a `0.00`-priced outdoor unit: Layer 1 retains every raw component line, while Layer 2 merges the order into a whole-unit **Effective Sales Record** using the primary non-outdoor row's `应付金额` (`payable_amount`) and unit quantity (superseding Phase 1's `商家应收` line-level proration per ADR-0004).
_Avoid_: Amount splitting, revenue allocation

**Pending Model Confirmation (待确认型号)**:
The non-blocking review state (`ambiguous` or `unmatched`) applied to **Order Lines** and **Effective Sales Records** whose channel IDs either match multiple **Standard Models** or match none. Analysts resolve items in bulk and can optionally save a new or disambiguated **Channel Product Mapping** rule with one click.
_Avoid_: Model error, failed SKU

**Sales Rule (可配置销售规则)**:
A database-backed, toggleable business rule governing Layer 2 **Effective Sales Record** derivation (e.g., `min_sales_amount = 400`, Taobao `百亿补贴` supply-price fallback & `< 1000` notice, JD whole-unit merge, reshipment/price-diff exclusion, 3C zero-received fallback).
_Avoid_: Hardcoded filter, cleaning hack

**Normalized Order Status**:
The unified 5-value order lifecycle state mapped from platform-specific status labels: `pending_pay`, `paid_unshipped`, `shipped`, `completed`, and `closed_cancelled`. The original platform status string is retained for reference.
_Avoid_: Order state, status code

### Sales Metrics & Reporting (Legacy Phase 1 vs V2 Notes)

**Time Basis**:
The timestamp field used to filter and group sales queries: `business_time` (V2 default for **Effective Sales Records**: `pay_time` for platform direct sales, `order_time` fallback for manual/ERP-independent sales), `order_time`, or `pay_time`. `ship_time` is excluded from report date filters.
_Avoid_: Date dimension, report date

**Sales Amount (销售额 — V2 Module 2)**:
Sum of `sales_amount` across `eligibility_status = 'valid'` **Effective Sales Records** prior to Module 3 refund reconciliation. (Distinct from Phase 1's raw `order_lines`-level `GMV`.)
_Avoid_: Gross sales, order total

**Sales Quantity (销量 — V2 Module 2)**:
Sum of `sales_quantity` across `eligibility_status = 'valid'` **Effective Sales Records** (counting whole units for merged JD orders, never double-counting outdoor units).
_Avoid_: Row count, component count

> **Phase 1 Legacy Metrics (`GMV`, `Refund Amount`, `Net Sales`, `Order Count`, `Units Sold`)**: Retained strictly for existing `/api/v1/reports/*` endpoints until Module 3 (Independent Refund Events & Historical Sales Recalculation) and Module 5 (Business Reports Delivery) replace them with `实际销量`, `实际销额`, `小额补偿/补贴`, and `经销采购差额`.
