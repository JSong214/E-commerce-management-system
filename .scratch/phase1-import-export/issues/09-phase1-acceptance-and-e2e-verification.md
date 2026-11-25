# 09: Phase 1 Cross-Stack Acceptance & E2E Verification

**Owner:** Antigravity (acceptance)
**Blocked by:** 06: Standardized Order Lines Query, Summary Reports & Excel/CSV Export; 07: Frontend Import Wizard & Batch/Configuration Management Screens; 08: Frontend Standardized Order Query & Summary Report Export Screens
**Status:** in-progress

**What to build:**
Perform independent cross-stack acceptance testing and two-axis `code-review` (Standards + Spec) over the completed backend (`backend/`) and frontend (`frontend/`) against `GLOSSARY.md`, `.scratch/phase1-import-export/spec.md`, and `docs/contracts/phase1-api-and-schema.md`.

- [x] Verify backend contract alignment & core ETL/proration/PII/filter assertions across all 7 source fixtures, JD `商家应收` proration (`5748.01` exact sum), `(删除)暂停` GMV exclusion, PII stripping, and `ship_time` rejection. *(Live MySQL 27 integration tests pending local MySQL/Docker startup with user credentials.)*
- [x] Run frontend `tsc -b --noEmit`, `vitest`, and `vite build` with zero errors.
- [ ] Verify live Frontend ↔ Backend ↔ MySQL end-to-end flow once user starts local MySQL 8.0 / Docker Desktop.
- [x] Deliver concise acceptance sign-off report (`.scratch/phase1-import-export/acceptance-report.md`).
