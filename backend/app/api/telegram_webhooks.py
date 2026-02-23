"""Telegram webhook endpoint for handling approval/rejection button callbacks."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db.session import get_session
from app.models.approvals import Approval
from app.models.boards import Board
from app.api.approvals import update_approval
from app.schemas.approvals import ApprovalUpdate
from app.core.logging import get_logger

router = APIRouter(prefix="/webhooks/telegram", tags=["webhooks"])
logger = get_logger(__name__)


@router.post("")
async def telegram_webhook(
    payload: dict[str, Any],
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    """Handle Telegram bot callbacks for approval actions."""
    # Note: In production, verify the request with a secret token
    # or by checking Telegram's source IP addresses.

    callback_query = payload.get("callback_query")
    if not callback_query:
        return {"status": "ignored"}

    data = callback_query.get("data", "")
    if not data or ":" not in data:
        return {"status": "invalid_data"}

    action, approval_id_str = data.split(":", 1)
    try:
        approval_id = UUID(approval_id_str)
    except ValueError:
        return {"status": "invalid_id"}

    approval = await session.get(Approval, approval_id)
    if not approval:
        return {"status": "not_found"}

    if approval.status != "pending":
        return {"status": "already_resolved"}

    board = await session.get(Board, approval.board_id)
    if not board:
        return {"status": "board_not_found"}

    new_status = "approved" if action == "approve" else "rejected"
    
    # We call the existing update_approval logic to ensure consistency
    # (side-effects like notifying leads, recording activity, etc.)
    await update_approval(
        approval_id=str(approval_id),
        payload=ApprovalUpdate(status=new_status),
        board=board,
        session=session,
    )

    return {"status": "ok", "action": action}
