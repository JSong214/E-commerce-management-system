# 03: Backend Configuration APIs (Templates, Shops, Status Mappings)

**Owner:** Codex (backend)
**Blocked by:** 01: Backend Scaffold, MySQL 8.0 Migrations & Built-in Seeds
**Status:** ready-for-agent

**What to build:**
Implement CRUD endpoints for **Mapping Templates** (`/api/v1/templates`), **Shops** (`/api/v1/shops` + `/api/v1/shops/batch-bind`), and **Normalized Order Status** mappings (`/api/v1/status-mappings`) per `docs/contracts/phase1-api-and-schema.md`.

- [ ] `GET/POST/PUT/DELETE /api/v1/templates` supports creating, editing, and deleting custom templates while protecting built-in templates from deletion (`403 BUILTIN_READONLY`).
- [ ] `GET/POST/PUT /api/v1/shops` enforces unique `shop_name` and valid `platform` enum values; `POST /api/v1/shops/batch-bind` atomically binds multiple newly discovered shop names to platforms in one call.
- [ ] `GET/POST/PUT/DELETE /api/v1/status-mappings` validates `normalized_status` enum values and `is_valid_for_gmv` flags.
- [ ] Pytest integration tests verify happy paths, validation errors, duplicate-name conflicts, and built-in template protection.
