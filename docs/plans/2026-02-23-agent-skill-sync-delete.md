# Design: Mission Control Skill, Gateway Sync, Safe Agent Delete

Date: 2026-02-23

## 1. Mission Control OpenClaw Skill + SOUL Reference

### Goal
Give routing agents (and any future agent) a first-class OpenClaw skill for interacting
with the Mission Control API — creating tasks, nudging workers, checking status, relaying
tasks. The skill lives in the gateway's skill directory; SOUL.md on disk references it.
Mission Control DB (soul_template) is NOT updated.

### Skill Location
`/home/linus/clawd/skills/mission-control/`
- `SKILL.md` — frontmatter + full skill instructions
- `_meta.json` — slug, version, ownerId

### Commands Exposed
| Command | Description |
|---|---|
| `list-inbox-tasks <board_id>` | List tasks with status=inbox |
| `create-task <board_id> <title> <description> [agent_id]` | Create task, optionally assign |
| `nudge-agent <board_id> <agent_id> <message>` | Wake a worker with a message |
| `get-task <board_id> <task_id>` | Fetch task detail + comments |
| `update-task-status <board_id> <task_id> <status>` | Move task to new status |
| `relay-task <target_board_id> <title> <description>` | Cross-board relay via relay-task endpoint |

Auth reads `AUTH_TOKEN` and `BASE_URL` from env (already present in every SOUL).

### SOUL Update (disk only)
GLM Dispatch SOUL.md gets a `## Mission Control Skill` section explaining the `@mission-control`
commands and when to use them instead of raw curl. No change to MC DB soul_template.

---

## 2. OpenClaw → MC Model Sync (On-Demand)

### Goal
When an agent's model or config is changed in OpenClaw's UI, MC shows stale data.
Add an explicit "Sync from Gateway" action that pulls live state and updates MC DB.

### Backend
New endpoint: `POST /api/v1/agents/{agent_id}/sync-from-gateway`
- Calls `agents.get` RPC on the gateway for the agent's `gateway_agent_id`
- Overwrites `model`, `heartbeat_cron`, `workspace_path` in MC DB if different
- Returns updated agent record with a `synced_at` timestamp
- 502 if gateway unreachable; 404 if agent not found in gateway

### Frontend
- Agent detail page: "Sync from Gateway" button (small, secondary style) in the header actions area
- Shows last synced timestamp after successful sync
- Loading/error state handled inline

---

## 3. Safe Agent Delete Cascade to OpenClaw

### Goal
When an agent is deleted from MC, also remove it from the OpenClaw gateway.
Must never delete the wrong agent in the gateway.

### Safety Protocol (in `_delete_agent_record`)
1. **Gate on `gateway_agent_id`**: if `agent.gateway_agent_id` is None or empty, skip
   gateway deletion entirely — log a warning, proceed with MC DB delete only.
2. **Verify before delete**: call `agents.get <gateway_agent_id>` RPC first.
   - If 404: agent already gone from gateway — log info, continue.
   - If mismatch (name or workspace_path don't match what MC has): log warning, skip
     gateway delete, continue with MC DB delete.
   - If match confirmed: proceed to `agents.delete`.
3. **Best-effort**: gateway delete failure (network, 5xx) logs a warning but does NOT
   block the MC DB delete. Agent is always removed from MC regardless.
4. **No fallback by name/model**: never infer gateway agent identity from anything other
   than the explicit `gateway_agent_id` field.
