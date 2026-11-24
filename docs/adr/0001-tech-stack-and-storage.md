---
status: accepted
---

# Tech stack: React + Python (FastAPI) + MySQL 8.0

We use React (TypeScript) for the frontend, Python (FastAPI) for the backend ETL/API service, and MySQL 8.0 for relational storage, deployed for local or company intranet use without complex RBAC in Phase 1.

Python has the strongest ecosystem for handling messy Chinese e-commerce Excel/CSV exports (mixed encodings, scientific-notation order IDs, multi-format dates, Excel report generation), while MySQL 8.0 provides `DECIMAL` financial precision, composite unique keys for Upsert deduplication, and `JSON` columns (`raw_extra`) to preserve unmapped platform-specific fields without schema churn.
