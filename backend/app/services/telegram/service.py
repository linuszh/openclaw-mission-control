"""Telegram notification service for sending actionable approval requests."""

from __future__ import annotations

import hmac
import hashlib
from typing import TYPE_CHECKING
from uuid import UUID

import httpx

from app.core.config import settings
from app.core.logging import get_logger

if TYPE_CHECKING:
    from app.models.approvals import Approval
    from app.models.boards import Board

logger = get_logger(__name__)

TELEGRAM_API_URL = "https://api.telegram.org/bot{token}/{method}"


class TelegramService:
    """Service for interacting with the Telegram Bot API."""

    def __init__(self, bot_token: str | None = None, chat_id: str | None = None):
        self.bot_token = bot_token or settings.telegram_bot_token
        self.chat_id = chat_id or settings.telegram_chat_id
        self.client = httpx.AsyncClient(timeout=10.0)

    async def send_approval_request(
        self,
        board: Board,
        approval: Approval,
        task_titles: list[str],
    ) -> bool:
        """Send an actionable approval request message to Telegram."""
        if not self.bot_token or not self.chat_id:
            logger.warning("telegram.send_skipped reason=missing_config")
            return False

        task_info = f"
**Tasks:** {', '.join(task_titles)}" if task_titles else ""
        text = (
            f"🚨 **Approval Required**

"
            f"**Board:** {board.name}
"
            f"**Action:** {approval.action_type}
"
            f"**Confidence:** {approval.confidence}{task_info}

"
            f"**Payload:**
`{approval.payload}`"
        )

        inline_keyboard = {
            "inline_keyboard": [
                [
                    {
                        "text": "✅ Approve",
                        "callback_data": f"approve:{approval.id}",
                    },
                    {
                        "text": "❌ Reject",
                        "callback_data": f"reject:{approval.id}",
                    },
                ]
            ]
        }

        try:
            url = TELEGRAM_API_URL.format(token=self.bot_token, method="sendMessage")
            response = await self.client.post(
                url,
                json={
                    "chat_id": self.chat_id,
                    "text": text,
                    "parse_mode": "Markdown",
                    "reply_markup": inline_keyboard,
                },
            )
            response.raise_for_status()
            return True
        except Exception:
            logger.exception("telegram.send_failed approval_id=%s", approval.id)
            return False
        finally:
            await self.client.aclose()

    @staticmethod
    def verify_webhook_signature(payload: str, signature: str, secret: str) -> bool:
        """Verify that the webhook request came from Telegram (optional/custom)."""
        # Note: Telegram usually doesn't sign webhooks with a secret like GitHub.
        # Instead, we verify the bot token in the URL or use a secret token.
        return hmac.compare_digest(
            hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest(),
            signature,
        )
