# 06: Standardized Order Lines Query, Summary Reports & Excel/CSV Export

**Owner:** Codex (backend)
**Blocked by:** 05: Transactional Import Commit (Upsert/Skip) & Exact Batch Rollback
**Status:** ready-for-agent

**What to build:**
Implement `/api/v1/order-lines`, `/api/v1/order-lines/export`, `/api/v1/reports/summary`, `/api/v1/reports/sku-ranking`, and `/api/v1/reports/export` strictly following `GLOSSARY.md` formulas and `docs/contracts/phase1-api-and-schema.md`.

- [ ] `time_basis` accepts ONLY `order_time` (default) or `pay_time`; passing `ship_time` returns HTTP `422`.
- [ ] Summary metrics (`gmv`, `refund_amount`, `net_sales`, `order_count` via `COUNT(DISTINCT platform_order_id)`, `units_sold`) strictly exclude `is_valid_for_gmv = 0` rows (`pending_pay`, pre-payment cancellations, JD `(删除)...` rows) and serialize monetary totals as exact decimal strings.
- [ ] `/api/v1/order-lines/export` streams standardized `.xlsx` (formatting ID columns as Excel text `@` so 16-digit order IDs never turn into scientific notation) and `.csv` (`utf-8-sig` BOM for Chinese Excel).
- [ ] `/api/v1/reports/export` streams `.xlsx` containing the formatted `汇总报表` sheet, and when `include_detail_sheet=true`, appends a second `标准化明细` sheet matching the exact same filters.
- [ ] Pytest integration tests verify metric accuracy across multi-line orders, `order_time` vs `pay_time` filtering, `ship_time` rejection, and openpyxl verification of exported text-formatted IDs and dual-sheet workbooks.
