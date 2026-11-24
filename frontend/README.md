# SJH-DATA Frontend

React 18 + TypeScript + Vite + Ant Design 5 frontend for SJH-DATA Phase 1.

## Quick Start

```bash
cd frontend
pnpm install
pnpm dev
```

Open `http://localhost:5173/import` in your browser.

### Previewing the 3 UI Prototype Variants
- Variant A (极简工作台): `http://localhost:5173/import?variant=A`
- Variant B (双栏操作台): `http://localhost:5173/import?variant=B`
- Variant C (高密度数据终端): `http://localhost:5173/import?variant=C`

You can also cycle between variants using the floating bottom pill or keyboard `←` / `→` arrows across all 4 routes (`/import`, `/orders`, `/reports`, `/management`).

## Scripts

- `npm run typecheck` — TypeScript check (`tsc -b --noEmit`)
- `npm test` — Vitest unit & component tests
- `npm run build` — Production build
