"""Telegram and Discord notification helpers for board events."""

from __future__ import annotations

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

TELEGRAM_API = "https://api.telegram.org/bot{token}/{method}"
DISCORD_API = "https://discord.com/api/v10"


async def send_telegram_message(
    text: str,
    *,
    inline_buttons: list[tuple[str, str]] | None = None,
) -> bool:
    """Send a Telegram DM to the configured chat_id.

    inline_buttons is a list of (label, callback_data) pairs rendered as a single row.
    """
    token = settings.telegram_bot_token
    chat_id = settings.telegram_chat_id
    if not token or not chat_id:
        logger.debug("notifications.telegram.skipped: not configured")
        return False

    payload: dict[str, object] = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
    if inline_buttons:
        payload["reply_markup"] = {
            "inline_keyboard": [
                [{"text": label, "callback_data": data} for label, data in inline_buttons]
            ]
        }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            url = TELEGRAM_API.format(token=token, method="sendMessage")
            resp = await client.post(url, json=payload)
            if not resp.is_success:
                logger.warning(
                    "notifications.telegram.error status=%s body=%s",
                    resp.status_code,
                    resp.text[:200],
                )
                return False
        return True
    except Exception as exc:
        logger.warning("notifications.telegram.exception error=%s", exc)
        return False


async def _get_or_create_discord_dm_channel(
    client: httpx.AsyncClient,
    user_id: str,
    token: str,
) -> str | None:
    """Create (or retrieve) a DM channel with the given Discord user."""
    resp = await client.post(
        f"{DISCORD_API}/users/@me/channels",
        json={"recipient_id": user_id},
        headers={"Authorization": f"Bot {token}"},
    )
    if not resp.is_success:
        logger.warning(
            "notifications.discord.dm_channel_error status=%s body=%s",
            resp.status_code,
            resp.text[:200],
        )
        return None
    return str(resp.json().get("id", ""))


async def send_discord_message(text: str) -> bool:
    """Send a Discord DM to the configured user."""
    token = settings.discord_bot_token
    user_id = settings.discord_user_id
    if not token or not user_id:
        logger.debug("notifications.discord.skipped: not configured")
        return False

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            channel_id = await _get_or_create_discord_dm_channel(client, user_id, token)
            if not channel_id:
                return False
            resp = await client.post(
                f"{DISCORD_API}/channels/{channel_id}/messages",
                json={"content": text},
                headers={"Authorization": f"Bot {token}"},
            )
            if not resp.is_success:
                logger.warning(
                    "notifications.discord.send_error status=%s body=%s",
                    resp.status_code,
                    resp.text[:200],
                )
                return False
        return True
    except Exception as exc:
        logger.warning("notifications.discord.exception error=%s", exc)
        return False


async def notify_approval(
    *,
    board_name: str,
    task_title: str,
    approval_id: str,
    action_type: str,
    channel: str | None,
) -> None:
    """Send an approval notification with inline buttons (Telegram) or text (Discord)."""
    if not channel:
        return

    telegram_text = (
        f"<b>⚠️ Approval needed — {board_name}</b>\n"
        f"Task: {task_title}\n"
        f"Action: {action_type}"
    )
    discord_text = (
        f"**⚠️ Approval needed — {board_name}**\n"
        f"Task: {task_title}\n"
        f"Action: {action_type}\n"
        f"Reply: `approve {approval_id}` or `reject {approval_id}`"
    )
    buttons: list[tuple[str, str]] = [
        ("✅ Approve", f"approve:{approval_id}"),
        ("❌ Reject", f"reject:{approval_id}"),
    ]

    if channel in ("telegram", "both"):
        await send_telegram_message(telegram_text, inline_buttons=buttons)
    if channel in ("discord", "both"):
        await send_discord_message(discord_text)


async def notify_task_status(
    *,
    board_name: str,
    task_title: str,
    new_status: str,
    channel: str | None,
) -> None:
    """Send a task status change notification (done or blocked only)."""
    if not channel:
        return
    emoji = "✅" if new_status == "done" else "🚫"
    telegram_text = (
        f"{emoji} <b>{board_name}</b>: " f"Task <i>{task_title}</i> → <b>{new_status}</b>"
    )
    discord_text = f"{emoji} **{board_name}**: Task *{task_title}* → **{new_status}**"

    if channel in ("telegram", "both"):
        await send_telegram_message(telegram_text)
    if channel in ("discord", "both"):
        await send_discord_message(discord_text)
