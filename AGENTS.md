# SJH-DATA — Project Agent Guidelines

## Project Overview

SJH-DATA is an e-commerce sales data management & analytics platform built for a data analyst workflow (importing, cleaning, querying, managing, and visualizing e-commerce sales data).

## Multi-Agent Division of Responsibilities

This repository is developed collaboratively by two AI coding agents:

| Agent | Primary Scope | Owned Directories |
| :--- | :--- | :--- |
| **Antigravity** | Product planning, architecture, domain modeling, specs, UI/UX prototyping, frontend implementation, and cross-stack acceptance verification | `frontend/`, `docs/`, `.scratch/` (planning/specs) |
| **Codex** | Backend services, API implementation, ETL/data ingestion pipelines, database schema & migrations | `backend/` |

### Collaboration Rules

1. **Contract-first boundary**: Any change affecting API endpoints, request/response payloads, or data export/import formats must be documented in `docs/contracts/` (or the active feature spec in `.scratch/<feature>/spec.md`) before either side implements it.
2. **Respect directory ownership**:
   - Antigravity should not modify production code under `backend/` unless explicitly asked by the user.
   - Codex should not modify production code under `frontend/` unless explicitly asked by the user.
   - Both agents may read the entire repository to stay aligned on types, contracts, and behavior.
3. **Shared domain language**: All e-commerce metrics and business terms (e.g., GMV, net sales, SKU/SPU, order vs. settlement date, refund attribution) must follow `GLOSSARY.md` once defined. Never silently invent conflicting terms or formulas across frontend and backend.
4. **Traceable handoffs**: When handing a task between Antigravity and Codex, reference the exact spec/ticket path under `.scratch/<feature-slug>/` and keep acceptance criteria + test expectations explicit.
5. **Data safety**: Never commit real production sales datasets, customer PII, or credentials (`.env`, `*.csv`, `*.xlsx`, `*.sqlite`, `*.db`, `*.parquet` under `data/` are gitignored). Use small anonymized fixture files for automated tests.

## Agent skills

Project-level skills live in `.agents/skills/` (discovered natively by both Antigravity and Codex).

### Issue tracker

Local markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context (`GLOSSARY.md` + `docs/adr/` at the repo root, created lazily via `grill-with-docs` / `domain-modeling`). See `docs/agents/domain.md`.
