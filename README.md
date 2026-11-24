# SJH-DATA 电商销售数据管理系统

面向数据分析工作流的电商销售数据管理与分析平台。

## 协作分工

本项目采用双 Agent 协作模式，所有共享规范记录在 [AGENTS.md](./AGENTS.md)：

- **Antigravity**：需求梳理、领域建模、架构与文档规划、前端原型与页面开发（`frontend/`、`docs/`）
- **Codex**：后端 API、数据导入/清洗（ETL）、数据库表结构设计与迁移（`backend/`）

## 目录结构

```text
SJH-DATA/
├── .agents/skills/          # 项目级 Skills（Antigravity 与 Codex 共用，不污染全局环境）
├── AGENTS.md                # 双 Agent 共享开发与协作规范
├── docs/
│   ├── agents/              # Skills 运行配置（本地任务追踪、领域文档约定）
│   └── contracts/           # 前后端接口与数据契约文档
├── frontend/                # 前端应用（由 Antigravity 负责）
├── backend/                 # 后端服务与数据库（由 Codex 负责）
└── .scratch/                # 本地功能 Spec 与拆分 Tickets（按需自动生成）
```

> `GLOSSARY.md`（电商业务术语表）和 `docs/adr/`（架构决策记录）将在需求澄清阶段通过 `grill-with-docs` / `domain-modeling` 按需自动生成。

## 已安装的项目级 Skills

来源：[mattpocock/skills](https://github.com/mattpocock/skills)（commit `abeeaf9`），仅安装在 `.agents/skills/`（项目级）：

| 分类 | Skill | 用途 |
| :--- | :--- | :--- |
| **规划与领域建模** | `grill-with-docs` + `grilling` + `domain-modeling` | 深度需求访谈，统一电商指标口径并自动沉淀 `GLOSSARY.md` 与 ADR |
| **规格与任务拆分** | `to-spec`、`to-tickets` | 将讨论结果转为正式 Spec，并拆分为带依赖顺序的独立任务票 |
| **前端与逻辑原型** | `prototype` | 快速构建多套可切换的 UI 视觉方案或独立 HTML 逻辑原型，先确认再落地 |
| **架构与工程质量** | `codebase-design`、`tdd`、`implement`、`code-review`、`diagnosing-bugs` | 保持模块清晰、测试驱动开发（尤其保障销售指标计算准确）、双维度代码评审与根因排查 |
| **跨 Agent 交接与路由** | `handoff`、`ask-matt`、`setup-matt-pocock-skills` | 在 Antigravity 与 Codex 之间无损交接上下文、查询当前适用流程、调整项目配置 |

## 推荐启动流程

1. **需求访谈与口径对齐**：使用 `grill-with-docs` 明确数据源、平台、核心指标口径、角色与功能边界。
2. **前端视觉/交互验证**（可选）：对核心看板或数据管理页面使用 `prototype` 生成多方案快速定型。
3. **沉淀 Spec 与拆分任务**：使用 `to-spec` 输出完整规格与前后端契约，再用 `to-tickets` 拆分为前端（Antigravity）与后端（Codex）任务。
4. **并行开发与交接**：各自按 `implement`（内置 `tdd` + `code-review`）推进，跨 Agent 交接时使用 `handoff`。
