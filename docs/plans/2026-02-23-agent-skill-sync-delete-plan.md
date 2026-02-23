# Agent Skill, Gateway Sync, Safe Delete Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** (1) Create a Mission Control OpenClaw skill agents can invoke + update GLM Dispatch SOUL; (2) Add on-demand "Sync from Gateway" to pull live model/config into MC DB; (3) Make agent deletion safely cascade to OpenClaw gateway with identity verification.

**Architecture:** The skill lives in `/home/linus/clawd/skills/mission-control/` and wraps MC API calls agents already make via curl — now discoverable as a named skill. Sync calls `config.get` RPC to read the gateway's agent config and writes `identity_profile.model` back to MC DB. Safe delete adds a verify-before-delete step in `delete_agent_lifecycle`: fetch the agent's gateway config entry, compare workspace path, only call `agents.delete` if identity confirmed.

**Tech Stack:** Python/FastAPI (backend), Next.js/React (frontend), OpenClaw gateway RPC (`config.get`, `agents.delete`), OpenClaw skill format (SKILL.md + _meta.json).

---

### Task 1: Mission Control OpenClaw Skill

**Files:**
- Create: `/home/linus/clawd/skills/mission-control/SKILL.md`
- Create: `/home/linus/clawd/skills/mission-control/_meta.json`

**Step 1: Create the skill directory and _meta.json**

```bash
mkdir -p /home/linus/clawd/skills/mission-control
```

Write `/home/linus/clawd/skills/mission-control/_meta.json`:
```json
{
  "ownerId": "local",
  "slug": "mission-control",
  "version": "0.1.0",
  "publishedAt": 1770487419494
}
```

**Step 2: Write SKILL.md**

Write `/home/linus/clawd/skills/mission-control/SKILL.md`:

```markdown
---
name: mission-control
description: >
  Interact with the Mission Control task management API. Create tasks, assign
  workers, nudge agents, check task status, update status, and relay tasks
  cross-board. Use when orchestrating work on a Mission Control board.
tags:
  - mission-control
  - tasks
  - agents
  - orchestration
---

# Mission Control Skill

Wraps the Mission Control REST API for agent-to-agent orchestration.
Auth reads `AUTH_TOKEN` and `BASE_URL` from your environment (already set in SOUL.md).

## Commands

### list-inbox-tasks

List tasks currently in the inbox of a board.

```bash
curl -s -H "X-Agent-Token: $AUTH_TOKEN" \
  "$BASE_URL/api/v1/agent/boards/<board_id>/tasks?status=inbox"
```

Returns JSON array of task objects. Key fields: `id`, `title`, `description`, `status`, `assigned_agent_id`.

---

### create-task

Create a task on a board, optionally assigning it to a worker agent.

```bash
curl -s -X POST \
  -H "X-Agent-Token: $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "<title>",
    "description": "<what the worker should do>",
    "assigned_agent_id": "<agent_id or omit>"
  }' \
  "$BASE_URL/api/v1/agent/boards/<board_id>/tasks"
```

Returns `{"id": "<task_id>", ...}` on success.

---

### get-task

Fetch a task's current state and comments.

```bash
curl -s -H "X-Agent-Token: $AUTH_TOKEN" \
  "$BASE_URL/api/v1/agent/boards/<board_id>/tasks/<task_id>"
```

Check `status` field and `comments` array for worker updates.

---

### update-task-status

Move a task to a new status (`inbox`, `in_progress`, `review`, `done`, `blocked`).

```bash
curl -s -X PATCH \
  -H "X-Agent-Token: $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "<new_status>"}' \
  "$BASE_URL/api/v1/agent/boards/<board_id>/tasks/<task_id>"
```

---

### nudge-agent

Wake a worker agent with a message (triggers its next heartbeat cycle).

```bash
curl -s -X POST \
  -H "X-Agent-Token: $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "<what you want the worker to do>"}' \
  "$BASE_URL/api/v1/agent/boards/<board_id>/agents/<agent_id>/nudge"
```

---

### relay-task

Relay a task cross-board (creates task on target board and nudges its lead).

```bash
curl -s -X POST \
  -H "X-Agent-Token: $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "<title>",
    "description": "<full context>",
    "priority": "normal",
    "relay_reason": "<why you are relaying this>"
  }' \
  "$BASE_URL/api/v1/agent/boards/<target_board_id>/relay-task"
```

Returns `{"task_id": "<id>"}` on success.

---

### add-task-comment

Post a comment to a task (used to report progress or results).

```bash
curl -s -X POST \
  -H "X-Agent-Token: $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content": "<your update>"}' \
  "$BASE_URL/api/v1/agent/boards/<board_id>/tasks/<task_id>/comments"
