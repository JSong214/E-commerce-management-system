# 01: Backend Scaffold, MySQL 8.0 Migrations & Built-in Seeds

**Owner:** Codex (backend)
**Blocked by:** None (can start immediately)
**Status:** done

**What to build:**
Initialize the Python FastAPI backend under `backend/` with MySQL 8.0 connectivity (plus a local `docker-compose.yml` option for MySQL 8.0), Alembic migrations for all 7 tables defined in `docs/contracts/phase1-api-and-schema.md`, standard error-envelope middleware, `/api/v1/health`, and an idempotent seed command that populates the 7 built-in **Mapping Templates** (using the exact headers in the contract, with JD `paid_amount` mapped to `商家应收`) and default **Normalized Order Status** mappings.

- [x] FastAPI app boots cleanly with CORS enabled for local/intranet React dev server (`http://localhost:5173`) and returns structured error envelopes (`{ "error": { "code", "message", "details" } }`) on 4xx/5xx errors.
- [x] Alembic migrations create all 7 tables (`shops`, `mapping_templates`, `status_mappings`, `import_batches`, `import_batch_errors`, `order_lines`, `import_batch_snapshots`) matching `docs/contracts/phase1-api-and-schema.md` column types, `DECIMAL(14,2)`, `JSON`, unique keys, and indexes.
- [x] Idempotent seed script populates all 7 built-in `mapping_templates` (`jd_orders`, `pdd_orders`, `taobao_tmall_orders`, `tmall_orders`, `douyin_orders`, `jushuitan_erp_a`, `jushuitan_erp_b`) and default `status_mappings` without duplicating rows when run repeatedly.
- [x] Automated pytest suite verifies health check, migration up/down sanity, and seed idempotency.
