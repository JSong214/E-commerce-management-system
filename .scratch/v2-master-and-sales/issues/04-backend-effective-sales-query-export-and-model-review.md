# Ticket 04: Backend Effective Sales Query/Export & Pending Model Confirmation Queue

- **Owner**: Codex (backend)
- **Status**: done
- **Depends on**: `03-backend-v2-ingestion-matching-and-effective-sales.md`

## Scope
Implement Sections 4.5 and 4.6 of `docs/contracts/v2-master-and-sales-ingestion.md`:
1. **Effective Sales Workbench APIs**:
   - `GET /api/v1/effective-sales` supporting `time_basis` (`business_time` default, `order_time`, `pay_time`; reject `ship_time` with `422`), full filter suite, pagination, and aggregated `kpi` strip.
   - `GET /api/v1/effective-sales/{record_id}` returning full record + contributing Layer-1 `source_order_lines`.
   - `GET /api/v1/effective-sales/export` streaming `.xlsx` (text-formatted order IDs) and `.csv` (UTF-8-BOM) with operational Chinese column headers.
2. **Pending Model Confirmation & Rule Learning APIs**:
   - `GET /api/v1/model-review/pending` returning grouped pending items (`ambiguous` + `unmatched`) with affected counts, valid counts, sales amounts, and candidate models.
   - `POST /api/v1/model-review/resolve` supporting `record_ids` or `group_filter`, updating targeted `order_lines` + `effective_sales_records` to `manual_confirmed`, and when `save_as_mapping_rule=true`, saving a `shop`-scoped or `global` `product_channel_mappings` row (`learned_from_review`) and retroactively resolving all other matching pending records.

## Acceptance Criteria
- `pytest` covers KPI accuracy across `valid`/`excluded`/`needs_review`, JD traceability drawer returning both indoor & outdoor Layer-1 lines, Excel export text formatting, grouped pending review, and one-click rule learning with retroactive resolution + auto-matching on subsequent import.
