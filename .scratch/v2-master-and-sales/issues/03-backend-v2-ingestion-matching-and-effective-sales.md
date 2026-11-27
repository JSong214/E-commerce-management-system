# Ticket 03: Backend V2 Ingestion Pipeline, Product Matcher, Source Precedence & Effective Sales Builder

- **Owner**: Codex (backend)
- **Status**: done
- **Depends on**: `02-backend-master-data-apis-and-excel-import.md`

## Scope
Implement Sections 3.2–3.5 and 4.4 of `docs/contracts/v2-master-and-sales-ingestion.md`:
1. **Enhanced Parse & Validate**:
   - `parse-preview` returns `recommended_source_role` and matches `tmall_erp_a` accurately.
   - `validate` accepts `source_role`, resolves shops via `shops` (`active` + `dormant`) + `shop_aliases`, flags `inactive_shops`, runs `ProductMatcher` (Section 3.3), and projects `v2_summary` + `ambiguous_model_preview`.
2. **Source-Role Precedence & Order Independence** (Section 3.4):
   - Direct sales own amounts/quantities/times/status; `erp_enrich` only fills blank enrich fields (`province`, `city`, `raw_model_hint`, separate `erp_raw_status`) with line-level + order-level fallback.
   - Uploading `erp_enrich` before `direct_sales` or `direct_sales` before `erp_enrich` produces identical Layer-2 `effective_sales_records`.
   - `erp_independent_sales` only produces valid Layer-2 sales for shops with `erp_sales_enabled = 1`.
3. **EffectiveSalesBuilder & Rollback Coupling** (Section 3.5):
   - Deterministically derives `effective_sales_records` for all touched `(platform, shop_id, business_order_id)` inside the commit transaction:
     - JD whole-unit merge using primary non-outdoor row's `payable_amount` (`应付金额`) and whole-unit quantity, linking all `source_order_line_ids`.
     - Taobao `N` > 0 (`< 1000` notice) else `AI` 百亿补贴 supply-price * quantity else `needs_review`.
     - Tmall LP-prefix order ID priority, PDD `商家实收`, Douyin `订单应付`, 3C `zero_received_use_paid` + brand alias (`苹果手机` → `苹果`), reshipment/price-diff exclusion, and configurable `min_sales_amount` (`400.00`).
   - `POST /api/v1/batches/{batch_id}/rollback` restores `order_lines` via `import_batch_snapshots` AND atomically recomputes/removes affected `effective_sales_records`.

## Acceptance Criteria
- `pytest` verifies upload-order independence (Direct→ERP vs ERP→Direct), JD whole-unit merge (`payable_amount` vs `商家应收`), Taobao subsidy + `<1000` notice + `<400` exclusion, 3C `0 实收取已付`, reshipment exclusion, non-blocking ambiguous SKU commit, and exact rollback syncing Layer 2.
