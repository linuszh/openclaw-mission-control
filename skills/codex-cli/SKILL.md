---
name: "Codex CLI"
description: "Delegate coding tasks to OpenAI Codex CLI using OAuth login."
category: "development"
risk: "high"
---

# Codex CLI Skill

Use this skill to delegate software development tasks to the `codex` CLI (OpenAI Codex CLI). Codex CLI operates autonomously on the local filesystem, can read and edit files, run shell commands, and complete multi-step coding tasks.

## When to use this skill

Use Codex CLI when you need to:
- Write or edit source code files
- Fix bugs or implement features
- Run tests and interpret results
- Refactor or review code
- Leverage OpenAI's o3 or o4-mini models for reasoning-heavy coding tasks
- Get a second opinion or alternative approach from a different AI model

## Authentication (one-time operator setup)

Codex CLI uses an OAuth device flow — no `OPENAI_API_KEY` is needed after setup.

**Run once on the gateway host:**

```bash
codex login
```

This initiates an OAuth device flow. Follow the instructions to authenticate with your OpenAI account. Credentials are stored locally and reused on every subsequent run.

> **Note:** The gateway process must run as the same user who performed the login, as credentials are stored in the user's home directory.

## How to invoke Codex CLI

### Non-interactive (recommended for agent use)

Run fully autonomously with no prompts:

```bash
codex --approval-mode full-auto "task description"
```

Example:

```bash
codex --approval-mode full-auto "Add input validation to the login form in frontend/src/components/LoginForm.tsx. Validate that email is a valid format and password is at least 8 characters."
```

### With a working directory

Always set the working directory to the relevant project root:

```bash
cd /path/to/project && codex --approval-mode full-auto "task"
```

### With context files

Pipe additional context into Codex CLI:

```bash
cat TASK.md | codex --approval-mode full-auto "$(cat TASK.md)"
```

## Output handling

Codex CLI writes output to stdout. Capture it and include relevant parts in your response or task update.

```bash
result=$(codex --approval-mode full-auto "your task")
echo "$result"
```

## Approval modes

| Mode | Behavior |
|------|----------|
| `suggest` | Read-only; proposes changes without applying (default) |
| `auto-edit` | Applies file edits automatically, but asks before running shell commands |
| `full-auto` | Fully non-interactive; applies edits and runs commands without confirmation |

Use `full-auto` for agent workflows. Use `suggest` for review-only tasks.

## Important notes

- **Authorization**: Codex CLI uses OAuth credentials stored by `codex login`. No `OPENAI_API_KEY` is needed.
- **File changes**: In `full-auto` mode, Codex may create, edit, or delete files. Review changes before marking a task done if the board requires approval.
- **Sandboxing**: Codex CLI runs file edits in a sandbox by default on supported platforms. Shell commands may have side effects — review the task scope before using `full-auto`.
- **Timeout**: Long-running tasks may time out. Break large tasks into smaller subtasks if needed.

## Example agent workflow

When assigned a development task from Mission Control:

1. Read the task description and identify the target project directory.
2. Run Codex CLI with the task as a prompt:
   ```bash
   cd /path/to/project && codex --approval-mode full-auto "$(cat <<'EOF'
   Task: <task title>

   <task description>
   EOF
   )"
   ```
3. Review the output for errors or incomplete steps.
4. Report back with what was done and any files changed.
