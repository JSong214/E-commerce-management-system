# Ticket 06: Frontend V2 Import Wizard, Effective Sales Workbench, Model Review & Rules Config

- **Owner**: Antigravity (frontend)
- **Status**: done
- **Depends on**: `05-frontend-master-data-center.md`

## Scope
1. **Refactor `ImportWizardPage` (`/import`)**:
   - Step 1/2: Add **Source Role** selector (`平台直出销售` / `聚水潭ERP补全` / `ERP/手工独立销售`, auto-preselected from `recommended_source_role`) with concise explanation.
   - Step 3: Show V2 projection cards (`预计有效销售` / `已排除及原因分布` / `JD整机合并数` / `ERP补全条数` / `待确认型号数`), surface `inactive_shops` vs `unknown_shops`, and preview `ambiguous_model_preview`.
   - Step 4: Show V2 commit metrics with direct CTA buttons to `/effective-sales` and `/model-review` (when `pending_model_rows > 0`).
2. **Build `EffectiveSalesPage` (`/effective-sales`)**:
   - Top KPI strip (`有效销售单/行`, `有效销量`, `有效销售额`, `已排除`, `待确认型号`).
   - Filter bar (`business_time`/`order_time`/`pay_time`, date range, platform, shop, brand, category, eligibility status tabs `有效销售`/`排除清单`/`待核对`/`全部`, model match status, keyword) + Excel/CSV export.
   - Row detail drawer calling `GET /api/v1/effective-sales/{id}` showing contributing Layer-1 `source_order_lines` (indoor/outdoor rows), `amount_source`, ERP enrichment diff, and notices.
3. **Build `ModelReviewPage` (`/model-review`)**:
   - Grouped table of `ambiguous` and `unmatched` pending items with affected counts, total sales amount, and candidate pills.
   - Inline/modal model selector (searchable across all standard models) + checkbox **"一键沉淀为映射规则"** (`shop`-scoped vs `global`) triggering `POST /api/v1/model-review/resolve`.
4. **Update `ManagementPage` (`/management`)**:
   - Add **销售业务规则** tab backed by `GET/PUT /api/v1/sales-rules` (toggle switches + editable threshold/params for `min_sales_amount`, `taobao_subsidy_fallback`, `jd_whole_unit_merge`, `zero_received_use_paid`, `exclude_reship_and_price_diff`, `erp_source_priority`, `tmall_order_id_priority`).
   - Enhance Batch History table with `source_role`, `effective_rows`, `excluded_rows`, `pending_model_rows`, `enriched_rows`.

## Acceptance Criteria
- Vitest covers V2 Import Wizard source role + projection preview, Effective Sales filtering & traceability drawer, Pending Model grouped resolution with rule-learning toggle, and Sales Rules toggle persistence.
