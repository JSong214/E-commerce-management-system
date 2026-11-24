# 02: Frontend Scaffold, Contract Types & Interactive UI Prototype

**Owner:** Antigravity (frontend)
**Blocked by:** None (can start immediately)
**Status:** done

**What to build:**
Initialize the React + TypeScript + Vite + Ant Design 5 application under `frontend/`, define strict TypeScript types and an API client layer matching `docs/contracts/phase1-api-and-schema.md`, configure the 4 core routes (`/import`, `/orders`, `/reports`, `/management`), and build a 3-variant interactive UI prototype (following `.agents/skills/prototype/UI.md`, switchable via `?variant=A|B|C` and a dev-only floating bottom switcher) so the user can pick the visual architecture and layout before wiring full production screens.

- [x] `frontend/` builds cleanly (`pnpm build`, `tsc --noEmit`) with React, TypeScript, Vite, React Router, TanStack Query, and Ant Design 5.
- [x] Shared TypeScript contract types cover all enums (`data_source`, `platform`, `normalized_status`, `time_basis` strictly `order_time | pay_time`, `duplicate_strategy`) and REST payloads in `docs/contracts/phase1-api-and-schema.md`.
- [x] Interactive UI prototype renders 3 structurally distinct layout/interaction variants (`A`, `B`, `C`) populated with realistic anonymized e-commerce sales data (including the JD indoor+outdoor prorated order scenario) and a keyboard/click-accessible bottom switcher (`←` / `→`).
- [x] Vitest + React Testing Library setup runs green on initial contract/component smoke tests.
