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

## Important notes

- **Authorization**: Claude Code will use the credentials of the user running the gateway process. Ensure the `ANTHROPIC_API_KEY` environment variable is set in the gateway's environment.
- **File changes**: Claude Code may create, edit, or delete files. Review changes before marking a task done if the board requires approval.
- **Safety**: Claude Code respects `.gitignore` and will not overwrite protected files unless explicitly instructed. Do not pass tasks that involve credentials, secrets, or irreversible destructive operations without explicit user approval.
- **Timeout**: Long-running tasks may time out. Break large tasks into smaller subtasks if needed.

## Example agent workflow

When assigned a development task from Mission Control:

1. Read the task description and identify the target project directory.
2. Run Claude Code with the task as a prompt:
   ```bash
   claude --print "$(cat <<'EOF'
   Task: <task title>

   <task description>
   EOF
   )"
   ```
3. Review the output for errors or incomplete steps.
4. Report back with what was done and any files changed.
