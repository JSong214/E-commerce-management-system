---
status: accepted
supersedes: 0003-order-level-amount-proration.md
---

# Master Data Authority, Source-Role Precedence & Two-Layer Sales Model (V2 Slice 1)

## Context

After real-world testing of Phase 1 and a full audit of `E:\01work\DATA-INFO` and the legacy automation suite (`Summary-of-Work-Data`), four structural mismatches surfaced:

1. **Missing Master Data**: Real operations depend on `店铺基础信息.xlsx` (38 shops with operator type, legal entity, sales mode, active/dormant/inactive status, and `焕新生活` platform) and `产品基础信息.xlsx` (13 category-brand pairs, 173 standard models, 39 indoor/outdoor unit pairs, and 270 multi-channel ID mappings containing legitimate 1-to-many conflicts).
2. **Direct vs. ERP Overwrite Hazard**: Pinduoduo and Taobao direct exports share >24,000 overlapping orders with Jushuitan ERP exports (plus reshipment orders). Phase 1's whole-row Upsert allowed upload order to determine which source's amount/status survived.
3. **JD Whole-Unit vs. Proration Divergence**: Phase 1 prorated JD `商家应收(I)` across indoor and `0.00`-priced outdoor lines and summed component quantities. Actual business reconciliation merges JD indoor+outdoor rows into a single whole-unit sales record using `应付金额(K)` (which differs from `商家应收(I)` on 298 sample rows).
4. **Raw Auditability vs. Business Eligibility**: Analysts need to retain all uploaded rows (including `< 400` low-value rows, reshipments, closed/cancelled orders, and unmatched/ambiguous SKUs) for traceability, while deriving a clean, rule-governed effective sales layer with configurable toggles and non-blocking manual model confirmation.

## Decision

We adopt a **Master-Data-Driven, Two-Layer Sales Architecture** while preserving the existing FastAPI + MySQL 8.0 + React + Batch Rollback infrastructure:

1. **First-Class Shop & Product Master Data**:
   - Extend `shops` with `operator_type`, `entity_name`, `sales_mode`, `shop_status` (`active|dormant|inactive`), and per-shop behavior flags (`erp_sales_enabled`, `zero_received_use_paid`, `preserve_full_product_name`), plus `shop_aliases` for historical/export store names. Both `active` and `dormant` shops accept imports.
   - Model `product_categories`, `product_models`, `product_unit_components` (indoor/outdoor + `mapping_value`), and `product_channel_mappings` (allowing 1-to-many conflicts to be stored and flagged rather than silently dropped, with optional secondary ID and shop-scope disambiguation).
   - Provide idempotent Excel import endpoints directly for `店铺基础信息.xlsx` and `产品基础信息.xlsx`.

2. **Explicit Source Roles (`direct_sales` / `erp_enrich` / `erp_independent_sales`)**:
   - `direct_sales` always takes authoritative ownership of sales amount, quantity, pay time, and raw order status.
   - `erp_enrich` fills ONLY blank enrichment fields (`province`, `city`, model hints, separate `erp_raw_status`) and never overwrites `direct_sales` facts — guaranteeing **upload-order independence**.
   - Only shops with `erp_sales_enabled = true` promote ERP-only orders into effective sales (`erp_independent_sales`); reshipment (`补发`) and price-diff (`补收差价`) rows are retained in Layer 1 but excluded from Layer 2 valid sales.

3. **Two-Layer Persistence (`order_lines` → `effective_sales_records`)**:
   - **Layer 1 (`order_lines`)** retains all PII-stripped source rows (including JD indoor/outdoor component rows, `payable_amount`, `erp_paid_amount`, `amount_source`, and `raw_extra`) and remains the rollback unit for `import_batch_snapshots`.
   - **Layer 2 (`effective_sales_records`)** is deterministically rebuilt per affected `(platform, shop_id, business_order_id)` whenever a batch commits, rolls back, enriches, or resolves a pending model.
   - For JD orders, Layer 2 applies **Whole-Unit Merging** (selecting the primary non-outdoor row's `应付金额` and unit quantity, linking all contributing `source_order_line_ids`). This supersedes ADR-0003's proration rule for effective sales.
   - Eligibility rules (`min_sales_amount = 400`, Taobao `百亿补贴` supply-price fallback & `< 1000` notice, JD whole-unit merge, 3C zero-received fallback, reshipment/price-diff exclusion) are stored in `sales_rules` with default-on legacy settings and UI toggles.

4. **Non-Blocking Pending Model Confirmation with Rule Learning**:
   - Unique channel/component/model hits auto-resolve (`matched`).
   - Ambiguous (1-to-many) or unmatched items commit cleanly as `ambiguous` / `unmatched` with candidate metadata, surfacing in a grouped review queue where analysts can confirm the standard model and optionally persist a new/disambiguated `product_channel_mappings` rule that retroactively resolves matching pending records.

## Consequences

- **Positive**: Uploading direct exports and ERP files in either order produces identical effective sales; JD quantities and amounts match operational reality while keeping raw component rows auditable; ambiguous SKU IDs never block urgent daily imports; Module 3 (refunds), Module 4 (province/purchase/distribution), and Module 5 (4-sheet reports) can attach cleanly onto `effective_sales_records`.
- **Trade-off**: Batch commits and rollbacks must trigger deterministic recomputation of affected `effective_sales_records` within the same database transaction (or immediately coupled transaction), adding modest compute overhead mitigated by scoping recomputation strictly to the touched `(platform, shop_id, business_order_id)` set.
