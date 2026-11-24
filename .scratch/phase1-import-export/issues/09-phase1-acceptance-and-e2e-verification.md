# 09: Phase 1 Cross-Stack Acceptance & E2E Verification

**Owner:** Antigravity (acceptance)
**Blocked by:** 06: Standardized Order Lines Query, Summary Reports & Excel/CSV Export; 07: Frontend Import Wizard & Batch/Configuration Management Screens; 08: Frontend Standardized Order Query & Summary Report Export Screens
**Status:** ready-for-agent

**What to build:**
Perform independent cross-stack acceptance testing and two-axis `code-review` (Standards + Spec) over the completed backend (`backend/`) and frontend (`frontend/`) against `GLOSSARY.md`, `.scratch/phase1-import-export/spec.md`, and `docs/contracts/phase1-api-and-schema.md`.

- [ ] Run backend `pytest` suite and verify all 7 source fixtures, JD `商家应收` proration (`5748.01` exact sum), `(删除)暂停` GMV exclusion, PII stripping, Upsert + exact rollback, and `ship_time` rejection pass cleanly.
- [ ] Run frontend `tsc --noEmit`, `vitest`, and `pnpm build` with zero errors.
- [ ] Verify live Frontend ↔ Backend ↔ MySQL end-to-end flow: upload JD + Jushuitan anonymized fixtures → bind unknown shop → inspect validation & commit → check KPI numbers → export standardized `.xlsx`/`.csv` and dual-sheet report `.xlsx` → execute Upsert + exact Batch Rollback and verify DB restoration.
- [ ] Deliver concise acceptance sign-off report listing any defects found or confirming Phase 1 ready for real analyst data.
