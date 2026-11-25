# SJH-DATA Frontend

React 18 + TypeScript + Vite + Ant Design 5 + TanStack Query frontend for SJH-DATA Phase 1 (Variant A: 极简工作台).

## Quick Start

```bash
cd frontend
pnpm install
npm run dev
```

Frontend dev server reads `frontend/.env` (template in [`.env.example`](.env.example), gitignored) and defaults to `http://localhost:5173` while proxying `/api/*` to the FastAPI backend at `http://127.0.0.1:8000`.

- `FRONTEND_PORT` / `API_PROXY_TARGET` — Node-side Vite dev server & proxy config (not exposed to browser bundle).
- `VITE_API_BASE_URL` — Public API base prefix used by the browser client (default `/api/v1`). Never put database credentials or secrets in `frontend/.env`.

## Routes

- `/import` — 4 步数据导入与清洗校验向导（文件上传、列映射、新店铺绑定、错行下载、Upsert/Skip 提交）
- `/orders` — 标准化销售明细多维筛选查询、`raw_extra` 抽屉查看与 Excel/CSV 导出
- `/reports` — 核心 KPI 概览、`日期 × 平台/店铺汇总`、`商品/SKU 排行` 与单/双 Sheet Excel 导出
- `/management` — 导入批次历史（精确倒序回滚）、映射模板管理、店铺-平台归属与状态归一化字典

## Verification Scripts

- `npm run typecheck` — TypeScript strict check (`tsc -b --noEmit`)
- `npm test` — Vitest + React Testing Library suite
- `npm run build` — Production bundle build (`tsc -b && vite build`)
