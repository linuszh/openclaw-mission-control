---
name: "Claude Code"
description: "Delegate software development tasks to Claude Code CLI. Use this skill to write, edit, or review code, run tests, fix bugs, and perform any file-system-level development work."
category: "development"
risk: "high"
---

# Claude Code Skill

Use this skill to delegate software development tasks to the `claude` CLI (Claude Code). Claude Code operates autonomously on the local filesystem, can read and edit files, run shell commands, and complete multi-step coding tasks.

## When to use this skill

Use Claude Code when you need to:
- Write or edit source code files
- Fix bugs or implement features
- Run tests and interpret results
- Refactor or review code
- Create new files or project scaffolding
- Execute shell commands as part of a development workflow

## How to invoke Claude Code

### Non-interactive (recommended for agent use)

Run a single task and capture output:

```bash
claude --print "<your task description here>"
```

Example:
```bash
claude --print "Add input validation to the login form in frontend/src/components/LoginForm.tsx. Validate that email is a valid format and password is at least 8 characters."
```

### With a working directory

Always set the working directory to the relevant project root:

```bash
cd /path/to/project && claude --print "<task>"
```

### With context files

Pipe additional context into Claude Code:

```bash
cat TASK.md | claude --print "Complete the task described in the input"
```

## Output handling

Claude Code writes `--print` output to stdout. Capture it and include relevant parts in your response or task update.

```bash
result=$(claude --print "your task")
echo "$result"
```

## Authentication (one-time operator setup)

Claude Code uses OAuth — no `ANTHROPIC_API_KEY` environment variable is needed after setup.

**Run once on the gateway host:**

```bash
claude auth login
```

This opens a browser OAuth flow and stores credentials locally. Claude Code picks them up automatically on every subsequent run.

> **Note:** The gateway process must run as the same user who performed the login.

## Important notes

- **Authorization**: Claude Code uses OAuth credentials stored by `claude auth login`. No `ANTHROPIC_API_KEY` is needed.
- **File changes**: Claude Code may create, edit, or delete files. Review changes before marking a task done if the board requires approval.
- **Safety**: Claude Code respects `.gitignore` and will not overwrite protected files unless explicitly instructed. Do not pass tasks that involve credentials, secrets, or irreversible destructive operations without explicit user approval.
- **Timeout**: Long-running tasks may time out. Break large tasks into smaller subtasks if needed.

## Example agent workflow

When assigned a development task from Mission Control:

1. Read the task description and identify the target project directory.
2. Run Claude Code with the task as a prompt:
   ```bash
   claude --dangerously-skip-permissions --print "$(cat <<'EOF'
   Task: <task title>

   <task description>
   EOF
   )"
   ```
3. Review the output for errors or incomplete steps.
4. Report back with what was done and any files changed.

## Claude Code Teams / Sub-agents

Claude Code can spawn parallel sub-agents for large tasks using the `Task` tool. This is useful when a task can be split into independent pieces that run concurrently.

### When to spawn sub-agents

- The task has clearly independent sub-tasks (e.g., fix backend bug + update frontend component)
- Each sub-task affects different files with no write conflicts
- The total work would take more than a few minutes sequentially

### How to configure sub-agents via CLAUDE.md

Add a `CLAUDE.md` file in the project root to give Claude Code context about the project and enable agent teams:

```markdown
# CLAUDE.md

## Agent team

This project uses Claude Code agent teams for parallel work. When you receive
a task with multiple independent subtasks, use the Task tool to spawn subagents:

- Each subagent gets its own task description and working context
- Subagents run in parallel and return their results
- Coordinate file ownership to avoid conflicts
```

### Non-interactive invocation for agent use

Use `--dangerously-skip-permissions` to bypass all confirmation prompts for fully autonomous operation:

```bash
claude --dangerously-skip-permissions --print "task description"
```

> **Warning:** `--dangerously-skip-permissions` allows Claude Code to modify files, run shell commands, and take other actions without confirmation. Only use this in trusted, sandboxed environments or when you trust the task scope.

### When to delegate vs handle inline

| Scenario | Action |
|----------|--------|
| Small, single-file change | Handle inline |
| Multiple independent file changes | Spawn sub-agents via Task tool |
| Needs another AI model's perspective | Use Gemini CLI or Codex CLI skill instead |
| Requires long-running shell commands | Spawn sub-agent with specific working directory |
