# Codex Handoff — V2 Slice 1 Backend Implementation (Modules 1 & 2)

> **协作模式**：方式 A（Codex 负责 `backend/` 全部后端实现与测试，不修改 `frontend/`；Antigravity 同步负责 `frontend/` 重构与联调验收）。

## 必读文档（写代码前请完整阅读）
1. `AGENTS.md` — 目录分工（仅改 `backend/`）、契约优先、数据安全与脱敏规则。
2. `GLOSSARY.md` — V2 统一业务术语（`Source Role`、`Standard Model`、`Unit Component`、`Whole-Unit Merging`、`Effective Sales Record`、`Pending Model Confirmation` 等）。
3. `docs/adr/0004-master-data-and-two-layer-sales-model.md` — V2 两层销售架构与主数据决策（已取代 ADR-0003 的京东分摊有效销售口径）。
4. **`docs/contracts/v2-master-and-sales-ingestion.md`** — **唯一事实来源（Single Source of Truth）**，包含 Alembic `0002_v2_master_and_sales.py` 完整 DDL、匹配级联算法、直出 vs ERP 优先级矩阵、各平台金额与排除规则、以及全部 REST API 请求/响应契约。
5. `.scratch/v2-master-and-sales/spec.md` — 需求范围与测试验收边界。

---

## 分配给 Codex 的后端任务（严格按依赖顺序执行，TDD 驱动）

请依次执行 `.scratch/v2-master-and-sales/issues/` 中归属 Codex 的 4 张 Ticket，并随进度更新各 Ticket 顶部的 `Status:`（`in-progress` → `done`）：

1. **`01-backend-v2-schema-and-seed.md`**
   - 编写增量迁移 `backend/migrations/versions/0002_v2_master_and_sales.py`（在 `0001_phase1` 之上安全演进）。
   - 扩展种子数据 `seed.py`：幂等初始化 7 条默认 `sales_rules`、新增 `tmall_erp_a` 内置模板（识别 `天猫订单.xlsx` 的 `系统单号/发货LP号/分销商店铺名称/实收金额`）、保留向后兼容的 Phase 1 种子行为。
2. **`02-backend-master-data-apis-and-excel-import.md`**
   - 实现店铺主数据 & 别名 CRUD、状态过滤与 `POST /api/v1/master-data/shops/import-excel`（支持 `店铺基础信息.xlsx` 5 个 Sheet 校验与中文枚举映射，不覆盖已有别名和店铺开关）。
   - 实现产品分类 / 标准型号 / 内外机组件 / 多渠道 ID 映射 CRUD、冲突列表查询（`only_ambiguous=true` + `ambiguous_groups`）与 `POST /api/v1/master-data/products/import-excel`（支持 `产品基础信息.xlsx` 4 个 Sheet、`tm_sku-id` 归一、保留一对多冲突并完整报告）。
   - 实现 `GET/PUT /api/v1/sales-rules`。
3. **`03-backend-v2-ingestion-matching-and-effective-sales.md`**
   - 升级导入链路（`parse-preview` / `validate` / `commit` / `batches/{id}/rollback`）：
     - 支持 `source_role`（`direct_sales` / `erp_enrich` / `erp_independent_sales`）及自动推荐。
     - 店铺解析支持 `shop_aliases` 与 `dormant` 休眠店历史补录；`inactive` 店铺明确报 `422 SHOP_INACTIVE`。
     - 实现严格按契约 3.3 的 **ProductMatcher**（3C 完整品名 → 渠道 ID 作用域/次级键/全局查找 → 内外机与 `映射值` → 标准型号与 KFR 提取；一对多冲突立即停止并标 `ambiguous` 保存候选列表，绝不盲猜）。
     - 实现契约 3.4 的 **直出优先 / ERP 仅补空** 与订单级补全兜底，确保「先直出后 ERP」与「先 ERP 后直出」产出完全一致的 Layer 2 结果。
     - 实现 **EffectiveSalesBuilder**（契约 3.5）：京东整机合并（主行非外机 + `应付金额(K)` + 保留 `source_order_line_ids`）、淘宝 N 列 / 百亿补贴供货价 / `<1000` 提示、天猫 LP 优先与 `天猫优品`、拼多多/抖音规则、3C 店铺 `0 实收取已付` 与品牌别名、补发/补差价排除、400 元可配置门槛。
     - 确保 `rollback` 在事务内恢复 `order_lines` 并精准重算/清理受影响的 `effective_sales_records`。
4. **`04-backend-effective-sales-query-export-and-model-review.md`**
   - 实现 `GET /api/v1/effective-sales`（含 KPI 汇总 strip）、`GET /api/v1/effective-sales/{id}`（含关联 Layer 1 `source_order_lines` 追溯）、`GET /api/v1/effective-sales/export`（`.xlsx` 长单号文本格式 & `.csv` UTF-8-BOM）。
   - 实现 `GET /api/v1/model-review/pending`（按来源/店铺/外部ID/原始商品分组展示影响条数与金额）和 `POST /api/v1/model-review/resolve`（支持按 `record_ids` 或 `group_filter` 批量确认，勾选 `save_as_mapping_rule=true` 时写入 `product_channel_mappings` 并回溯更新所有匹配的待确认记录）。

---

## 必须守住的关键边界（Do Not Miss）
- **绝不把真实生产数据或 PII 写入仓库 / 测试 fixture**：所有自动化测试必须使用脱敏构造的 fixture（放置在 `backend/tests/fixtures/` 或内存生成）。
- **保持 Phase 1 既有测试与核心接口可用**：在新增 V2 表和接口时，保持既有 `/api/v1/health`、`/api/v1/batches`、`/api/v1/order-lines`、`/api/v1/templates`、`/api/v1/status-mappings` 正常工作；如 Phase 1 某些断言与 V2 新口径（如京东 `payable_amount`）有变化，请同步更新对应单测并在回复中明确列出变更点。
- **所有 MySQL 迁移与回归测试必须实跑通过**：完成开发后在 `backend/` 运行 `alembic upgrade head`（如本机 MySQL 就绪）与完整 `pytest`，确保全部通过且无未提交的临时数据文件。
- **回复要求**：完成后请简要汇报：① 新增/修改的后端文件清单；② `pytest` 执行结果；③ 与契约是否有任何细节补充或偏差，方便 Antigravity 立即执行前后端跨栈联调验收。
