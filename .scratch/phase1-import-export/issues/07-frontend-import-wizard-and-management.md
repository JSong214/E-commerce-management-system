# 07: Frontend Import Wizard & Batch/Configuration Management Screens

**Owner:** Antigravity (frontend)
**Blocked by:** 02: Frontend Scaffold, Contract Types & Interactive UI Prototype (live integration blocked by 03, 04, 05)
**Status:** ready-for-agent

**What to build:**
Implement production `/import` (4-step guided upload, visual column remap + save custom template, validation summary + inline unknown-shop platform binding + error-row Excel download, commit with Upsert/Skip) and `/management` (Import Batches history + exact rollback confirmation/conflict guidance, Mapping Templates CRUD/clone, Shops & Status Dictionary management) following the user-approved visual design from Ticket 02.

- [ ] `/import` supports drag-and-drop Excel/CSV upload, sheet selection, auto-matched template display, interactive column-mapping table with "Save as custom template", JD proration toggle visibility, default shop selector when required, and PII-stripped notice.
- [ ] Validation step clearly surfaces total/valid/error/warning/insert/update/prorated counts, renders error rows with exact row number/field/reason, provides one-click error Excel download, and gates commit until all newly discovered **Shops** are bound to a **Platform** via `/api/v1/shops/batch-bind`.
- [ ] `/management` allows inspecting batches, downloading persisted error Excels, triggering exact rollback with clear `409 ROLLBACK_CONFLICT` guidance showing which newer batch blocks rollback, and editing custom templates, shops, and status mappings.
- [ ] Vitest + React Testing Library tests cover the 4-step wizard transitions, unknown-shop commit guard, and rollback conflict messaging.
