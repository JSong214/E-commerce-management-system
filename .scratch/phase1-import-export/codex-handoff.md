# Codex Handoff — SJH-DATA Phase 1 Backend & MySQL Implementation

You are responsible for implementing the **Python (FastAPI) + MySQL 8.0** backend under `backend/` for **SJH-DATA Phase 1**.

## Required Reading (Read Before Writing Code)
1. `AGENTS.md` — directory ownership (`backend/` only; do not modify `frontend/`), data safety, and contract-first rules.
2. `GLOSSARY.md` — ubiquitous domain language and exact metric formulas (**GMV**, **Refund Amount**, **Net Sales**, **Order Count**, **Units Sold**, **Time Basis**, **Line Key**, **Order-Level Amount Proration**, **Batch Rollback**).
3. `docs/adr/0001-tech-stack-and-storage.md`, `0002-batch-rollback-and-pii-exclusion.md`, `0003-order-level-amount-proration.md`.
4. `docs/contracts/phase1-api-and-schema.md` — **single source of truth** for the 7 MySQL 8.0 tables, 7 built-in mapping templates, PII strip list, JD `商家应收` proration rule, and every REST API request/response payload.
5. `.scratch/phase1-import-export/spec.md` — full user stories and testing seams.

## Your Assigned Tickets (Work Strictly in Dependency Order)
Execute each ticket in `.scratch/phase1-import-export/issues/` using TDD (`.agents/skills/tdd/SKILL.md`), updating ticket status as you go:

1. `.scratch/phase1-import-export/issues/01-backend-scaffold-and-mysql-schema.md`
2. `.scratch/phase1-import-export/issues/03-backend-config-apis.md`
3. `.scratch/phase1-import-export/issues/04-backend-etl-parse-clean-validate.md`
4. `.scratch/phase1-import-export/issues/05-backend-batch-commit-and-exact-rollback.md`
5. `.scratch/phase1-import-export/issues/06-backend-order-query-reports-and-export.md`

## Critical Business Rules (Do Not Miss)
- **JD `paid_amount` maps to `商家应收`** (NOT `应付金额`), with `prorate_order_amount = true` weighted by `京东价 * 订购数量` and cent remainder added to the last positive-weight row (e.g., 4-row order with 2 zero-priced outdoor units and `5599` + `3499` indoor units totaling `5748.01` → `0.00`, `3537.38`, `0.00`, `2210.63`).
- **Numeric sanitization**: strip trailing Chinese annotations like `2449.00（系统计算中，该值仅供参考）` before converting to `Decimal`.
- **JD deleted statuses**: any raw status starting with `(删除)` (e.g. `(删除)暂停`, `(删除)等待出库`) maps to `closed_cancelled` with `is_valid_for_gmv = 0` even when `商家应收 > 0`.
- **Time Basis**: `/api/v1/order-lines` and `/api/v1/reports/*` MUST accept ONLY `order_time` and `pay_time` (reject `ship_time` with `422`).
- **PII stripping**: strip all buyer PII columns listed in the contract BEFORE staging/storage — never store them in canonical columns OR `raw_extra` JSON.
- **Exact rollback**: store `before_state` snapshots in `import_batch_snapshots` and reject out-of-order conflicting rollbacks with `409 ROLLBACK_CONFLICT`.
- **Acceptance**: Antigravity will run cross-stack acceptance verification (`09-phase1-acceptance-and-e2e-verification.md`) once your tickets are complete. Keep `pytest` passing and document exact setup/run commands in `backend/README.md`.
