"""Bootstrap a default email account from environment settings on startup."""

from __future__ import annotations

from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.models.email import EmailAccount
from app.models.organizations import Organization
from app.services.email_sync import enqueue_email_sync

logger = get_logger(__name__)


async def bootstrap_default_email_account(session: AsyncSession) -> None:
    """Create a default email account if configured and not already present."""
    if not settings.default_email_address.strip():
        return

    # Load the first organization (single-tenant setup)
    result = await session.exec(select(Organization).limit(1))
    org = result.first()
    if org is None:
        logger.warning("email.bootstrap.no_organization")
        return

    # Check if the account already exists
    existing_result = await session.exec(
        select(EmailAccount).where(
            col(EmailAccount.organization_id) == org.id,
            col(EmailAccount.email_address) == settings.default_email_address,
        )
    )
    if existing_result.first() is not None:
        logger.info(
            "email.bootstrap.skipped address=%s", settings.default_email_address
        )
        return

    account = EmailAccount(
        organization_id=org.id,
        email_address=settings.default_email_address,
        imap_server=settings.default_imap_server,
        imap_port=settings.default_imap_port,
        imap_username=settings.default_email_address,
        imap_password=settings.default_email_password,
        use_ssl=settings.default_imap_use_ssl,
    )
    session.add(account)
    await session.commit()

    try:
        enqueue_email_sync()
    except Exception:
        logger.warning("email.bootstrap.enqueue_failed address=%s", settings.default_email_address)

    logger.info("email.bootstrap.created address=%s", settings.default_email_address)
