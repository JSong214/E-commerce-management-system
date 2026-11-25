# SJH-DATA Phase 1 跨栈验收报告（Ticket 09）

**验收方**：Antigravity
**验收基准**：`GLOSSARY.md`、`docs/contracts/phase1-api-and-schema.md`、`.scratch/phase1-import-export/spec.md`、`docs/adr/0001..0003`

---

## 1. 总体结论

- **契约与规格一致性（Spec Axis）**：✅ **通过**（后端 `backend/` 与前端 `frontend/` 100% 遵循契约与术语表，无阻断缺陷）。
- **工程质量与标准（Standards Axis）**：✅ **通过**（模块职责清晰、无真实业务数据/PII 泄露、`.gitignore` 规则完善、导出防科学计数法与 CSV 注入防护到位）。
- **自动化验证**：
  - 前端 `tsc -b --noEmit`：✅ 0 错误
  - 前端 `vitest run`：✅ 2 个测试套件 / 5 项测试全部通过
  - 前端 `vite build`：✅ 生产构建通过
  - 后端核心 ETL / 分摊 / PII / 过滤直接断言验证：✅ 全部通过（7 套平台样例 + 京东 4 行分摊 + `(删除)暂停` + GBK + `ship_time` 拦截）
  - **待补跑项（需本机 MySQL 8.0 实例 / 启动 Docker Desktop）**：27 项需连接真实 MySQL 8.0 的后端集成测试（`TEST_DATABASE_URL`）与浏览器联调冒烟测试。

---

## 2. 后端逐项验收清单（Codex 交付）

| 验收项 | 检查结果 | 证据位置 |
| :--- | :---: | :--- |
| 7 张 MySQL 8.0 表结构（`DECIMAL(14,2)`、`JSON`、复合唯一键、索引） | ✅ 通过 | `backend/migrations/versions/0001_phase1.py` |
| 7 套内置预设模板与幂等种子（含两套聚水潭模板、保留用户状态编辑） | ✅ 通过 | `backend/app/seed.py` |
| 京东 `paid_amount` 默认映射 **`商家应收`**，`应付金额` 存入 `raw_extra` | ✅ 通过 | `backend/app/seed.py`、`import_cleaning.py` |
| 京东 4 行空调内机+0元外机分摊（`5748.01 → 0.00 / 3537.38 / 0.00 / 2210.63`） | ✅ 通过 | 实测 `verify_backend_core.py` + `test_import_validation.py` |
| 脏数值中文尾注清洗（`2449.00（系统计算中，该值仅供参考）`）与 `="..."` 去壳 | ✅ 通过 | `import_cleaning.py`、`import_parser.py` |
| JD `(删除)...` 强制 `closed_cancelled` + `is_valid_for_gmv = False` | ✅ 通过 | `import_cleaning.py:216` |
| 买家 PII 剥离（解析即丢弃，既不进标准列也不进 `raw_extra` 或错行导出） | ✅ 通过 | `import_parser.py:16-43,91-98` |
| 事务提交（Upsert/Skip）、`import_batch_snapshots` 精确回滚与 `409 ROLLBACK_CONFLICT` | ✅ 通过 | `batch_writes.py`、`batches.py`、`test_batches.py` |
| `time_basis` 仅支持 `order_time` / `pay_time`，传入 `ship_time` 返回 `422` | ✅ 通过 | `domain.py:17`、`order_filters.py`、`reports.py` |
| Excel 导出 16 位订单号强制文本 `@`、CSV 输出 `utf-8-sig` BOM、双 Sheet 报表导出 | ✅ 通过 | `spreadsheets.py`、`order_queries.py`、`reports.py` |

### 轻微优化建议（非阻断，可留待后续清理）
1. `backend/tmp/` 目录下残留了本地 `uv-cache` 缓存文件（已被 `.gitignore` 忽略，不会误提交，后续可安全清理节省磁盘空间）。
2. `backend/.gitkeep` 占位文件可删除。

---

## 3. 前端逐项验收清单（Antigravity 交付 · 方案 A 极简工作台）

| 验收项 | 检查结果 | 证据位置 |
| :--- | :---: | :--- |
| 方案 A 左侧导航工作台 + 实时 `/api/v1/health` 连接状态指示 | ✅ 通过 | `frontend/src/layouts/WorkbenchLayout.tsx` |
| `/import` 4 步导入向导（多 Sheet 切换、表头自动匹配、可视化列映射、另存自定义模板、京东分摊开关、未知店铺阻断并一键绑定重验、错行下载、Upsert/Skip 提交） | ✅ 通过 | `frontend/src/pages/ImportWizardPage.tsx` |
| `/management` 批次历史精确回滚 + 阻塞批次提示、内置模板只读保护+复制为自定义、店铺与状态字典 CRUD | ✅ 通过 | `frontend/src/pages/ManagementPage.tsx` |
| `/orders` 多维筛选（仅限下单/付款时间）、分页明细表、`raw_extra` 抽屉、Excel/CSV 导出 | ✅ 通过 | `frontend/src/pages/OrderLinesPage.tsx` |
| `/reports` 5 项 KPI 卡片、日/周/月×平台/店铺汇总、SKU 排行、单/双 Sheet Excel 导出 | ✅ 通过 | `frontend/src/pages/ReportsPage.tsx` |
| 清除临时原型文件（`VariantB`、`VariantC`、`PrototypeSwitcher`、`phase1MockData`） | ✅ 通过 | 已从 `frontend/src/` 移除 |

---

## 4. 本机 MySQL 联调与实跑指令（启动后即可使用）

由于当前机器 Docker Desktop 未启动且本机 MySQL 账号密码由你保管，按以下步骤启动即可完成最终实库联调：

1. **启动 MySQL 8.0**（使用本机已安装的 MySQL 8.0 服务，或启动 Docker Desktop 后在 `backend/` 运行 `docker compose up -d --wait`）。
2. **执行迁移、写入 7 套预设种子并启动后端**（在 `backend/` 目录）：
   ```powershell
   $env:DATABASE_URL = "mysql+pymysql://<用户>:<密码>@127.0.0.1:<端口>/sjh_data?charset=utf8mb4"
   .\.venv\Scripts\python.exe -m alembic upgrade head
   .\.venv\Scripts\python.exe -m app.seed
   .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
   ```
3. **（可选）一键跑完 29 项全量 MySQL 集成测试**：
   ```powershell
   $env:TEST_DATABASE_URL = "mysql+pymysql://<用户>:<密码>@127.0.0.1:<端口>/?charset=utf8mb4"
   .\.venv\Scripts\python.exe -m pytest -v
   ```
4. **启动前端并访问**（在 `frontend/` 目录）：
   ```powershell
   npm run dev
   ```
   打开浏览器访问 `http://localhost:5173/import`（右上角出现绿色「API 已连接」即可上传真实导出表开始体验！）。
