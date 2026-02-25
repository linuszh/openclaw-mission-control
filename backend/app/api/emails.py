"""API router for email accounts and synced messages."""

from __future__ import annotations

import asyncio
import smtplib
from datetime import UTC, datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, status
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import ORG_MEMBER_DEP, SESSION_DEP
from app.core.logging import get_logger
from app.db.pagination import paginate
from app.models.agents import Agent
from app.models.boards import Board
from app.models.email import EmailAccount, EmailMessage
from app.models.tasks import Task
from app.schemas.email import (
    EmailAccountCreate,
    EmailAccountRead,
    EmailConvertRequest,
    EmailMessageRead,
    EmailSendRequest,
    EmailSummarizeResponse,
    EmailUpdateRequest,
)
from app.schemas.pagination import DefaultLimitOffsetPage
from app.schemas.tasks import TaskRead
from app.services.activity_log import record_activity
from app.services.email_sync import enqueue_email_sync
from app.services.openclaw.gateway_dispatch import GatewayDispatchService
from app.services.organizations import OrganizationContext

router = APIRouter(prefix="/emails", tags=["emails"])
logger = get_logger(__name__)


def _smtp_send(account: EmailAccount, to: str, subject: str, body: str) -> None:
    """Send an email via SMTP using the account's credentials (blocking)."""
    msg = MIMEMultipart("alternative")
    msg["From"] = account.email_address
    msg["To"] = to
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))

    smtp_server = account.smtp_server or account.imap_server
    smtp_port = account.smtp_port or 587
    use_ssl = account.smtp_use_ssl

    # Port 465 = implicit TLS (SMTP_SSL), port 587 = explicit TLS (STARTTLS)
    if smtp_port == 465:
        with smtplib.SMTP_SSL(smtp_server, smtp_port) as server:
            server.login(account.imap_username, account.imap_password)
            server.sendmail(account.email_address, to, msg.as_string())
    else:
        # Default: SMTP with STARTTLS (works for port 587 and others)
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            if use_ssl:
                server.starttls()
            server.login(account.imap_username, account.imap_password)
            server.sendmail(account.email_address, to, msg.as_string())


@router.post("/accounts", response_model=EmailAccountRead)
async def create_account(
    payload: EmailAccountCreate,
    ctx: OrganizationContext = ORG_MEMBER_DEP,
    session: AsyncSession = SESSION_DEP,
) -> EmailAccount:
    """Create a new email sync account."""
    account = EmailAccount(
        organization_id=ctx.organization.id,
        **payload.model_dump(),
    )
    session.add(account)
    await session.commit()
    await session.refresh(account)

    # Trigger an immediate sync for the new account
    enqueue_email_sync()

    return account


@router.delete("/accounts/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    account_id: UUID,
    ctx: OrganizationContext = ORG_MEMBER_DEP,
    session: AsyncSession = SESSION_DEP,
) -> None:
    """Delete an email sync account and all its synced messages."""
    account = await session.get(EmailAccount, account_id)
    if not account or account.organization_id != ctx.organization.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Email account not found",
        )

    # Delete related messages first (cascading)
    statement = select(EmailMessage).where(EmailMessage.email_account_id == account.id)
    result = await session.exec(statement)
    messages = result.all()
    for msg in messages:
        await session.delete(msg)

    await session.delete(account)
    await session.commit()


@router.get("/accounts", response_model=list[EmailAccountRead])
async def list_accounts(
    ctx: OrganizationContext = ORG_MEMBER_DEP,
    session: AsyncSession = SESSION_DEP,
) -> list[EmailAccount]:
    """List all email sync accounts for the current organization."""
    statement = select(EmailAccount).where(EmailAccount.organization_id == ctx.organization.id)
    result = await session.exec(statement)
    return list(result.all())


@router.get("/", response_model=DefaultLimitOffsetPage[EmailMessageRead])
async def list_emails(
    ctx: OrganizationContext = ORG_MEMBER_DEP,
    session: AsyncSession = SESSION_DEP,
) -> Any:
    """List all synced emails for the current organization (excludes archived)."""
    statement = (
        select(EmailMessage)
        .where(
            col(EmailMessage.organization_id) == ctx.organization.id,
            col(EmailMessage.status) != "archived",
            col(EmailMessage.status) != "deleted",
        )
        .order_by(col(EmailMessage.received_at).desc())
    )
    return await paginate(session, statement)


@router.get("/sent", response_model=DefaultLimitOffsetPage[EmailMessageRead])
async def list_sent_emails(
    ctx: OrganizationContext = ORG_MEMBER_DEP,
    session: AsyncSession = SESSION_DEP,
) -> Any:
    """List all emails sent by agents for the current organization."""
    statement = (
        select(EmailMessage)
        .where(
            col(EmailMessage.organization_id) == ctx.organization.id,
            col(EmailMessage.direction) == "sent",
        )
        .order_by(col(EmailMessage.received_at).desc())
    )
    return await paginate(session, statement)


@router.post("/send", response_model=EmailMessageRead)
async def send_email(
    payload: EmailSendRequest,
    ctx: OrganizationContext = ORG_MEMBER_DEP,
    session: AsyncSession = SESSION_DEP,
) -> EmailMessage:
    """Send an outbound email from the org's first configured account and record it."""
    statement = select(EmailAccount).where(EmailAccount.organization_id == ctx.organization.id)
    result = await session.exec(statement)
    account = result.first()
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No email account configured for this organization.",
        )
    try:
        await asyncio.to_thread(_smtp_send, account, payload.to, payload.subject, payload.body)
    except Exception as exc:
        logger.warning("email.send.smtp_failed to=%s error=%s", payload.to, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to send email: {exc}",
        )
    sent_msg = EmailMessage(
        organization_id=ctx.organization.id,
        email_account_id=account.id,
        uid=f"sent-{uuid4()}",
        sender=account.email_address,
        subject=payload.subject,
        snippet=payload.body[:200],
        body=payload.body,
        status="sent",
        direction="sent",
        received_at=datetime.now(UTC),
    )
    session.add(sent_msg)
    await session.commit()
    await session.refresh(sent_msg)
    return sent_msg


