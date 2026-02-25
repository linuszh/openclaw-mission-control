# Email Improvements & Board Notifications Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix email archive persistence, add agent outbound email + Sent tab, add per-board Telegram/Discord notifications (with Telegram inline-button approvals), and teach the Gatekeeper agent to resolve approvals from Telegram button taps.

**Architecture:** Three independent backend slices (email fix, outbound email, notifications) plus frontend additions. Notifications route via direct HTTP to Telegram Bot API + Discord REST API using existing bot tokens. The Gatekeeper SOUL is updated to parse Telegram callback payloads and call the Mission Control approvals API.

**Tech Stack:** FastAPI, SQLModel/Alembic, smtplib, httpx (already in deps), Next.js App Router, TanStack Query, Orval-generated client.

---

## Task 1: Email soft-delete fix

**Files:**
- Modify: `backend/app/api/emails.py`

**Step 1: Write the failing test**

```python
# backend/tests/test_emails.py  (add to existing test file or create)
async def test_delete_email_does_not_remove_db_record(client, email_message):
    resp = await client.delete(f"/api/v1/emails/{email_message.id}")
    assert resp.status_code == 204
    # record must still exist, just marked deleted
    resp2 = await client.get(f"/api/v1/emails/{email_message.id}")
    # should 404 from list but GET by id should still resolve OR
    # verify via DB directly: status == "deleted"
```

**Step 2: Run test to verify it fails**

```bash
cd backend && uv run pytest tests/ -k "test_delete_email_does_not" -v
```
Expected: FAIL (currently does hard delete)

**Step 3: Implement soft-delete**

In `backend/app/api/emails.py`, replace the `delete_email` endpoint body:

```python
@router.delete("/{email_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_email(
    email_id: UUID,
    ctx: OrganizationContext = ORG_MEMBER_DEP,
    session: AsyncSession = SESSION_DEP,
) -> None:
    """Soft-delete a single email message (prevents IMAP re-sync)."""
    email_msg = await session.get(EmailMessage, email_id)
    if not email_msg or email_msg.organization_id != ctx.organization.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Email message not found",
        )
    email_msg.status = "deleted"
    session.add(email_msg)
    await session.commit()
```

Also update `list_emails` to filter out "deleted":

```python
statement = (
    select(EmailMessage)
    .where(
        col(EmailMessage.organization_id) == ctx.organization.id,
        col(EmailMessage.status) != "archived",
        col(EmailMessage.status) != "deleted",
    )
    .order_by(col(EmailMessage.received_at).desc())
)
```

**Step 4: Run tests**
```bash
cd backend && uv run pytest tests/ -k "email" -v
make backend-typecheck
```

**Step 5: Commit**
```bash
git add backend/app/api/emails.py
git commit -m "fix: soft-delete emails to prevent IMAP re-sync on next cycle"
```

---

## Task 2: SMTP fields + `direction` field on EmailMessage

**Files:**
- Modify: `backend/app/models/email.py`
- Modify: `backend/app/schemas/email.py`
- Create: `backend/migrations/versions/<hash>_add_smtp_and_direction_to_email.py`

**Step 1: Update EmailAccount model**

Add to `EmailAccount` in `backend/app/models/email.py`:

```python
# SMTP outbound (optional — defaults to IMAP server values if blank)
smtp_server: str = Field(default="")
smtp_port: int = Field(default=587)
smtp_use_ssl: bool = Field(default=True)
```

Add `direction` field to `EmailMessage`:

```python
direction: str = Field(default="received", index=True)  # "received" | "sent"
```

**Step 2: Update schemas**

In `backend/app/schemas/email.py`:

Add `smtp_server`, `smtp_port`, `smtp_use_ssl` to `EmailAccountCreate` and `EmailAccountRead`:

```python
class EmailAccountCreate(BaseModel):
    email_address: str
    imap_server: str
    imap_port: int
    imap_username: str
    imap_password: str
    use_ssl: bool = True
    smtp_server: str = ""
    smtp_port: int = 587
    smtp_use_ssl: bool = True

class EmailAccountRead(BaseModel):
    id: UUID
    organization_id: UUID
    email_address: str
    imap_server: str
    imap_port: int
    use_ssl: bool
    smtp_server: str
    smtp_port: int
    smtp_use_ssl: bool
    created_at: datetime
    updated_at: datetime
```

Add `direction` to `EmailMessageRead`:

```python
class EmailMessageRead(BaseModel):
    ...
    direction: str   # "received" | "sent"
    ...
```

Add new schema for the sent-email list and agent send request:

