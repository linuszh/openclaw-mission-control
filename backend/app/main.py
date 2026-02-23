"""FastAPI application entrypoint and router wiring for the backend."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import TYPE_CHECKING, Any

from fastapi import APIRouter, FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi_pagination import add_pagination

from app.api.activity import router as activity_router
from app.api.agent import router as agent_router
from app.api.agents import router as agents_router
from app.api.approvals import router as approvals_router
from app.api.auth import router as auth_router
from app.api.board_group_memory import router as board_group_memory_router
from app.api.board_groups import router as board_groups_router
from app.api.board_memory import router as board_memory_router
from app.api.board_onboarding import router as board_onboarding_router
from app.api.board_webhooks import router as board_webhooks_router
from app.api.boards import router as boards_router
from app.api.gateway import router as gateway_router
from app.api.gateways import router as gateways_router
from app.api.metrics import router as metrics_router
from app.api.organizations import router as organizations_router
from app.api.skills_marketplace import router as skills_marketplace_router
from app.api.souls_directory import router as souls_directory_router
from app.api.tags import router as tags_router
from app.api.task_custom_fields import router as task_custom_fields_router
from app.api.tasks import router as tasks_router
from app.api.telegram_webhooks import router as telegram_webhooks_router
from app.api.users import router as users_router
from app.core.config import settings
from app.core.error_handling import install_error_handling
from app.core.logging import configure_logging, get_logger
from app.core.openapi import build_custom_openapi
from app.db.session import init_db
from app.schemas.health import HealthStatusResponse

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

configure_logging()
logger = get_logger(__name__)
OPENAPI_TAGS = [
    {
        "name": "auth",
        "description": (
            "Authentication bootstrap endpoints for resolving caller identity and session context."
        ),
    },
    {
        "name": "health",
        "description": (
            "Service liveness/readiness probes used by infrastructure and runtime checks."
        ),
    },
    {
        "name": "agents",
        "description": "Organization-level agent directory, lifecycle, and management operations.",
    },
    {
        "name": "activity",
        "description": "Activity feed and audit timeline endpoints across boards and operations.",
    },
    {
        "name": "gateways",
        "description": "Gateway management, synchronization, and runtime control operations.",
    },
    {
        "name": "metrics",
        "description": "Aggregated operational and board analytics metrics endpoints.",
    },
    {
        "name": "organizations",
        "description": "Organization profile, membership, and governance management endpoints.",
    },
    {
        "name": "souls-directory",
        "description": "Directory and lookup endpoints for agent soul templates and variants.",
    },
    {
        "name": "skills",
        "description": "Skills marketplace, install, uninstall, and synchronization endpoints.",
    },
    {
        "name": "board-groups",
        "description": "Board group CRUD, assignment, and grouping workflow endpoints.",
    },
    {
        "name": "board-group-memory",
        "description": "Shared memory endpoints scoped to board groups and grouped boards.",
    },
    {
        "name": "boards",
        "description": "Board lifecycle, configuration, and board-level management endpoints.",
    },
    {
        "name": "board-memory",
        "description": "Board-scoped memory read/write endpoints for persistent context.",
    },
    {
        "name": "board-webhooks",
        "description": "Board webhook registration, delivery config, and lifecycle endpoints.",
    },
    {
        "name": "board-onboarding",
        "description": "Board onboarding state, setup actions, and onboarding workflow endpoints.",
    },
    {
        "name": "approvals",
        "description": "Approval request, review, and status-tracking operations for board tasks.",
    },
    {
        "name": "tasks",
        "description": "Task CRUD, dependency management, and task workflow operations.",
    },
    {
        "name": "custom-fields",
        "description": "Organization custom-field definitions and board assignment endpoints.",
    },
    {
        "name": "tags",
        "description": "Tag catalog and task-tag association management endpoints.",
    },
    {
        "name": "users",
        "description": "User profile read/update operations and user-centric settings endpoints.",
    },
    {
        "name": "agent",
        "description": (
            "Agent-scoped API surface. All endpoints require `X-Agent-Token` and are "
            "constrained by agent board access policies."
        ),
    },
    {
        "name": "agent-lead",
        "description": (
            "Lead workflows: delegation, review orchestration, approvals, and "
            "coordination actions."
        ),
    },
    {
        "name": "agent-worker",
        "description": (
            "Worker workflows: task execution, task comments, and board/group context "
            "reads/writes used during heartbeat loops."
        ),
    },
    {
        "name": "agent-main",
        "description": (
            "Gateway-main control workflows that message board leads or broadcast "
            "coordination requests."
        ),
    },
]


class MissionControlFastAPI(FastAPI):
    """FastAPI application with custom OpenAPI normalization."""

    def openapi(self) -> dict[str, Any]:
        return build_custom_openapi(self)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Initialize application resources before serving requests."""
    logger.info(
        "app.lifecycle.starting environment=%s db_auto_migrate=%s",
        settings.environment,
        settings.db_auto_migrate,
    )
    await init_db()
    logger.info("app.lifecycle.started")
    try:
        yield
    finally:
        logger.info("app.lifecycle.stopped")


