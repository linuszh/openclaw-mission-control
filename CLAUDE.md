# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Setup & CI
```bash
make setup          # Install backend (uv) and frontend (npm) dependencies
make check          # Full CI parity: lint, typecheck, tests, coverage, frontend build
make api-gen        # Regenerate frontend TypeScript client (backend must be running on 127.0.0.1:8000)
```

### Local Development
```bash
# Start database only
docker compose -f compose.yml --env-file .env up -d db

# Backend (from repo root, after db is up)
cd backend && uv run uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend && npm run dev
```

### Backend
```bash
make backend-test           # pytest
make backend-coverage       # pytest with coverage (writes coverage.xml, coverage.json)
make backend-lint           # flake8 (max line 100)
make backend-typecheck      # mypy --strict
make backend-format         # black + isort
make backend-migrate        # alembic upgrade head
make backend-migration-check  # validate migration graph (reversibility check)
```

### Frontend
```bash
make frontend-test          # vitest
make frontend-lint          # eslint
make frontend-typecheck     # tsc --noEmit
make frontend-format        # prettier --write
make frontend-build         # next build
```

### Full Stack (Docker)
```bash
docker compose -f compose.yml --env-file .env up -d --build
```

## Architecture

### Backend (`backend/`)
FastAPI + SQLModel (async) + Alembic + PostgreSQL + Redis/RQ.

- `app/api/` — ~27 routers; each maps to a resource (`boards`, `tasks`, `agents`, `gateways`, `approvals`, `skills`, etc.)
- `app/models/` — SQLModel entities (~30). All primary models extend `TenantScoped` (auto-scopes all queries by `organization_id`)
- `app/schemas/` — Pydantic request/response schemas (separate from models)
- `app/services/` — Business logic; notably:
  - `openclaw/provisioning.py` — Agent provisioning, heartbeat, soul template sync
  - `openclaw/gateway_rpc.py` — WebSocket RPC to gateways
  - `openclaw/coordination_service.py` — Agent delegation/coordination
  - `email_sync.py` — IMAP sync → PostgreSQL → agent notification
  - `queue.py` + `queue_worker.py` — Redis/RQ background jobs (email sync, webhook delivery)
- `app/core/` — Config (`config.py`), auth, logging, error handling, OpenAPI normalization
- `app/db/` — Async session, CRUD helpers, pagination
- `migrations/versions/` — 50+ Alembic revisions; `DB_AUTO_MIGRATE=true` runs them on startup

**Dependency injection pattern**: `Depends()` with `SESSION_DEP`, `ORG_MEMBER_DEP`, `REQUIRE_ADMIN_*` defined in `app/api/deps.py`.

**Auth modes**: `local` (Bearer token in `LOCAL_AUTH_TOKEN` env var) or `clerk` (JWT via Clerk). Configured via `AUTH_MODE` env var.

### Frontend (`frontend/`)
Next.js (App Router) + React 19 + TailwindCSS + Radix UI + TanStack Query.

- `src/app/` — Next.js App Router pages (boards, agents, tasks, approvals, activity, gateways, skills, assistant, etc.)
- `src/components/` — Organized as `ui/` (Radix primitives), `atoms/`, `molecules/`, `organisms/`, plus feature-specific dirs
- `src/api/generated/` — Auto-generated TypeScript client via Orval; **never edit by hand**, run `make api-gen`
- `src/lib/api-base.ts` — API URL resolution logic
- `src/auth/` — Dual auth (local localStorage token or Clerk JWT); `AuthProvider` wraps the entire app

### OpenClaw Gateway Integration
OpenClaw is a **separate process** (running on port 18789) that Mission Control talks to as a control plane. Mission Control does not run agents itself — it tells the OpenClaw gateway to do so.

When an agent is "provisioned" from Mission Control, it:
1. Registers the agent with the gateway via WebSocket RPC (`agents.create` / `agents.update`) — setting workspace path, model, and heartbeat schedule
2. Writes markdown workspace files (`SOUL.md`, `HEARTBEAT.md`, `TOOLS.md`, etc.) into the agent's directory via `agents.files.set` RPC — these are the instructions the agent reads
3. Wakes the agent by sending it a chat message via `chat.send`

Key files: `app/services/openclaw/provisioning.py` (gateway RPC calls), `app/services/openclaw/gateway_rpc.py` (WebSocket transport), `backend/templates/` (Jinja2 templates rendered into agent workspaces). `SOUL.md` and other templates use `{{ auth_token }}` Jinja2 variables.

Board leads use `POST /api/v1/agent/boards/{board_id}/relay-task` to create tasks on other boards.

### Key Environment Variables
Copy from `.env.example` (root) and `backend/.env.example`. Critical ones:
- `AUTH_MODE` / `LOCAL_AUTH_TOKEN` — auth configuration
- `DATABASE_URL` — async PostgreSQL connection string
- `NEXT_PUBLIC_API_URL` — browser-visible API URL
- `DB_AUTO_MIGRATE` — run Alembic migrations on startup
- `RQ_REDIS_URL` — Redis for background job queue
- `GATEWAY_MIN_VERSION` — minimum compatible OpenClaw gateway version

## Coding Conventions
- **Python**: Black + isort + flake8. Max line length 100. `snake_case` throughout. Strict mypy.
- **TypeScript/React**: ESLint + Prettier. `PascalCase` components, `camelCase` functions/variables. Prefix intentionally unused destructured variables with `_`.
- **Commits**: Conventional Commits — `feat:`, `fix:`, `docs:`, `test(scope):`, etc.
