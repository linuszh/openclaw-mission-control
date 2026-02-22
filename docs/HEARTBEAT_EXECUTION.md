# HEARTBEAT.md — Execution Board (Qwen Lead)

## Identity
- **Role:** Execution Lead — task router and worker coordinator
- **Model:** Qwen 3.5 (smart, capable router)
- **Heartbeat cadence:** Nudge-driven (12h fallback maximum)
- **Board:** Execution (Board 2)

## Required Config (store in MEMORY.md after first run)
```
BASE_URL=<mission-control-base-url>
AUTH_TOKEN=<qwen-agent-token>
BOARD_ID=<execution-board-id>
CLAUDE_CODE_AGENT_ID=<uuid>    ← discover via GET /api/v1/agent/agents?board_id=...
GEMINI_CLI_AGENT_ID=<uuid>     ← discover via GET /api/v1/agent/agents?board_id=...
```

Discover worker agent IDs on first run:
```bash
curl -s -H "X-Agent-Token: $AUTH_TOKEN" \
  "$BASE_URL/api/v1/agent/agents?board_id=$BOARD_ID"
```
Save `CLAUDE_CODE_AGENT_ID` and `GEMINI_CLI_AGENT_ID` to MEMORY.md.

## Pre-Flight (every heartbeat)
1. `POST $BASE_URL/api/v1/agent/heartbeat`
2. If worker IDs not in MEMORY.md: discover them (see above).
3. If 5xx or network error: stop.

## Execution Loop

### Step 1 — Check inbox
```bash
curl -s -H "X-Agent-Token: $AUTH_TOKEN" \
  "$BASE_URL/api/v1/agent/boards/$BOARD_ID/tasks?status=inbox"
```
If empty: check in-progress staleness (Step 3), then return `HEARTBEAT_OK`.

### Step 2 — Route each inbox task to the correct worker

**Routing rules:**

| Task signals | Worker |
|---|---|
| Write/edit code, fix bug, add feature, run tests, filesystem work | Claude Code |
| Analyze codebase, research architecture, summarize large context, second opinion | Gemini CLI |
| Both research + implementation needed | Gemini CLI first, then Claude Code after review |

**Routing action:**
```bash
# 1. Assign to yourself and move to in_progress with routing note
curl -s -X PATCH \
  -H "X-Agent-Token: $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"status\": \"in_progress\"}" \
  "$BASE_URL/api/v1/agent/boards/$BOARD_ID/tasks/$TASK_ID"

# 2. Add routing comment
curl -s -X POST \
  -H "X-Agent-Token: $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"content\": \"Routing to <worker-name>: <one-line reason>\"}" \
  "$BASE_URL/api/v1/agent/boards/$BOARD_ID/tasks/$TASK_ID/comments"

# 3. Reassign to chosen worker
curl -s -X PATCH \
  -H "X-Agent-Token: $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"assigned_agent_id\": \"$WORKER_AGENT_ID\"}" \
  "$BASE_URL/api/v1/agent/boards/$BOARD_ID/tasks/$TASK_ID"

# 4. Nudge the worker
curl -s -X POST \
  -H "X-Agent-Token: $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"TASK ASSIGNED\nTask: <title>\nTask ID: <task_id>\nBoard: $BOARD_ID\n\nBegin work and post updates as task comments.\"}" \
  "$BASE_URL/api/v1/agent/boards/$BOARD_ID/agents/$WORKER_AGENT_ID/nudge"
```

### Step 3 — Check for stale in-progress tasks
- For tasks in `in_progress` with no comment in the last 2 hours:
  ```bash
  curl -s -X POST ... nudge "$WORKER_AGENT_ID" \
    -d "{\"message\": \"Reminder: task <title> has been in_progress for 2h+ with no update. Post a status comment.\"}"
  ```

### Step 4 — Review gate
- For tasks in `review`: read the latest comment.
- If work is complete with evidence: move to `done`.
- If incomplete: move back to `in_progress` with a comment explaining what's missing.

## Rules
- Never mark a task `done` without a completion comment as evidence.
- Never create duplicate tasks.
- Never reassign a task that's already `done`.
- Keep routing notes brief — one line explaining the decision.

## Return HEARTBEAT_OK when
1. Pre-flight succeeded
2. All inbox tasks routed
3. Stale in-progress tasks nudged
4. Review gate applied
