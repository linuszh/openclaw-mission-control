"""Email synchronization service for fetching messages from IMAP accounts."""

from __future__ import annotations

import asyncio
import email
import email.utils
import imaplib
from datetime import UTC, datetime
from email.header import decode_header
from typing import Any

from sqlmodel import select

from app.core.config import settings
from app.core.logging import get_logger
from app.db.session import async_session_maker
from app.models.email import EmailAccount, EmailMessage
from app.services.queue import QueuedTask, enqueue_task
from app.services.openclaw.gateway_dispatch import GatewayDispatchService
from app.models.agents import Agent

logger = get_logger(__name__)

TASK_TYPE = "email_sync"


async def sync_all_accounts_task(_task: QueuedTask) -> None:
    """RQ task handler to sync all email accounts."""
    logger.info("email.sync.start")
    try:
        async with async_session_maker() as session:
            statement = select(EmailAccount)
            accounts_result = await session.exec(statement)
            accounts = accounts_result.all()
            for account in accounts:
                try:
                    await sync_single_account(session, account)
                except Exception as exc:
                    logger.error(
                        "email.sync.account_failed",
                        extra={"account_id": str(account.id), "error": str(exc)},
                    )
            await session.commit()
            # Schedule next periodic sync
            enqueue_email_sync(delay_seconds=300)
    except Exception as exc:
        logger.error("email.sync.failed", extra={"error": str(exc)})
        raise


def enqueue_email_sync(delay_seconds: float = 0) -> bool:
    """Enqueue the email sync task."""
    task = QueuedTask(
        task_type=TASK_TYPE,
        payload={},
        created_at=datetime.now(UTC),
    )
    from app.services.queue import _schedule_for_later

    if delay_seconds > 0:
        return _schedule_for_later(task, settings.rq_queue_name, delay_seconds)
    return enqueue_task(task, settings.rq_queue_name)


async def sync_single_account(session: Any, account: EmailAccount) -> None:
    """Sync a single IMAP account."""
    statement = select(EmailMessage.uid).where(EmailMessage.email_account_id == account.id)
    existing_uids_result = await session.exec(statement)
    existing_uids = set(existing_uids_result.all())

    # Perform blocking IMAP operations in a thread to avoid blocking the event loop.
    new_messages_data = await asyncio.to_thread(_fetch_imap_messages, account, existing_uids)

    for msg_data in new_messages_data:
        email_message = EmailMessage(
            organization_id=account.organization_id,
            email_account_id=account.id,
            uid=msg_data["uid"],
            sender=msg_data["sender"],
            subject=msg_data["subject"],
            snippet=msg_data["snippet"],
            body=msg_data["body"],
            status="unread",
            received_at=msg_data["received_at"],
        )
        session.add(email_message)
        logger.debug(
            "email.sync.message_synced",
            extra={"uid": msg_data["uid"], "account_id": str(account.id)},
        )
        
        # Notify the Gatekeeper about new emails
        await _notify_gatekeeper_on_new_email(session, email_message)


async def _notify_gatekeeper_on_new_email(session: Any, email_message: EmailMessage) -> None:
    """Relay a new email summary to the board lead acting as gatekeeper."""
    from app.models.boards import Board
    from sqlmodel import col

    # Find any board lead with an active session in this organization.
    board_result = await session.exec(
        select(Board).where(Board.organization_id == email_message.organization_id)
    )
    board = board_result.first()
    if not board:
        return

    gatekeeper_result = await session.exec(
        select(Agent).where(
            col(Agent.board_id) == board.id,
            col(Agent.is_board_lead).is_(True),
            col(Agent.openclaw_session_id).isnot(None),
        )
    )
    gatekeeper = gatekeeper_result.first()
    if not gatekeeper or not gatekeeper.openclaw_session_id:
        return

    dispatch = GatewayDispatchService(session)

    config = await dispatch.optional_gateway_config_for_board(board)
    if not config:
        return

    message = (
        f"📩 NEW EMAIL RECEIVED\n\n"
        f"From: {email_message.sender}\n"
        f"Subject: {email_message.subject}\n\n"
        f"{email_message.snippet}...\n\n"
        f"Instruction: Gatekeeper, please triage this email and summarize it for Linus on Telegram. "
        f"If action is required, ask him if I should create a task."
    )

    await dispatch.try_send_agent_message(
        session_key=gatekeeper.openclaw_session_id,
        config=config,
        agent_name=gatekeeper.name,
        message=message,
        deliver=False,
    )


def _fetch_imap_messages(account: EmailAccount, existing_uids: set[str]) -> list[dict[str, Any]]:
    """Blocking IMAP fetch logic."""
    new_messages = []
    if account.use_ssl:
        mail = imaplib.IMAP4_SSL(account.imap_server, account.imap_port)
    else:
        mail = imaplib.IMAP4(account.imap_server, account.imap_port)

    try:
        mail.login(account.imap_username, account.imap_password)
        mail.select("INBOX")

        _, data = mail.uid("search", None, "ALL")
        if not data or not data[0]:
            return []

        uids = data[0].split()
        for uid_bytes in uids:
            uid = uid_bytes.decode()
            if uid in existing_uids:
                continue

            _, msg_data = mail.uid("fetch", uid, "(RFC822)")
            if not msg_data or not msg_data[0]:
                continue

            raw_email = msg_data[0][1]
            if not isinstance(raw_email, (bytes, str)):
                continue

            if isinstance(raw_email, str):
                msg = email.message_from_string(raw_email)
            else:
                msg = email.message_from_bytes(raw_email)

            subject = _decode_header(msg.get("Subject", ""))
            sender = _decode_header(msg.get("From", ""))
            body = _get_body(msg)
            snippet = body[:200] if body else ""

            date_str = msg.get("Date")
            received_at = datetime.now(UTC)
            if date_str:
                try:
                    parsed_date = email.utils.parsedate_to_datetime(date_str)
                    if parsed_date:
                        received_at = parsed_date
                except (ValueError, TypeError):
                    pass

            new_messages.append(
                {
                    "uid": uid,
                    "sender": sender,
                    "subject": subject,
                    "body": body,
                    "snippet": snippet,
                    "received_at": received_at,
                },
            )
    finally:
        try:
            mail.logout()
        except Exception:
            pass

    return new_messages


def _decode_header(header_value: str | None) -> str:
    if not header_value:
        return ""
    try:
        decoded = decode_header(header_value)
        parts = []
        for content, charset in decoded:
            if isinstance(content, bytes):
                parts.append(content.decode(charset or "utf-8", errors="replace"))
            else:
                parts.append(content)
        return "".join(parts)
    except Exception:
        return str(header_value)


def _get_body(msg: email.message.Message) -> str:
    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            content_disposition = str(part.get("Content-Disposition"))
            if content_type == "text/plain" and "attachment" not in content_disposition:
                payload = part.get_payload(decode=True)
                if payload:
                    return payload.decode(errors="replace")
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            return payload.decode(errors="replace")
    return ""
