# Ticket 02: Backend Master Data APIs (Shops, Products, Sales Rules) & Excel Importers

- **Owner**: Codex (backend)
- **Status**: done
- **Depends on**: `01-backend-v2-schema-and-seed.md`

## Scope
Implement Sections 4.1, 4.2, and 4.3 of `docs/contracts/v2-master-and-sales-ingestion.md`:
1. **Shops & Aliases**:
   - Extended `GET/POST/PUT/DELETE /api/v1/shops` (preserving Phase 1 minimal-payload backward compatibility; syncing `is_active` with `shop_status == 'active'`).
   - `POST /api/v1/shops/{shop_id}/aliases` & `DELETE /api/v1/shops/aliases/{alias_id}`.
   - `POST /api/v1/master-data/shops/import-excel` parsing `店铺基础信息.xlsx` (all 5 sheets, Chinese label → enum mapping, idempotent upsert preserving existing aliases and per-shop flags).
2. **Product Master**:
   - CRUD for `product_categories`, `product_models`, `product_unit_components`, `product_channel_mappings`.
   - `GET /api/v1/products/channel-mappings` with `only_ambiguous=true` and `ambiguous_groups` computation.
   - `POST /api/v1/master-data/products/import-excel` parsing `产品基础信息.xlsx` (`产品分类`, `产品型号`, `产品内外机` incl. `映射值`, `产品ID匹配` normalizing `tm_sku-id` → `tm_sku_id`), preserving 1-to-many rows and returning `ambiguous_conflicts`.
3. **Configurable Sales Rules**:
   - `GET /api/v1/sales-rules` and `PUT /api/v1/sales-rules/{rule_key}`.

## Acceptance Criteria
- Automated `pytest` tests cover anonymized Excel fixtures mirroring `店铺基础信息.xlsx` and `产品基础信息.xlsx`, including `焕新生活`, `启用/休眠/未启用`, indoor/outdoor components with `映射值`, 1-to-many ID conflicts, and idempotent re-imports.
- Duplicate alias/model/component errors return contract `409` envelopes; malformed Excels return `422 INVALID_MASTER_EXCEL`.