```

---

## Error Handling

- HTTP 401/403: your AUTH_TOKEN may be expired — check TOOLS.md for the current token.
- HTTP 404: board_id or task_id is wrong — double-check your config.
- HTTP 5xx: Mission Control backend issue — log the error and retry next heartbeat.

Always check the HTTP status code. `curl -o /tmp/resp.json -w "%{http_code}"` is the recommended pattern.
```

**Step 3: Verify skill appears in OpenClaw**

```bash
# OpenClaw watches /home/linus/clawd/skills/ — check it picked up the new skill
ls /home/linus/clawd/skills/mission-control/
```

Expected: `SKILL.md  _meta.json`

**Step 4: Commit**

```bash
cd /home/linus/openclaw-mission-control
git add -A
git commit -m "feat: add mission-control OpenClaw skill for agent orchestration"
```

---

### Task 2: Update GLM Dispatch SOUL on Disk (Gateway Only)

**Files:**
- Modify: `~/.openclaw/workspace-lead-1f562920-31bc-498f-b9d2-684a8ad05823/SOUL.md`

> ⚠️ Do NOT update the `soul_template` field in MC DB for this agent. Disk only.

**Step 1: Read the current SOUL.md**

```bash
cat ~/.openclaw/workspace-lead-1f562920-31bc-498f-b9d2-684a8ad05823/SOUL.md
```

**Step 2: Append the Mission Control Skill section**

Add the following section before the final `## Rules` section (or at the end if Rules is already last):

```markdown
## Mission Control Skill

Use the `@mission-control` skill commands instead of writing raw curl when interacting
with the Mission Control API. The skill wraps all common operations:

| What you need to do | Command |
|---|---|
| Check your board inbox | `list-inbox-tasks <board_id>` |
| Create a sub-task for a worker | `create-task <board_id> <title> <desc> [agent_id]` |
| Check a task's status or comments | `get-task <board_id> <task_id>` |
| Move a task to done/blocked/etc | `update-task-status <board_id> <task_id> <status>` |
| Wake a worker agent | `nudge-agent <board_id> <agent_id> <message>` |
| Send a task to another board | `relay-task <target_board_id> <title> <desc>` |
| Post a progress comment | `add-task-comment <board_id> <task_id> <content>` |

AUTH_TOKEN and BASE_URL are already set in your environment.
```

**Step 3: Verify the SOUL.md still has correct structure**

```bash
grep -n "^##" ~/.openclaw/workspace-lead-1f562920-31bc-498f-b9d2-684a8ad05823/SOUL.md
```

Expected: all existing section headers still present plus `## Mission Control Skill`.

**Step 4: No commit needed** (this file is not tracked by this repo)

---

### Task 3: Backend — Sync-from-Gateway Endpoint

**Files:**
- Modify: `backend/app/services/openclaw/provisioning.py` (add `get_agent_gateway_model`)
- Modify: `backend/app/services/openclaw/provisioning_db.py` (add `sync_agent_from_gateway`)
- Modify: `backend/app/api/agents.py` (add POST endpoint)
- Modify: `backend/app/schemas/agents.py` (add `AgentSyncResponse`)

**Step 1: Add `get_agent_gateway_model` helper in provisioning.py**

In `backend/app/services/openclaw/provisioning.py`, add after `_gateway_config_agent_list`:

```python
async def get_agent_gateway_config(
    agent_id: str,
    *,
    config: GatewayClientConfig,
) -> dict[str, Any] | None:
    """Return the gateway config entry for the given agent_id, or None if not found."""
    _, agents_list, _ = await _gateway_config_agent_list(config)
    for entry in agents_list:
        if not isinstance(entry, dict):
            continue
        gw_id = entry.get("agentId") or entry.get("id")
        if gw_id == agent_id:
            return entry
    return None
```

**Step 2: Add `AgentSyncResponse` schema**

In `backend/app/schemas/agents.py`, add:

```python
class AgentSyncResponse(SQLModel):
    """Result of syncing an agent's config from the gateway."""

    model_config = SQLModelConfig(
        json_schema_extra={
            "description": "Fields pulled from gateway during sync.",
        }
    )

    id: UUID
    name: str
    model: str | None = None
    synced_fields: list[str] = Field(default_factory=list)
```

**Step 3: Add `sync_agent_from_gateway` in provisioning_db.py**

In `AgentLifecycleService` class, add:

```python
async def sync_agent_from_gateway(
    self,
    *,
    agent_id: str,
    ctx: OrganizationContext,
) -> AgentSyncResponse:
    from app.schemas.agents import AgentSyncResponse

    agent = await Agent.objects.by_id(agent_id).first(self.session)
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    await self.require_agent_access(agent=agent, ctx=ctx, write=True)

    board = await self.require_board(str(agent.board_id)) if agent.board_id else None
    if board is not None:
        gateway, client_config = await self.require_gateway(board)
    else:
        gateway = await Gateway.objects.by_id(agent.gateway_id).first(self.session)
        client_config = optional_gateway_client_config(gateway) if gateway else None

    if client_config is None:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Gateway not reachable",
        )

    agent_key = _agent_key(agent)
    try:
        entry = await get_agent_gateway_config(agent_key, config=client_config)
    except OpenClawGatewayError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Gateway error: {exc}",
        ) from exc

    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found in gateway config",
        )

    synced: list[str] = []
    profile = dict(agent.identity_profile or {})

    new_model = entry.get("model")
    if isinstance(new_model, str) and new_model:
        if profile.get("model") != new_model:
            profile["model"] = new_model
            synced.append("model")

    if synced:
        agent.identity_profile = profile
        agent.updated_at = utcnow()
        self.session.add(agent)
        await self.session.commit()
        await self.session.refresh(agent)

    identity_profile = agent.identity_profile or {}
    return AgentSyncResponse(
        id=agent.id,
        name=agent.name,
        model=identity_profile.get("model"),
        synced_fields=synced,
    )
```

Note: Import `get_agent_gateway_config` from `app.services.openclaw.provisioning` at the top of the file.

**Step 4: Add endpoint in agents.py**

In `backend/app/api/agents.py`, add after the existing `GET /{agent_id}` endpoint:

```python
@router.post("/{agent_id}/sync-from-gateway", response_model=AgentSyncResponse)
async def sync_agent_from_gateway(
    agent_id: str,
    session: AsyncSession = SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> AgentSyncResponse:
    """Pull live model/config from the OpenClaw gateway and update this agent's MC record."""
    service = AgentLifecycleService(session)
    return await service.sync_agent_from_gateway(agent_id=agent_id, ctx=ctx)
```

Add `AgentSyncResponse` to the imports from `app.schemas.agents`.

**Step 5: Run backend checks**

```bash
cd /home/linus/openclaw-mission-control
make backend-lint
make backend-typecheck
```

Fix any issues found.

**Step 6: Restart backend and smoke-test**

```bash
systemctl --user restart mc-backend
sleep 2

# Test with a known agent ID (e.g. Qwen Router)
curl -s -X POST \
  -H "Authorization: Bearer ea37ac40570e3b34a82d6ce76af2239825136e6795330153218c7daf17b4d006" \
  http://localhost:8000/api/v1/agents/22ac06cf-d08a-4506-bf14-c56fa47c049e/sync-from-gateway | python3 -m json.tool
```

Expected: `{"id": "...", "name": "...", "model": "bailian/qwen3.5-plus", "synced_fields": [...]}`

**Step 7: Commit**

```bash
git add backend/app/services/openclaw/provisioning.py \
        backend/app/services/openclaw/provisioning_db.py \
        backend/app/api/agents.py \
        backend/app/schemas/agents.py
git commit -m "feat: add sync-from-gateway endpoint to pull live agent model from OpenClaw"
```

---

### Task 4: Frontend — Sync from Gateway Button

**Files:**
- Run: `make api-gen` (regenerate TypeScript client)
- Modify: `frontend/src/app/agents/[agentId]/page.tsx`

**Step 1: Regenerate API client**

```bash
make api-gen
```

Expected: new `syncAgentFromGatewayApiV1AgentsAgentIdSyncFromGatewayPost` hook in `src/api/generated/agents/agents.ts`.

**Step 2: Add state and mutation to AgentDetailPage**

After the existing `deleteMutation` block, add:

```tsx
const [syncSuccess, setSyncSuccess] = useState<string | null>(null);
const syncMutation = useSyncAgentFromGatewayApiV1AgentsAgentIdSyncFromGatewayPost<ApiError>({
  mutation: {
    onSuccess: (data) => {
      const fields = data.data?.synced_fields ?? [];
      setSyncSuccess(
        fields.length > 0
          ? `Synced: ${fields.join(", ")}`
          : "Already up to date"
      );
      agentQuery.refetch();
      setTimeout(() => setSyncSuccess(null), 4000);
    },
  },
});

const handleSync = () => {
  if (!agentId) return;
  setSyncSuccess(null);
  syncMutation.mutate({ agentId });
};
```

Import `useSyncAgentFromGatewayApiV1AgentsAgentIdSyncFromGatewayPost` from `@/api/generated/agents/agents`.

**Step 3: Add button in the actions area**

In the header actions area (near the Edit and Delete buttons, around line 185-202), add before the Edit button:

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={handleSync}
  disabled={syncMutation.isPending}
>
  {syncMutation.isPending ? "Syncing…" : "Sync from Gateway"}