app = MissionControlFastAPI(
    title="Mission Control API",
    version="0.1.0",
    lifespan=lifespan,
    openapi_tags=OPENAPI_TAGS,
)

origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
if origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Total-Count", "X-Limit", "X-Offset"],
    )
    logger.info("app.cors.enabled origins_count=%s", len(origins))
else:
    logger.info("app.cors.disabled")

install_error_handling(app)


@app.get(
    "/health",
    tags=["health"],
    response_model=HealthStatusResponse,
    summary="Health Check",
    description="Lightweight liveness probe endpoint.",
    responses={
        status.HTTP_200_OK: {
            "description": "Service is alive.",
            "content": {"application/json": {"example": {"ok": True}}},
        }
    },
)
def health() -> HealthStatusResponse:
    """Lightweight liveness probe endpoint."""
    return HealthStatusResponse(ok=True)


@app.get(
    "/healthz",
    tags=["health"],
    response_model=HealthStatusResponse,
    summary="Health Alias Check",
    description="Alias liveness probe endpoint for platform compatibility.",
    responses={
        status.HTTP_200_OK: {
            "description": "Service is alive.",
            "content": {"application/json": {"example": {"ok": True}}},
        }
    },
)
def healthz() -> HealthStatusResponse:
    """Alias liveness probe endpoint for platform compatibility."""
    return HealthStatusResponse(ok=True)


@app.get(
    "/readyz",
    tags=["health"],
    response_model=HealthStatusResponse,
    summary="Readiness Check",
    description="Readiness probe endpoint for service orchestration checks.",
    responses={
        status.HTTP_200_OK: {
            "description": "Service is ready.",
            "content": {"application/json": {"example": {"ok": True}}},
        }
    },
)
def readyz() -> HealthStatusResponse:
    """Readiness probe endpoint for service orchestration checks."""
    return HealthStatusResponse(ok=True)


api_v1 = APIRouter(prefix="/api/v1")
api_v1.include_router(auth_router)
api_v1.include_router(agent_router)
api_v1.include_router(agents_router)
api_v1.include_router(activity_router)
api_v1.include_router(gateway_router)
api_v1.include_router(gateways_router)
api_v1.include_router(metrics_router)
api_v1.include_router(organizations_router)
api_v1.include_router(souls_directory_router)
api_v1.include_router(skills_marketplace_router)
api_v1.include_router(board_groups_router)
api_v1.include_router(board_group_memory_router)
api_v1.include_router(boards_router)
api_v1.include_router(board_memory_router)
api_v1.include_router(board_webhooks_router)
api_v1.include_router(board_onboarding_router)
api_v1.include_router(approvals_router)
api_v1.include_router(tasks_router)
api_v1.include_router(telegram_webhooks_router)
api_v1.include_router(task_custom_fields_router)
api_v1.include_router(tags_router)
api_v1.include_router(users_router)
app.include_router(api_v1)

add_pagination(app)
logger.debug("app.routes.registered count=%s", len(app.routes))