```python
class EmailSendRequest(BaseModel):
    """Payload for agents to send an outbound email."""
    to: str
    subject: str
    body: str
```

**Step 3: Generate migration**

```bash
cd backend && uv run alembic revision --autogenerate \
  -m "add_smtp_and_direction_to_email"
```

Open the generated file and verify the upgrade() adds:
- `smtp_server VARCHAR NOT NULL DEFAULT ''`
- `smtp_port INTEGER NOT NULL DEFAULT 587`
- `smtp_use_ssl BOOLEAN NOT NULL DEFAULT TRUE`
- `direction VARCHAR NOT NULL DEFAULT 'received'`

**Step 4: Apply migration**

```bash
uv run alembic upgrade head
```

**Step 5: Typecheck**

```bash
make backend-typecheck
```

**Step 6: Commit**
```bash
git add backend/app/models/email.py backend/app/schemas/email.py \
  backend/migrations/versions/*smtp_and_direction*
git commit -m "feat: add SMTP config + direction field to email models"
```

---

## Task 3: Agent outbound email endpoint + Sent list endpoint

**Files:**
- Modify: `backend/app/api/emails.py`

**Step 1: Add SMTP send helper**

Add this function near the top of `backend/app/api/emails.py` (after imports):

```python
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


def _smtp_send(account: EmailAccount, to: str, subject: str, body: str) -> None:
    """Send an email via SMTP using the account's credentials."""
    msg = MIMEMultipart("alternative")
    msg["From"] = account.email_address
    msg["To"] = to
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))

    smtp_server = account.smtp_server or account.imap_server
    smtp_port = account.smtp_port or 587
    use_ssl = account.smtp_use_ssl

    if use_ssl and smtp_port == 465:
        with smtplib.SMTP_SSL(smtp_server, smtp_port) as server:
            server.login(account.imap_username, account.imap_password)
            server.sendmail(account.email_address, to, msg.as_string())
    else:
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(account.imap_username, account.imap_password)
            server.sendmail(account.email_address, to, msg.as_string())
```

**Step 2: Add the agent send endpoint**

Add these imports to the top of `backend/app/api/emails.py`:

```python
from app.api.deps import AGENT_DEP, AgentContext  # check exact dep names in deps.py
from app.schemas.email import EmailSendRequest
```

Then add the endpoint:

```python
@router.post("/send", response_model=EmailMessageRead)
async def agent_send_email(
    payload: EmailSendRequest,
    ctx: OrganizationContext = ORG_MEMBER_DEP,
    session: AsyncSession = SESSION_DEP,
) -> EmailMessage:
    """Send an outbound email from the org's first configured account."""
    statement = select(EmailAccount).where(
        EmailAccount.organization_id == ctx.organization.id
    )
    result = await session.exec(statement)
    account = result.first()
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No email account configured for this organization.",
        )
    await asyncio.to_thread(
        _smtp_send, account, payload.to, payload.subject, payload.body
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
```

Also add the import `from datetime import UTC, datetime` and `from uuid import UUID, uuid4` if not already present.

**Step 3: Add the Sent list endpoint**

```python
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
```

**Note on route ordering:** The `/send` and `/sent` GET routes must be registered BEFORE `/{email_id}` to avoid FastAPI treating "send"/"sent" as a UUID parameter. Check current route order in the file and move accordingly.

**Step 4: Typecheck + run tests**

```bash
cd backend && make backend-typecheck && make backend-test
```

**Step 5: Commit**
```bash
git add backend/app/api/emails.py
git commit -m "feat: add agent outbound email send endpoint + sent list"
```

---

## Task 4: Regenerate frontend API client + add Sent tab to Inbox

**Files:**
- Modify: `frontend/src/app/inbox/page.tsx`

**Step 1: Regenerate API client**

The backend must be running:
```bash
# In one terminal: cd backend && uv run uvicorn app.main:app --reload --port 8000
cd frontend && npm run api-gen  # or: make api-gen from repo root
```

Verify the new hooks exist:
```bash
grep -r "useListSentEmailsApiV1EmailsSentGet\|useSendEmailApiV1EmailsSendPost" \
  frontend/src/api/generated/
```

**Step 2: Add Sent tab**

In `frontend/src/app/inbox/page.tsx`, add a new `SentTab` component alongside `EmailTab`:

