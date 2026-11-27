# Ticket 07: Cross-Stack V2 Slice 1 Acceptance & Real-Data Verification

- **Owner**: Shared (Antigravity verification + Codex bugfixes if any)
- **Status**: ready-for-agent
- **Depends on**: `04-backend-effective-sales-query-export-and-model-review.md`, `06-frontend-v2-import-effective-sales-and-review.md`

## Scope
1. Run full backend `pytest` + frontend `vitest` + `npm run build`.
2. Start MySQL + FastAPI backend + Vite frontend locally and run end-to-end verification (never committing real data to git):
   - Import real `店铺基础信息.xlsx` (38 shops) and `产品基础信息.xlsx` (13 categories, 173 models, 78 indoor/outdoor components, 270 rows of ID mappings) via `/master-data` UI and verify conflict list accuracy.
   - Verify PDD direct + Jushuitan ERP (`erp_enrich`) upload-order independence on overlapping orders.
   - Verify JD indoor+outdoor whole-unit merging (`应付金额(K)` vs `商家应收(I)`) and traceability drawer.
   - Verify Taobao `百亿补贴` fallback + `< 1000` notice + `< 400` exclusion and rule toggle effect.
   - Verify Pending Model Confirmation + one-click rule learning + exact Batch Rollback syncing Layer 2.
3. Record results in `.scratch/v2-master-and-sales/acceptance-report.md`.
