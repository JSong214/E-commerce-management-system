# Ticket 05: Frontend V2 Contracts, Navigation & Master Data Center (`/master-data`)

- **Owner**: Antigravity (frontend)
- **Status**: done
- **Depends on**: `docs/contracts/v2-master-and-sales-ingestion.md`

## Scope
1. Define TypeScript contracts (`frontend/src/contracts/v2.ts`) and typed API client methods (`frontend/src/api/v2Client.ts`) strictly mirroring `docs/contracts/v2-master-and-sales-ingestion.md`.
2. Update `WorkbenchLayout` navigation to reflect V2 Slice 1 workflow:
   - `/master-data` — 基础主数据中心
   - `/import` — 销售数据导入
   - `/effective-sales` — 有效销售明细
   - `/model-review` — 待确认型号队列（with live pending badge）
   - `/orders` — 原始订单行（Layer 1 留档追溯）
   - `/management` — 规则、模板与批次管理
3. Build `MasterDataPage` (`/master-data`) with tabs:
   - **店铺主数据**：一键导入 `店铺基础信息.xlsx`、筛选（平台含焕新生活/运营方/模式/状态）、增删改查、ERP独立入销/3C零实收/完整品名开关、别名管理弹窗。
   - **产品型号与内外机**：一键导入 `产品基础信息.xlsx`（弹窗展示导入统计与冲突提示）、分类/型号管理、展开查看/维护内外机组件（含 `映射值`）与渠道 ID 映射。
   - **渠道 ID 冲突清单**：专门筛选展示一对多冲突分组（`ambiguous_groups`），支持直接编辑或新增作用域映射化解冲突。

## Acceptance Criteria
- `npm run build` passes with zero TS errors; Vitest covers Excel import triggers, shop alias editing, and conflict tab rendering.
