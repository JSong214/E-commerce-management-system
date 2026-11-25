# 04: Multi-Platform ETL Parser, Cleaner, JD Prorator & Pre-Commit Validator

**Owner:** Codex (backend)
**Blocked by:** 01: Backend Scaffold, MySQL 8.0 Migrations & Built-in Seeds; 03: Backend Configuration APIs (Templates, Shops, Status Mappings)
**Status:** done

**What to build:**
Implement `/api/v1/imports/parse-preview`, `/api/v1/imports/validate`, and `/api/v1/imports/validations/{validation_id}/errors/export` so an analyst can upload Excel/CSV files from any of the 6 sources (7 built-in presets), preview detected headers/template match, inspect cleaned & validated row summaries, see unknown shops/statuses, and download error-row Excel files before committing to MySQL.

- [x] Detects CSV encodings (`utf-8`, `utf-8-sig`, `gb18030`/`gbk`) and Excel sheets (`.xlsx`/`.xls`), preserves long numeric IDs as exact strings (stripping `="..."` Excel text wrappers), and matches the highest-scoring **Mapping Template** by header fingerprint (distinguishing `jushuitan_erp_a` vs `jushuitan_erp_b`).
- [x] Sanitizes dirty numeric values such as JD's `2449.00（系统计算中，该值仅供参考）`, currency symbols, and thousand separators before decimal conversion.
- [x] Applies JD **Order-Level Amount Proration** on `商家应收` weighted by `京东价 * 订购数量` (0-priced accessory/outdoor-unit lines receive `0.00`; cent remainders go to the last positive-weight line so line sums equal the order total exactly) and generates deterministic **Line Keys** so multi-row same-SKU orders never overwrite each other.
- [x] Strips all buyer PII columns listed in `docs/contracts/phase1-api-and-schema.md` before staging (neither in canonical columns nor in `raw_extra` JSON), while keeping `province`/`city` and all non-PII unmapped columns in `raw_extra`.
- [x] Marks JD `(删除)...` statuses, `pending_pay`, and pre-payment cancellations with `is_valid_for_gmv = 0`.
- [x] Reports unknown **Shops** (for multi-shop Jushuitan exports), unknown raw statuses, duplicate estimates, and streams a PII-stripped `.xlsx` of error rows with appended row number, field name, and error reason.
- [x] TDD pytest suite covers anonymized fixtures for all 7 header schemas including the JD 4-row indoor+outdoor AC case (`5748.01` → `3537.38` + `2210.63` + `0.00` + `0.00`), `(删除)暂停`, blank `商家SKUID`, GBK CSV, and PII leakage assertions.
