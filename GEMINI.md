# GEMINI.md

## Project Overview

OpenClaw Mission Control is a centralized operations and governance platform for OpenClaw. It provides a unified interface for agent and gateway management, work orchestration, approval-driven governance, and API-backed automation.

### Tech Stack

- **Backend:** Python 3.12+ (FastAPI), SQLAlchemy/SQLModel (async), Alembic (migrations), Redis/RQ (background tasks).
- **Frontend:** Next.js (React 19), TypeScript, Tailwind CSS, TanStack Query, Radix UI, Orval (API client generation).
- **Authentication:** Supports `local` (shared bearer token) and `clerk` (JWT) modes.
- **Infrastructure:** Docker Compose, PostgreSQL, Redis.

## Project Structure

- `backend/`: FastAPI service.
  - `app/api/`: API route definitions.
  - `app/models/`: Database models (SQLModel).
  - `app/schemas/`: Pydantic schemas.
  - `app/services/`: Core business logic.
  - `migrations/`: Alembic migration scripts.
- `frontend/`: Next.js application.
  - `src/app/`: Next.js App Router pages and layouts.
  - `src/components/`: Reusable React components.
  - `src/api/generated/`: API client generated from backend OpenAPI spec.
- `docs/`: Comprehensive documentation for development, deployment, and testing.
- `scripts/`: Utility scripts for database checks, CI, and tooling wrappers.

## Building and Running

### Prerequisites

- Docker and Docker Compose v2.
- Python 3.12+ with `uv` installed.
- Node.js and `npm`.

### Key Commands

- **Setup:** `make setup` (Syncs backend `uv` and frontend `npm` dependencies).
- **Full Stack (Docker):** `docker compose -f compose.yml --env-file .env up -d --build`.
- **Fast Local Development:**
  - Database: `docker compose -f compose.yml --env-file .env up -d db`.
  - Backend: `cd backend && uv run uvicorn app.main:app --reload --port 8000`.
  - Frontend: `cd frontend && npm run dev`.
- **Database Migrations:** `make backend-migrate` (Applies Alembic migrations).
- **API Client Generation:** `make api-gen` (Regenerates frontend API client from running backend).

## Testing

- **All Checks:** `make check` (Runs linting, typechecking, tests, and frontend build).
- **Backend Tests:** `make backend-test` (Pytest).
- **Backend Coverage:** `make backend-coverage` (Enforces 100% coverage on scoped modules).
- **Frontend Tests:** `make frontend-test` (Vitest).
- **E2E Tests:** `cd frontend && npm run e2e` (Cypress).

## Development Conventions

- **Python Styling:** Follows Black, isort, and flake8 standards. Uses strict MyPy for typechecking. Max line length is 100.
- **TypeScript Styling:** ESLint and Prettier. Components use `PascalCase`; variables/functions use `camelCase`. Prefix intentionally unused destructured variables with `_`.
- **Commits:** Use Conventional Commits (e.g., `feat:`, `fix:`, `docs:`, `test:`).
- **Migrations:** Strictly follow the "one migration per PR" policy. Validate with `make backend-migration-check`.
- **Documentation:** Update relevant docs in `/docs` when changing operator-facing or contributor-facing behavior.
- **Tests:** Add or update tests for every behavioral change.
