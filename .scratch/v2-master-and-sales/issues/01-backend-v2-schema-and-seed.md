# Ticket 01: Backend V2 MySQL Schema Migration & Seed Data

- **Owner**: Codex (backend)
- **Status**: done
- **Depends on**: `docs/contracts/v2-master-and-sales-ingestion.md`

## Scope
1. Create Alembic revision `backend/migrations/versions/0002_v2_master_and_sales.py` (`down_revision = "0001_phase1"`) implementing every `ALTER TABLE` and `CREATE TABLE` in Section 2 of `docs/contracts/v2-master-and-sales-ingestion.md` (`shops` extensions, `shop_aliases`, `product_categories`, `product_models`, `product_unit_components`, `product_channel_mappings`, `sales_rules`, `import_batches` extensions, `order_lines` extensions, `effective_sales_records`), plus clean `downgrade()`.
2. Update `backend/app/seed.py` to idempotently seed:
   - All 7 configurable `sales_rules` from Section 3.1 (insert-if-missing so user toggles persist).
   - Built-in template `tmall_erp_a` recognizing `天猫订单.xlsx` headers (`系统单号`, `发货LP号`, `分销商店铺名称`, `实收金额`, `订货数量`, `商品编码`, `货品编码`, `退款`, `状态`, etc.) with `data_source = 'tmall'`.
   - Update `jd_orders` template column mapping to also capture `payable_amount` (`应付金额`), and `jushuitan_erp_b` template to capture `erp_paid_amount` (`已付金额`), `order_type` (`订单类型`), `internal_order_id` (`内部订单号`), `external_order_id` (`原始线上订单号`), and `raw_model_hint` (`标准商品名` / `款号`).

## Acceptance Criteria
- `alembic upgrade head` and `alembic downgrade 0001_phase1` run cleanly on MySQL 8.0.
- Repeated seed calls are idempotent and do not overwrite customized `sales_rules`.
- Existing Phase 1 schema constraints and indexes remain intact.
