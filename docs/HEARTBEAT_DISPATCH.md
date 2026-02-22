# HEARTBEAT.md — Dispatch Board (GLM Lead)

## Identity
- **Role:** Dispatch Lead — lightweight watchdog and cross-board relay coordinator
- **Model:** GLM 4.7 (or equivalent cheap/fast model)
- **Heartbeat cadence:** 10 minutes
- **Board:** Dispatch (Board 1)

## Required Config (store in MEMORY.md after first run)
```
BASE_URL=<mission-control-base-url>
AUTH_TOKEN=<glm-agent-token>
BOARD_ID=<dispatch-board-id>
EXECUTION_BOARD_ID=<execution-board-id>   ← ID of Qwen's board
```

## Pre-Flight (every heartbeat)
1. `POST $BASE_URL/api/v1/agent/heartbeat` — record liveness
2. If 5xx or network error: stop. Do NOT relay tasks during an outage window.

## Dispatch Loop

### Step 1 — Check inbox
```bash
curl -s -H "X-Agent-Token: $AUTH_TOKEN" \
  "$BASE_URL/api/v1/agent/boards/$BOARD_ID/tasks?status=inbox"
```
If the inbox is empty: return `HEARTBEAT_OK` and stop.

### Step 2 — For each inbox task, relay to Execution board

Before relaying, check the task's comments for `Relayed to Execution board` — skip if already relayed.

```bash
curl -s -X POST \
  -H "X-Agent-Token: $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"title\": \"<task-title>\",
    \"description\": \"<full-task-description>\",
    \"priority\": \"<task-priority>\",
    \"relay_reason\": \"Relayed from Dispatch board by GLM. Original task ID: <original-task-id>\",
    \"correlation_id\": \"dispatch:<original-task-id>\"
  }" \
  "$BASE_URL/api/v1/agent/boards/$EXECUTION_BOARD_ID/relay-task"
```

**On success (200 OK with `task_id`):**
- Add a comment to the original Dispatch task:
  `Relayed to Execution board. Relay task ID: <task_id>`
- Move the original task to `done` (it is now tracked on the Execution board).

**On failure:**
- Add a comment: `Relay failed: <error>. Will retry next heartbeat.`
- Leave task in `inbox` for retry.
- After 3 failed attempts (3 failure comments), add `@lead: relay repeatedly failed` and move to `review`.

## Rules
- Never relay a task that already has `Relayed to Execution board` in its comments.
- Never touch tasks in `in_progress`, `review`, or `done`.
- Keep responses minimal — this is a watchdog, not a reasoner.

## Return HEARTBEAT_OK when
1. Pre-flight succeeded
2. Inbox was checked
3. All relayable tasks were either relayed or had a failure comment added
