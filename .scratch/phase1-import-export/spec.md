# Phase 1 Spec: Multi-Platform Sales Data Import, Validation & Report Export

## Problem Statement

As an e-commerce data analyst managing sales across Taobao, Tmall, Douyin, JD, Pinduoduo, and Jushuitan ERP (for shops without direct platform logins), raw Excel/CSV exports have incompatible column headers, mixed file encodings (GBK/UTF-8), dirty numeric/status strings (e.g., JD's `2449.00（系统计算中，该值仅供参考）` and `(删除)暂停`), order-level amount duplication across multi-item JD orders, and inconsistent date/shop metadata. Manually cleaning, deduplicating, reconciling, and summarizing these files in spreadsheets every week is slow, error-prone, and lacks auditability or undo capability.

## Solution

Build **SJH-DATA Phase 1**: a local/intranet web platform (React + Python FastAPI + MySQL 8.0) with four focused workflows:
1. **Guided Data Import & Validation**: Upload Excel/CSV files from any of the 6 sources, auto-detect encoding and match one of 7 built-in **Mapping Templates** (with visual column-mapping override and save-as-custom-template), resolve unknown **Shops** to their **Platform**, strip buyer PII, run cleaning rules (including JD **Order-Level Amount Proration**), preview validation errors (with error-row Excel download), and commit using Upsert or Skip deduplication.
2. **Batch History & Configuration Management**: Track every **Import Batch**, allow exact **Batch Rollback** (deleting inserted lines and restoring Upsert-updated lines to pre-batch snapshots), and manage **Mapping Templates**, **Shop**-to-**Platform** mappings, and **Normalized Order Status** dictionaries.
3. **Standardized Order Line Query & Export**: Filter unified **Order Lines** by **Time Basis** (`order_time` or `pay_time`), **Platform**, **Shop**, SKU/product, **Normalized Order Status**, or **Import Batch**, inspect paginated results, and export clean Excel/CSV files.
4. **Summary Reporting & Export**: View and export pre-built aggregations — (a) **Daily/Weekly/Monthly × Platform/Shop Summary** and (b) **Product/SKU Ranking Summary** — calculated strictly from `GLOSSARY.md` formulas (**GMV**, **Refund Amount**, **Net Sales**, **Order Count**, **Units Sold**).

## User Stories

### Data Import & Mapping
1. As a data analyst, I want to upload `.xlsx`, `.xls`, or `.csv` files (up to 100,000 rows) from Taobao, Tmall, Douyin, JD, Pinduoduo, or Jushuitan, so that I do not have to manually convert encodings or formats before ingestion.
2. As a data analyst, I want the system to automatically detect CSV character encoding (UTF-8, UTF-8-BOM, GB18030/GBK) and list Excel sheets when a workbook has multiple sheets, so that Chinese headers never appear garbled.
3. As a data analyst, I want the system to automatically fingerprint the uploaded file's header row and recommend the best matching **Mapping Template** (including distinguishing between two different Jushuitan/ERP export formats), so that routine imports take only a few clicks.
4. As a data analyst, I want to visually review and adjust the mapping from raw source columns to canonical **Order Line** fields before validation, so that platform header changes never block an import.
5. As a data analyst, I want to save an adjusted column mapping as a new custom **Mapping Template** (or update an existing custom template), so that future exports with the same layout are recognized automatically.
6. As a data analyst, I want to pick or enter a default **Shop** during upload when the source file (e.g., Taobao, JD, Douyin, Pinduoduo) lacks a shop-name column, so that every imported **Order Line** belongs to a valid **Shop** and **Platform**.
7. As a data analyst, I want files from Jushuitan ERP that contain multiple shops in one sheet to read each row's shop name automatically and prompt me during validation to bind any newly seen **Shop** to its **Platform**, so that Jushuitan orders aggregate accurately under Taobao/Tmall/Douyin/JD/Pinduoduo.

### Cleaning, Validation & Ingestion
8. As a data analyst, I want dirty numeric strings (such as JD's `2449.00（系统计算中，该值仅供参考）`, currency symbols, commas, or Excel `="..."` text-escaped order IDs) to be cleaned automatically during parsing, so that valid rows are not falsely rejected.
9. As a data analyst, I want JD multi-item orders (where every row repeats the order-level total payment, e.g., an air-conditioner indoor unit plus a `0.00`-priced outdoor unit) to automatically prorate `paid_amount` across lines by `unit_price * quantity` with exact cent-remainder reconciliation, so that **GMV** and **Net Sales** are never double-counted.
10. As a data analyst, I want multi-row orders containing the same SKU (split shipments, accessories, gifts) without a `sub_order_id` to receive deterministic **Line Keys** so that rows within the same order never overwrite each other.
11. As a data analyst, I want buyer PII columns (recipient name, phone, mobile, buyer nickname, detailed street address, district/street) to be automatically stripped before persistence — excluded from both canonical columns and `raw_extra` JSON — while preserving `province` and `city`, so that sensitive customer data is never stored.
12. As a data analyst, I want all non-PII unmapped source columns to be preserved inside `raw_extra` JSON on each **Order Line**, so that platform-specific fields (such as JD `应付金额`, Douyin `达人昵称`, PDD `商家实收金额`) are not permanently lost.
13. As a data analyst, I want a pre-commit validation report showing total rows, valid rows, warning rows, error rows, duplicate rows, and newly discovered shops — along with a preview table of error rows citing exact row number, column name, raw value, and failure reason — so that I can inspect data quality before touching the database.
14. As a data analyst, I want to download an Excel file containing only the invalid rows (with an appended error-reason column), so that I can fix them offline and re-upload cleanly.
15. As a data analyst, I want to choose whether to proceed with valid rows only (skipping invalid rows) or cancel the import completely when errors exist, so that a few bad rows do not block urgent reporting.
16. As a data analyst, I want to choose the duplicate-handling mode (`upsert` by default to refresh order/refund statuses, or `skip` to ignore existing lines) at commit time, so that re-exporting an overlapping date range updates statuses accurately.

### Batch Management & Rollback
17. As a data analyst, I want to browse all historical **Import Batches** with file name, **Data Source**, template used, row counts (total / inserted / updated / skipped / error), duplicate strategy, status (`committed` / `rolled_back`), and timestamp, so that every data load is auditable.
18. As a data analyst, I want to trigger an exact **Batch Rollback** on a committed batch so that newly inserted **Order Lines** are deleted and Upsert-updated **Order Lines** are restored to their exact pre-batch values.
19. As a data analyst, I want the system to prevent out-of-order rollback when a newer committed batch modified any of the same **Order Lines** (and clearly explain which newer batch must be rolled back first), so that historical state cannot be corrupted.
20. As a data analyst, I want to manage **Mapping Templates**, **Shop**-to-**Platform** bindings, and **Normalized Order Status** mapping rules from a dedicated configuration page, so that operational changes do not require code edits.

### Standardized Detail Query & Export
21. As a data analyst, I want to filter **Order Lines** by **Time Basis** (`order_time` default, or `pay_time` — excluding `ship_time`), date range, **Platform**, **Shop**, **Data Source**, **Normalized Order Status**, SKU/product keyword, order ID, and **Import Batch**, so that I can verify or slice any subset of sales data.
22. As a data analyst, I want to inspect paginated **Order Lines** in the browser (including key amounts, normalized + raw status, gift flag, and expandable `raw_extra` JSON), so that I can spot-check cleaning accuracy.
23. As a data analyst, I want to export the filtered **Order Lines** as a standardized `.xlsx` or `.csv` file (with UTF-8-BOM for Excel compatibility and order IDs formatted as text so Excel never turns them into scientific notation), so that I can use them directly in downstream analysis.

### Summary Reporting & Export
24. As a data analyst, I want to view a **Time × Platform/Shop Summary** report grouped by day, week, or month under my chosen **Time Basis** (`order_time` or `pay_time`), displaying **GMV**, **Refund Amount**, **Net Sales**, **Order Count** (distinct `platform_order_id`), and **Units Sold**.
25. As a data analyst, I want to view a **Product / SKU Ranking Summary** report showing SKU/product identifier, product name, **Platform** (optional grouping), **Units Sold**, **GMV**, **Refund Amount**, **Net Sales**, and **Order Count**, sorted by Net Sales or Units Sold.
26. As a data analyst, I want to export either summary report to `.xlsx` (with an optional toggle to include both the Summary sheet and the underlying Standardized Detail sheet in one workbook), so that I can immediately deliver formatted business reports.

## Implementation Decisions

- **Architecture & Ownership**:
  - Monorepo split into `backend/` (Python 3.11+ / FastAPI / SQLAlchemy 2.0 / Alembic / PyMySQL / pandas or polars + openpyxl, owned by Codex) and `frontend/` (React 18+ / TypeScript / Vite / Ant Design 5 / TanStack Query, owned by Antigravity).
  - Full REST API payloads, error envelopes, MySQL 8.0 DDL contract, and all 7 built-in **Mapping Templates** (derived from real uploaded headers) are formally specified in `docs/contracts/phase1-api-and-schema.md`.
- **Deep Backend Module Boundaries (Seams)**:
  1. `IngestionParser` — Reads Excel/CSV streams, detects encoding & sheet names, sanitizes Excel text-escaped IDs (`="..."`) and annotated numbers (`2449.00（系统计算中，该值仅供参考）`), strips buyer PII columns before staging.
  2. `TemplateMatcher & MappingEngine` — Matches headers against stored **Mapping Templates** by column-overlap fingerprint, applies column mapping, resolves **Shop** → **Platform**, normalizes statuses via `status_mappings`, and applies JD **Order-Level Amount Proration** & deterministic **Line Key** generation.
  3. `ValidationAndStagingService` — Validates canonical rows (required fields, decimal/date bounds, unknown shop detection, duplicate preview), persists staged payload temporarily on disk/DB with a `staged_id`, and generates downloadable error-row Excel files.
  4. `BatchCommitAndRollbackService` — Executes atomic MySQL chunked Upsert/Skip commits inside transactions, records pre-update snapshots in `import_batch_snapshots`, and enforces exact reverse-order **Batch Rollback**.
  5. `ReportingAndExportService` — Runs parameterized MySQL aggregation queries strictly obeying `GLOSSARY.md` metric formulas and streams `.xlsx` / `.csv` exports (forcing text cell format on long numeric IDs).
- **Frontend Structure (4 Core Routes)**:
  - `/import` — 4-step Import Wizard (Upload & Template Match → Column Mapping & Default Shop → Validation Preview & Unknown Shop Binding → Commit & Summary).
  - `/orders` — Standardized **Order Lines** filter bar, paginated table with `raw_extra` drawer, Excel/CSV export.
  - `/reports` — Top KPI summary strip, tabs for `Time × Platform/Shop` and `Product/SKU Ranking`, time-basis toggle (`order_time` / `pay_time`), Excel export (summary only or summary + detail sheets).
  - `/management` — Tabs for `Import Batches` (with Rollback confirmation & conflict guidance), `Mapping Templates`, and `Shops & Status Dictionary`.
- **No Auth / Single Intranet Posture**: No complex user/RBAC tables in Phase 1; CORS configured for local/intranet frontend origin.

## Testing Decisions

Tests must verify **external behavior through high-level module seams**, never internal private helper structure:
- **Backend Unit & Integration Seams (TDD via `pytest`)**:
  1. **ETL Cleaning & Proration Seam**: Feed anonymized CSV/XLSX fixtures mirroring all 6 sources (including the real JD multi-line indoor+outdoor AC case, `（系统计算中，该值仅供参考）` numeric strings, `(删除)暂停` status, blank `商家SKUID`, GBK CSV encoding, and PII columns) into the Parse+Validate pipeline and assert exact prorated `paid_amount` sums, deterministic `line_key`s, zero PII leakage in canonical fields or `raw_extra`, and accurate row-level error reports.
  2. **Commit & Exact Rollback Seam (against real/test MySQL DB)**: Commit Batch #1 → Upsert Batch #2 modifying subset of rows + inserting new rows → assert DB state → verify rolling back Batch #1 is rejected with conflict details → roll back Batch #2 → assert inserted rows are deleted and updated rows are bit-for-bit restored to Batch #1 values.
  3. **Metrics & Export Seam**: Seed mixed-status multi-line orders (`pending_pay`, `paid_unshipped`, `completed`, `closed_cancelled` before vs after payment) → assert `GMV`, `Refund Amount`, `Net Sales`, `Order Count` (`COUNT(DISTINCT platform_order_id)`), and `Units Sold` under both `order_time` and `pay_time`, and verify exported `.xlsx` preserves 16-digit order IDs as strings.
- **Frontend Testing Seams (Vitest + React Testing Library)**:
  1. **Import Wizard State & API Contract Seam**: Mock contract-compliant API responses to test step transitions (header auto-match, column remap, unknown shop binding gate, partial-valid commit vs cancel).
  2. **Filter & Report Export Controls Seam**: Verify `Time Basis` only offers `order_time` and `pay_time` (never `ship_time`), KPI formatting, and rollback confirmation/conflict error feedback.

## Out of Scope

- Direct e-commerce platform API sync (Taobao Open Platform, JD JOS, Douyin API, Jushuitan API).
- Separate financial settlement bills, promotion/ad spend tables, profit/COGS reconciliation, or inventory management.
- Multi-tenant authentication, RBAC permissions, or approval workflows.
- Custom visual dashboard/chart builder or drag-and-drop formula designer.
- `ship_time` as a report date filter basis.

## Further Notes

- The 7 built-in **Mapping Templates** (`jd_orders`, `pdd_orders`, `taobao_tmall_orders`, `douyin_orders`, `jushuitan_erp_a`, `jushuitan_erp_b`, plus template clone/custom support) are seeded directly from the exact headers supplied during grilling.
- Anonymized fixture files (synthetic order IDs & product names matching real header schemas) should be placed under `backend/tests/fixtures/` — never real customer exports.
