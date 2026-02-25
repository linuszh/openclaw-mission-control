"""Bot-friendly API endpoints for conversational task management."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.boards import list_boards
from app.api.deps import get_session, require_admin_auth, require_admin_or_agent
from app.api.tasks import create_task
from app.core.auth import AuthContext
from app.core.logging import get_logger
from app.models.boards import Board
from app.schemas.boards import BoardRead
from app.schemas.pagination import DefaultLimitOffsetPage
from app.schemas.tasks import TaskCreate, TaskRead

router = APIRouter(prefix="/bot", tags=["bot"])
logger = get_logger(__name__)


@router.get("/projects", response_model=DefaultLimitOffsetPage[BoardRead])
async def bot_list_projects(
    session: AsyncSession = Depends(get_session),
    _actor: Any = Depends(require_admin_or_agent),
) -> Any:
    """List available projects/boards for the bot."""
    return await list_boards(session=session)


@router.post("/projects/{board_id}/tasks", response_model=TaskRead)
async def bot_create_task(
    board_id: UUID,
    payload: TaskCreate,
    session: AsyncSession = Depends(get_session),
    auth: AuthContext = Depends(require_admin_auth),
) -> Any:
    """Create a task in a specific project."""
    board = await session.get(Board, board_id)
    if not board:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    return await create_task(
        payload=payload,
        board=board,
        session=session,
        auth=auth,
    )


@router.get("/projects/{board_id}/context")
async def bot_get_project_context(
    board_id: UUID,
    session: AsyncSession = Depends(get_session),
    _actor: Any = Depends(require_admin_or_agent),
) -> dict[str, str | None]:
    """Get architectural context for a project."""
    board = await session.get(Board, board_id)
    if not board:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    return {
        "name": board.name,
        "description": board.description,
        "project_context": board.project_context,
        "claude_context": board.claude_context,
        "gemini_context": board.gemini_context,
    }