```tsx
function SentTab() {
  const { data, isLoading } = useListSentEmailsApiV1EmailsSentGet({ limit: 50, offset: 0 });
  const emails = data?.items ?? [];

  if (isLoading) return <div className="py-12 text-center text-sm text-slate-400">Loading…</div>;
  if (emails.length === 0)
    return (
      <div className="flex flex-col items-center py-16 text-slate-400">
        <Send className="mb-3 h-10 w-10 opacity-40" />
        <p className="font-medium text-slate-600">No sent emails yet</p>
        <p className="mt-1 text-sm">Emails sent by your agents will appear here.</p>
      </div>
    );

  return (
    <div className="divide-y divide-slate-100">
      {emails.map((email) => (
        <div key={email.id} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50">
          <Send className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate text-sm font-medium text-slate-800">To: {email.sender}</p>
              <span className="shrink-0 text-xs text-slate-400">
                {new Date(email.received_at).toLocaleString()}
              </span>
            </div>
            <p className="truncate text-sm text-slate-600">{email.subject}</p>
            {email.snippet && (
              <p className="mt-0.5 truncate text-xs text-slate-400">{email.snippet}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

Add `"sent"` to the tabs list, add `<TabsContent value="sent"><SentTab /></TabsContent>`, and import `Send` from `lucide-react`.

**Step 3: Typecheck**
```bash
cd frontend && make frontend-typecheck
```

**Step 4: Commit**
```bash
git add frontend/src/app/inbox/page.tsx frontend/src/api/generated/
git commit -m "feat: add Sent tab to inbox showing agent-sent emails"
```

---

## Task 5: NotificationService — Telegram + Discord

**Files:**
- Modify: `backend/app/core/config.py`
- Create: `backend/app/services/notifications.py`

**Step 1: Add Discord env vars to Settings**

In `backend/app/core/config.py`, after the existing Telegram fields (lines 67–69):

```python
# Telegram Integration (bot token + chat ID already exist)
telegram_bot_token: str = ""
telegram_chat_id: str = ""

# Discord Integration
discord_bot_token: str = ""
discord_user_id: str = ""  # Discord user ID to DM (e.g. 248474868595687425)
```

**Step 2: Populate .env**

Add to `backend/.env`:
```
# Telegram (copy from /home/linus/.openclaw/openclaw.json → channels.telegram.botToken)
TELEGRAM_BOT_TOKEN=<your-telegram-bot-token>
TELEGRAM_CHAT_ID=<your-telegram-chat-id>