</Button>
{syncSuccess && (
  <span className="text-xs text-green-600 dark:text-green-400">{syncSuccess}</span>
)}
```

**Step 4: Run frontend checks**

```bash
make frontend-typecheck
make frontend-lint
```

**Step 5: Rebuild and redeploy**

```bash
cd frontend && npm run build
systemctl --user restart mc-frontend
```

**Step 6: Manual test**

Visit an agent detail page → click "Sync from Gateway" → verify toast/success message and that model field reflects gateway value.

**Step 7: Commit**

```bash
git add frontend/src/app/agents/\[agentId\]/page.tsx \
        frontend/src/api/generated/
git commit -m "feat: add Sync from Gateway button to agent detail page"
```

---

### Task 5: Safe Agent Delete Cascade

**Files:**
- Modify: `backend/app/services/openclaw/provisioning.py` (`delete_agent_lifecycle`)

**Step 1: Read the current delete_agent_lifecycle**

Lines ~1177-1220 of `provisioning.py`. The key section is:

```python
try:
    await control_plane.delete_agent(agent_gateway_id, delete_files=delete_files)
except OpenClawGatewayError as exc:
    if not _is_missing_agent_error(exc):
        raise
```

**Step 2: Add verify-before-delete helper**

Add a helper function `_verify_agent_identity` above `delete_agent_lifecycle`:

```python
async def _verify_agent_identity(
    agent_gateway_id: str,
    expected_workspace: str,
    control_plane: GatewayControlPlane,
    logger: Any,
) -> bool:
    """
    Confirm the agent in the gateway matches expected identity before deletion.
    Returns True if safe to delete, False if identity cannot be confirmed.
    """
    config = getattr(control_plane, "_config", None)
    if config is None:
        logger.warning(
            "gateway.delete.verify_skipped agent_id=%s reason=no_config",
            agent_gateway_id,
        )
        return False
    try:
        entry = await get_agent_gateway_config(agent_gateway_id, config=config)
    except OpenClawGatewayError as exc:
        logger.warning(
            "gateway.delete.verify_failed agent_id=%s error=%s",
            agent_gateway_id,
            exc,
        )
        return False

    if entry is None:
        # Already gone from gateway — treat as safe (no-op delete)
        logger.info(
            "gateway.delete.already_absent agent_id=%s",
            agent_gateway_id,
        )
        return True

    gw_workspace = entry.get("workspace") or ""
    if not gw_workspace:
        logger.warning(
            "gateway.delete.verify_no_workspace agent_id=%s",
            agent_gateway_id,
        )
        return False

    # Normalize trailing slashes for comparison
    if gw_workspace.rstrip("/") != expected_workspace.rstrip("/"):
        logger.warning(
            "gateway.delete.identity_mismatch agent_id=%s expected_workspace=%s got_workspace=%s",
            agent_gateway_id,
            expected_workspace,
            gw_workspace,
        )
        return False

    return True
```

**Step 3: Modify delete_agent_lifecycle to use verification**

Replace the `agents.delete` call block:

```python
# BEFORE (around line 1202):
try:
    await control_plane.delete_agent(agent_gateway_id, delete_files=delete_files)
except OpenClawGatewayError as exc:
    if not _is_missing_agent_error(exc):
        raise

# AFTER:
safe = await _verify_agent_identity(
    agent_gateway_id,
    workspace_path,
    control_plane,
    _logging.getLogger(__name__),
)
if safe:
    try:
        await control_plane.delete_agent(agent_gateway_id, delete_files=delete_files)
    except OpenClawGatewayError as exc:
        if not _is_missing_agent_error(exc):
            raise
else:
    _logging.getLogger(__name__).warning(
        "gateway.delete.skipped agent_id=%s reason=identity_unconfirmed workspace=%s",
        agent_gateway_id,
        workspace_path,
    )
```

Note: `workspace_path` is already computed just before this block in `delete_agent_lifecycle`.

Also add the import `from app.services.openclaw.provisioning import get_agent_gateway_config` if calling from provisioning_db — but since `_verify_agent_identity` lives in `provisioning.py` alongside `get_agent_gateway_config`, no extra import needed.

**Step 4: Run backend checks**

```bash
make backend-lint
make backend-typecheck
```

**Step 5: Restart and smoke-test**

```bash
systemctl --user restart mc-backend
sleep 2
systemctl --user status mc-backend
```

Test: Delete an agent that exists in MC but check gateway logs to confirm it verifies before deleting (or logs a warning if workspace doesn't match).

**Step 6: Commit**

```bash
git add backend/app/services/openclaw/provisioning.py
git commit -m "fix: verify gateway agent identity before deletion to prevent wrong-agent deletes"
```

---

### Task 6: Push to Fork

```bash
git push fork feat/full-app-redesign
```
