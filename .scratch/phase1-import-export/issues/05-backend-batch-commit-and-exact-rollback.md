# 05: Transactional Import Commit (Upsert/Skip) & Exact Batch Rollback

**Owner:** Codex (backend)
**Blocked by:** 04: Multi-Platform ETL Parser, Cleaner, JD Prorator & Pre-Commit Validator
**Status:** ready-for-agent

**What to build:**
Implement `/api/v1/imports/commit`, `/api/v1/batches`, `/api/v1/batches/{batch_id}`, `/api/v1/batches/{batch_id}/errors/export`, and `/api/v1/batches/{batch_id}/rollback` with atomic chunked ingestion, pre-update snapshot recording, and exact reverse-order **Batch Rollback**.

- [ ] `POST /api/v1/imports/commit` rejects commits with `400 UNBOUND_SHOPS` if any shop in the staged validation is still unbound; otherwise executes chunked `upsert` or `skip` into `order_lines`, records `import_batches`, persists `import_batch_errors`, writes `insert`/`update` snapshots to `import_batch_snapshots`, and cleans up temporary uploaded raw files.
- [ ] `GET /api/v1/batches` and `GET /api/v1/batches/{batch_id}` return paginated history, row counts, and `can_rollback` + `blocking_batches`.
- [ ] `POST /api/v1/batches/{batch_id}/rollback` deletes lines newly inserted by the batch and restores Upsert-updated lines bit-for-bit from `before_state` JSON in a single transaction, marking the batch `rolled_back`.
- [ ] Attempting to roll back a batch whose touched `order_lines` were subsequently modified by a newer committed batch fails with `409 ROLLBACK_CONFLICT` listing the blocking `batch_no` values.
- [ ] Pytest integration tests against MySQL verify Batch #1 → Batch #2 Upsert → blocked Batch #1 rollback → successful Batch #2 exact rollback → restored Batch #1 state.