# Discord (copy from openclaw.json → channels.discord.accounts.private.token)
DISCORD_BOT_TOKEN=<your-discord-bot-token>
DISCORD_USER_ID=<your-discord-user-id>
```

**Step 3: Create NotificationService**

Create `backend/app/services/notifications.py`:

```python
"""Telegram and Discord notification helpers."""

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
    """Send a Telegram DM. inline_buttons is [(label, callback_data), ...]."""
    token = settings.telegram_bot_token
    chat_id = settings.telegram_chat_id
    if not token or not chat_id:
        logger.debug("notifications.telegram.skipped: not configured")
        return False

    payload: dict = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
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
    client: httpx.AsyncClient, user_id: str, token: str
) -> str | None:
    """Create (or retrieve) a DM channel with the given Discord user."""
    resp = await client.post(
        f"{DISCORD_API}/users/@me/channels",
        json={"recipient_id": user_id},
        headers={"Authorization": f"Bot {token}"},
    )
    if not resp.is_success:
        logger.warning("notifications.discord.dm_channel_error status=%s", resp.status_code)
        return None
    return resp.json().get("id")


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

    text = (
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
    buttons = [
        ("✅ Approve", f"approve:{approval_id}"),
        ("❌ Reject", f"reject:{approval_id}"),
    ]

    if channel in ("telegram", "both"):
        await send_telegram_message(text, inline_buttons=buttons)
    if channel in ("discord", "both"):
        await send_discord_message(discord_text)


async def notify_task_status(
    *,
    board_name: str,
    task_title: str,
    new_status: str,
    channel: str | None,
) -> None:
    """Send a task status change notification (done or blocked)."""
    if not channel:
        return
    emoji = "✅" if new_status == "done" else "🚫"
    text = f"{emoji} <b>{board_name}</b>: Task <i>{task_title}</i> → <b>{new_status}</b>"
    discord_text = f"{emoji} **{board_name}**: Task *{task_title}* → **{new_status}**"

    if channel in ("telegram", "both"):
        await send_telegram_message(text)
    if channel in ("discord", "both"):
        await send_discord_message(discord_text)
```

**Step 4: Typecheck**
```bash
cd backend && make backend-typecheck
```

**Step 5: Commit**
```bash
git add backend/app/core/config.py backend/app/services/notifications.py
git commit -m "feat: add NotificationService for Telegram + Discord board alerts"
```

---

## Task 6: Add `notification_channel` to Board model

**Files:**
- Modify: `backend/app/models/boards.py`
- Modify: `backend/app/schemas/boards.py` (wherever BoardCreate/BoardUpdate/BoardRead are defined)
- Create: migration

**Step 1: Add field to Board model**

In `backend/app/models/boards.py`, add after `default_model`:

```python
notification_channel: str | None = Field(default=None)  # "telegram" | "discord" | "both"
```

**Step 2: Add to board schemas**

Find `backend/app/schemas/boards.py` (or wherever `BoardCreate`, `BoardUpdate`, `BoardRead` live). Add:

```python
notification_channel: str | None = None
```
to `BoardCreate`, `BoardUpdate`, and `BoardRead`.

**Step 3: Generate + apply migration**

```bash
cd backend && uv run alembic revision --autogenerate \
  -m "add_notification_channel_to_boards"
uv run alembic upgrade head
```

**Step 4: Typecheck**
```bash
make backend-typecheck
```

**Step 5: Commit**
```bash
git add backend/app/models/boards.py backend/app/schemas/ \
  backend/migrations/versions/*notification_channel*
git commit -m "feat: add notification_channel field to Board model"
```

---

## Task 7: Hook notifications into approvals and tasks

**Files:**
- Modify: `backend/app/api/approvals.py`
- Modify: `backend/app/api/tasks.py`

**Step 1: Hook into approval creation**

In `backend/app/api/approvals.py`, add import:
```python
from app.services.notifications import notify_approval
```

In `create_approval`, after the existing `_notify_gatekeeper_on_pending_approval` call (around line 479), add:

```python
    if approval.status == "pending":
        await _notify_gatekeeper_on_pending_approval(...)
        # New: board-level channel notification
        task_title = task_titles[0] if task_titles else "unknown task"
        await notify_approval(
            board_name=board.name,
            task_title=task_title,
            approval_id=str(approval.id),
            action_type=approval.action_type or "approval",
            channel=board.notification_channel,
        )
```

**Step 2: Hook into task status changes**

In `backend/app/api/tasks.py`, add import:
```python
from app.services.notifications import notify_task_status
```

In the `_apply_task_update` function (or wherever `await session.commit()` is followed by activity recording, around line 2066), add after the commit:

```python
    await session.commit()
    await session.refresh(update.task)
    # New: board-level notification for done/blocked
    if (
        update.task.status != update.previous_status
        and update.task.status in ("done", "blocked")
    ):
        board = await session.get(Board, update.board_id)
        if board and board.notification_channel:
            await notify_task_status(
                board_name=board.name,
                task_title=update.task.title,
                new_status=update.task.status,
                channel=board.notification_channel,
            )
```

You'll need `from app.models.boards import Board` if not already imported.

**Step 3: Typecheck + tests**
```bash
cd backend && make backend-typecheck && make backend-test
```

**Step 4: Commit**
```bash
git add backend/app/api/approvals.py backend/app/api/tasks.py
git commit -m "feat: trigger Telegram/Discord notifications on approvals and task status"
```

---

## Task 8: Frontend — notification_channel dropdown in board forms

**Files:**
- Modify: `frontend/src/app/boards/new/page.tsx`
- Modify: `frontend/src/app/boards/[boardId]/page.tsx` (or wherever board edit form lives)

**Step 1: Regenerate API client** (picks up notification_channel on board schemas)
```bash
make api-gen
```

**Step 2: Add dropdown to Step 2 of new board wizard**

In `frontend/src/app/boards/new/page.tsx`, in the `ConfigureForm` component, add a `notification_channel` select after the existing fields:

```tsx
<div className="space-y-1.5">
  <label className="text-sm font-medium text-slate-700">Notifications</label>
  <select
    value={notificationChannel}
    onChange={(e) => setNotificationChannel(e.target.value)}
    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
  >
    <option value="">None</option>
    <option value="telegram">Telegram</option>
    <option value="discord">Discord</option>
    <option value="both">Telegram + Discord</option>
  </select>
  <p className="text-xs text-slate-400">
    Receive approval requests and done/blocked task alerts.
  </p>
</div>
```

Add `const [notificationChannel, setNotificationChannel] = useState("")` to state.

Pass `notification_channel: notificationChannel || undefined` in the `createBoard` mutation payload.

**Step 3: Add to board settings / edit form**

Find the board edit page (likely `frontend/src/app/boards/[boardId]/settings/page.tsx` or similar). Apply the same dropdown with the existing board's `notification_channel` as initial value.

**Step 4: Typecheck**
```bash
cd frontend && make frontend-typecheck
```

**Step 5: Commit**
```bash
git add frontend/src/app/boards/
git commit -m "feat: add notification channel selector to board creation and settings"
```

---

## Task 9: Gatekeeper SOUL update — handle Telegram approval callbacks

**Files:**
- Modify: `/home/linus/.openclaw/workspace-lead-1f562920-31bc-498f-b9d2-684a8ad05823/SOUL.md`
- Update DB: run Python snippet to sync `soul_template` on the Agent record

**Step 1: Update workspace SOUL.md**

Append the following section to the end of the file:

```markdown
## Telegram Approval Callbacks

When you receive a message that contains `approve:<uuid>` or `reject:<uuid>` (these come from
Telegram inline button taps routed through OpenClaw):

1. Extract the UUID from the message: the part after `approve:` or `reject:`.
2. Determine the outcome: `approved` if `approve:`, `rejected` if `reject:`.
3. Call the Mission Control approvals API:

```bash
curl -s -X PATCH \
  -H "X-Agent-Token: $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"status\": \"<approved|rejected>\"}" \
  "$BASE_URL/api/v1/boards/<board_id>/approvals/<uuid>"
```

**Finding the board_id:** The approval UUID is globally unique. To resolve the board,
first list recent approvals across known boards, or use the approval ID directly
on any board — Mission Control will return 404 if not found and you can try others.

Alternatively, parse the board_id from the Telegram notification message if it was included.

4. Confirm to Linus: "Approval <uuid> has been **<approved/rejected>**."

## Rules
- Always confirm back to the user what action was taken.
- If the approval is not found (404), reply: "Approval not found — it may have expired."
- If the PATCH fails, reply with the error.
```

**Step 2: Update the Agent `soul_template` in the DB**

The SOUL.md on disk is what the agent reads. To keep the DB in sync (so re-provisioning doesn't overwrite), run:

```bash
cd backend && uv run python3 - <<'EOF'
import asyncio
from app.db.session import async_session_maker
from app.models.agents import Agent
from sqlmodel import select
from uuid import UUID

AGENT_ID = UUID("8a349b8a-5bf7-4a0b-9180-3db2b858aba9")

async def update():
    async with async_session_maker() as session:
        agent = await session.get(Agent, AGENT_ID)
        if not agent:
            print("Agent not found")
            return
        with open("/home/linus/.openclaw/workspace-lead-1f562920-31bc-498f-b9d2-684a8ad05823/SOUL.md") as f:
            agent.soul_template = f.read()
        session.add(agent)
        await session.commit()
        print("soul_template updated")

asyncio.run(update())
EOF
```

**Step 3: Verify**
```bash
# Confirm the DB record was updated
cd backend && uv run python3 -c "
import asyncio
from app.db.session import async_session_maker
from app.models.agents import Agent
from uuid import UUID

async def check():
    async with async_session_maker() as session:
        a = await session.get(Agent, UUID('8a349b8a-5bf7-4a0b-9180-3db2b858aba9'))
        print('soul_template ends with:', a.soul_template[-100:] if a else 'NOT FOUND')

asyncio.run(check())
"
```

Expected: last 100 chars contain "Approval not found"

**Step 4: Commit**
```bash
git add docs/plans/
git commit -m "feat: teach Gatekeeper SOUL to resolve approvals from Telegram button taps"
```

---

## Task 10: Build + deploy

**Step 1: Full CI check**
```bash
make check
```
Expected: all lint/typecheck/test/build pass.

**Step 2: Rebuild and restart frontend**
```bash
cd frontend && npm run build
systemctl --user restart mc-frontend
```

**Step 3: Restart backend**
```bash
systemctl --user restart mc-backend mc-worker
```

**Step 4: Smoke test**
1. Open inbox — confirm deleted emails no longer reappear after a few minutes
2. Open `/boards/new` — confirm Notifications dropdown appears in Step 2
3. Set a board to "Telegram" notifications
4. Create a pending approval on that board → check Telegram for the inline-button message
5. Tap ✅ Approve → verify GLM Dispatch processes the callback and the approval is resolved in Mission Control
6. Move a task to "done" on the notification board → check Telegram for the status alert

**Step 5: Final commit**
```bash
git add -A
git commit -m "chore: post-deploy smoke test complete"
git push fork feat/full-app-redesign
```
