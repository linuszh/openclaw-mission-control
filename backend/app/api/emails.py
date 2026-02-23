"""API router for email accounts and synced messages."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi_pagination import Page
from fastapi_pagination.ext.sqlmodel import paginate
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import ORG_MEMBER_DEP, SESSION_DEP
from app.models.email import EmailAccount, EmailMessage
from app.schemas.email import EmailAccountCreate, EmailAccountRead, EmailMessageRead
from app.services.organizations import OrganizationContext
from app.services.email_sync import enqueue_email_sync

router = APIRouter(prefix="/emails", tags=["emails"])


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


@router.get("/", response_model=Page[EmailMessageRead])
async def list_emails(
    ctx: OrganizationContext = ORG_MEMBER_DEP,
    session: AsyncSession = SESSION_DEP,
) -> Any:
    """List all synced emails for the current organization."""
    statement = (
        select(EmailMessage)
        .where(EmailMessage.organization_id == ctx.organization.id)
        .order_by(EmailMessage.received_at.desc())
    )
    return await paginate(session, statement)


@router.get("/accounts", response_model=list[EmailAccountRead])
async def list_accounts(
    ctx: OrganizationContext = ORG_MEMBER_DEP,
    session: AsyncSession = SESSION_DEP,
) -> list[EmailAccount]:
    """List all email sync accounts for the current organization."""
    statement = select(EmailAccount).where(EmailAccount.organization_id == ctx.organization.id)
    result = await session.exec(statement)
    return list(result.all())


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
    return email_msg


