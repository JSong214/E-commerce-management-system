# V2 Slice 1 Spec: Master Data Center & Two-Layer Sales Ingestion (Modules 1 & 2)

## Problem Statement

Phase 1 delivered a generic single-file order-line importer and simple GMV/Net Sales reports, which diverged from real daily e-commerce operations audited in `.scratch/refactor-discovery/codex-logic-and-data-audit.md`:
- No first-class **Shop Master** (38 shops with operator type, legal entity, sales mode, `active/dormant/inactive` status, `焕新生活` platform, aliases, and per-shop ERP flags) or **Product Master** (13 category-brand groups, 173 standard models, 39 indoor/outdoor unit pairs, and 270 multi-channel ID mappings containing legitimate 1-to-many conflicts).
- Whole-row Upsert allowed upload order between direct platform exports and Jushuitan ERP (>24k overlapping orders + reshipments) to overwrite authoritative direct sales figures.
- JD multi-row indoor+outdoor orders prorated `商家应收(I)` and summed component quantities instead of retaining raw rows while merging Layer-2 effective sales into whole-unit records using `应付金额(K)`.
- Missing configurable business eligibility rules (`< 400` threshold, Taobao `百亿补贴` supply-price fallback & `< 1000` notice, 3C zero-received fallback, reshipment/price-diff exclusion) and a non-blocking **Pending Model Confirmation** loop with one-click rule learning.

## Solution

Refactor **SJH-DATA** focusing strictly on **Module 1 (Master Data Center)** + **Module 2 (Source-Role Order Ingestion & Effective Sales Workbench)** while preserving the existing FastAPI + MySQL 8.0 + Alembic + React/Ant Design 5 + Batch Rollback infrastructure:

1. **Master Data Center (`/master-data`)**:
   - One-click idempotent Excel import for `店铺基础信息.xlsx` and `产品基础信息.xlsx`.
   - Full CRUD + filtering for Shops & Shop Aliases (allowing `active` and `dormant` shops in imports) and Product Categories, Standard Models, Indoor/Outdoor Unit Components (`产品内外机` including D column `映射值`), and Multi-Channel ID Mappings — plus a dedicated **Conflict View** surfacing all 1-to-many ambiguous IDs.
2. **Source-Role Order Ingestion (`/import`)**:
   - Upload wizard adds explicit **Source Role** selection (`平台直出销售` / `聚水潭ERP补全` / `ERP/手工独立销售`, auto-recommended per template) and Tmall ERP-A template detection.
   - Validation preview shows Layer-2 projections (`有效销售` / `已排除` breakdown / `待核对` / `JD整机合并` / `ERP补全` / `待确认型号` preview).
   - Commit writes Layer 1 (`order_lines`) with exact pre-update snapshots and atomically rebuilds affected Layer 2 (`effective_sales_records`), guaranteeing upload-order independence between direct exports and ERP enrichment.
   - Exact **Batch Rollback** restores `order_lines` and recomputes/removes affected `effective_sales_records`.
3. **Pending Model Confirmation (`/model-review`)**:
   - Grouped queue of `ambiguous` (1-to-many) and `unmatched` sales records showing affected row counts, valid counts, sales amounts, and candidate models.
   - Analysts confirm the right standard model in bulk and optionally check **"一键沉淀为映射规则"** (shop-scoped or global) to persist a `product_channel_mappings` rule and retroactively resolve matching pending records.
4. **Effective Sales Workbench (`/effective-sales`)**:
   - Filterable Layer-2 sales table (`business_time` default, `order_time`, `pay_time`; platform, shop, brand, category, segment, eligibility `valid/excluded/needs_review/all`, model match status, source role, batch, keyword) with top KPI strip.
   - Row traceability drawer showing contributing Layer-1 `order_lines` (e.g. indoor + outdoor rows for JD), `amount_source`, ERP enrichment diff, and notices.
   - Clean Excel/CSV export with text-formatted order IDs and Chinese operational headers.
5. **Configurable Sales Rules (`/management` tab)**:
   - Toggle & edit database-backed `sales_rules` (`400元门槛`, `淘宝百亿补贴与1000元提示`, `京东整机合并`, `3C零实收取已付`, `补发与补差价排除`, `ERP补全优先级`, `天猫单号优先级`).

## Architecture & Contract

- Single source of truth: [`docs/contracts/v2-master-and-sales-ingestion.md`](../../docs/contracts/v2-master-and-sales-ingestion.md)
- Ubiquitous language: [`GLOSSARY.md`](../../GLOSSARY.md)
- Architectural decision: [`docs/adr/0004-master-data-and-two-layer-sales-model.md`](../../docs/adr/0004-master-and-two-layer-sales-model.md) (supersedes `0003`)

## Out of Scope for V2 Slice 1 (Deferred to Subsequent Slices)

- Module 3: Independent financial-date refund events (`平台-退货-*`), Jushuitan return matching, historical sales recalculation (`小额补偿/补贴`, `实际销量`, `实际销额`).
- Module 4: Standalone province matching files, purchase cost ledger (`采购汇总`), brand distribution order sheets (`华凌/科龙/美的分销销售汇总`) & `是否分销` determination.
- Module 5: 4-sheet business report Excel template generation (`店铺销售输出模板.xlsx`).
- Module 6: Multi-source daily business batch completeness orchestration (`provided/no_data/excluded/pending`).

## Testing & Acceptance Seams

1. **Master Data Excel Import & Ambiguity Seam**: Importing anonymized fixtures mirroring `店铺基础信息.xlsx` (38 shops incl. `焕新生活`, `启用/休眠/未启用`) and `产品基础信息.xlsx` (4 sheets, `tm_sku-id`, indoor/outdoor + `映射值`, intentional 1-to-many ID conflicts) succeeds idempotently and exposes exact ambiguity groups.
2. **Upload-Order Independence Seam**: Importing PDD Direct → Jushuitan ERP (`erp_enrich`) vs. Jushuitan ERP (`erp_enrich`) → PDD Direct on overlapping orders (including reshipment & blank province) produces bit-for-bit identical `effective_sales_records` with direct amounts preserved and blank provinces enriched.
3. **JD Whole-Unit Merge & Configurable Rules Seam**: Importing JD indoor + 0-priced outdoor order with `商家应收 != 应付金额` retains both Layer-1 rows and produces 1 Layer-2 whole-unit record using `应付金额(K)` and whole-unit quantity; toggling `min_sales_amount` / `taobao_subsidy_fallback` / `zero_received_use_paid` changes eligibility deterministically.
4. **Pending Model Confirmation & Rule Learning Seam**: Importing an ambiguous SKU commits without blocking, appears grouped in `/model-review/pending`, and resolving with `save_as_mapping_rule=true` creates a scoped mapping, resolves all matching pending records retroactively, and auto-matches future imports.
5. **Exact Rollback Consistency Seam**: Rolling back an `erp_enrich` or `direct_sales` batch restores `order_lines` and cleanly rebuilds/removes affected `effective_sales_records`.