@router.patch("/{email_id}", response_model=EmailMessageRead)
async def update_email(
    email_id: UUID,
    payload: EmailUpdateRequest,
    ctx: OrganizationContext = ORG_MEMBER_DEP,
    session: AsyncSession = SESSION_DEP,
) -> EmailMessage:
    """Update an email message (e.g. archive it by setting status to 'archived')."""
    email_msg = await session.get(EmailMessage, email_id)
    if not email_msg or email_msg.organization_id != ctx.organization.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Email message not found",
        )
    if email_msg.status == "deleted":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Email message not found",
        )
    email_msg.status = payload.status
    session.add(email_msg)
    await session.commit()
    await session.refresh(email_msg)
    return email_msg


@router.delete("/{email_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_email(
    email_id: UUID,
    ctx: OrganizationContext = ORG_MEMBER_DEP,
    session: AsyncSession = SESSION_DEP,
) -> None:
    """Soft-delete a single email message (sets status to 'deleted', preserving IMAP UID tracking)."""
    email_msg = await session.get(EmailMessage, email_id)
    if not email_msg or email_msg.organization_id != ctx.organization.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Email message not found",
        )
    email_msg.status = "deleted"
    session.add(email_msg)
    await session.commit()


@router.get("/{email_id}", response_model=EmailMessageRead)
async def get_email(
    email_id: UUID,
    ctx: OrganizationContext = ORG_MEMBER_DEP,
    session: AsyncSession = SESSION_DEP,
) -> EmailMessage:
    """Retrieve a specific email message by ID."""
    email_msg = await session.get(EmailMessage, email_id)
    if not email_msg or email_msg.organization_id != ctx.organization.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Email message not found",
        )
    if email_msg.status == "deleted":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Email message not found",
        )
    return email_msg


@router.post("/{email_id}/convert", response_model=TaskRead)
async def convert_email_to_task(
    email_id: UUID,
    payload: EmailConvertRequest,
    ctx: OrganizationContext = ORG_MEMBER_DEP,
    session: AsyncSession = SESSION_DEP,
) -> Task:
    """Convert a synced email into a task on the specified board."""
    email_msg = await session.get(EmailMessage, email_id)
    if not email_msg or email_msg.organization_id != ctx.organization.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Email message not found",
        )
    if email_msg.status == "deleted":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Email message not found",
        )

    board = await session.get(Board, payload.board_id)
    if not board or board.organization_id != ctx.organization.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Board not found",
        )

    title = payload.title or email_msg.subject
    description = payload.description or f"From: {email_msg.sender}\n\n{email_msg.body or ''}"

    task = Task(
        board_id=board.id,
        title=title,
        description=description,
        status="inbox",
    )
    session.add(task)
    await session.flush()
    await session.commit()
    await session.refresh(task)

    record_activity(
        session,
        event_type="task.created",
        task_id=task.id,
        message=f"Task created from email: {task.title}.",
    )
    await session.commit()

    return task


@router.post("/{email_id}/summarize", response_model=EmailSummarizeResponse)
async def summarize_email(
    email_id: UUID,
    ctx: OrganizationContext = ORG_MEMBER_DEP,
    session: AsyncSession = SESSION_DEP,
) -> EmailSummarizeResponse:
    """Dispatch an AI summary request for an email to the Gatekeeper agent."""
    email_msg = await session.get(EmailMessage, email_id)
    if not email_msg or email_msg.organization_id != ctx.organization.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Email message not found",
        )
    if email_msg.status == "deleted":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Email message not found",
        )

    # Find the Gatekeeper (main) agent
    gatekeeper = await Agent.objects.by_id("main").first(session)
    if gatekeeper is None or not gatekeeper.openclaw_session_id:
        logger.warning("email.summarize.no_gatekeeper email_id=%s", email_id)
        return EmailSummarizeResponse(dispatched=False)

    # Find any board in this org that has a gateway configured
    board_result = await session.exec(
        select(Board)
        .where(
            col(Board.organization_id) == ctx.organization.id,
            col(Board.gateway_id).is_not(None),
        )
        .limit(1)
    )
    board = board_result.first()
    if board is None:
        logger.warning("email.summarize.no_gateway_board email_id=%s", email_id)
        return EmailSummarizeResponse(dispatched=False)

    dispatch = GatewayDispatchService(session)
    config = await dispatch.optional_gateway_config_for_board(board)
    if config is None:
        return EmailSummarizeResponse(dispatched=False)

    message = (
        f"Please summarize this email:\n\n"
        f"From: {email_msg.sender}\n"
        f"Subject: {email_msg.subject}\n\n"
        f"{email_msg.body or ''}"
    )

    error = await dispatch.try_send_agent_message(
        session_key=gatekeeper.openclaw_session_id,
        config=config,
        agent_name=gatekeeper.name,
        message=message,
        deliver=False,
    )

    if error is not None:
        logger.warning("email.summarize.dispatch_failed email_id=%s error=%s", email_id, error)
        return EmailSummarizeResponse(dispatched=False)

    return EmailSummarizeResponse(dispatched=True)
