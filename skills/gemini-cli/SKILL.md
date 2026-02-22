---
name: "Gemini CLI"
description: "Delegate coding tasks to Google Gemini CLI using OAuth. Supports agentic Jules mode."
category: "development"
risk: "high"
---

# Gemini CLI Skill

Use this skill to delegate software development tasks to the `gemini` CLI (Google Gemini CLI). Gemini CLI operates autonomously on the local filesystem, can read and edit files, run shell commands, and complete multi-step coding tasks.

## When to use this skill

Use Gemini CLI when you need to:
- Write or edit source code files
- Fix bugs or implement features
- Run tests and interpret results
- Refactor or review code
- Perform large-context tasks (Gemini has a very large context window)
- Get a second opinion or alternative approach from a different AI model

## Authentication (one-time operator setup)

Gemini CLI uses Google Application Default Credentials (ADC). No API key environment variable is needed after setup.

**Run once on the gateway host:**

```bash
gcloud auth application-default login
```

This opens a browser OAuth flow and stores credentials at `~/.config/gcloud/application_default_credentials.json`. Gemini CLI picks them up automatically on every subsequent run.

> **Note:** The gateway process must run as the same user who performed the login, or ADC credentials must be explicitly shared via `GOOGLE_APPLICATION_CREDENTIALS` env var pointing to the JSON file.

## How to invoke Gemini CLI

### Non-interactive (recommended for agent use)

Run a single task and capture output:

```bash
gemini -p "task description"
```

Example:

```bash
gemini -p "Add input validation to the login form in frontend/src/components/LoginForm.tsx. Validate that email is a valid format and password is at least 8 characters."
```

### Jules/agentic mode (auto-approves file changes)

Use `--yolo` to skip all confirmation prompts — Gemini will read and write files without asking:

```bash
gemini --yolo -p "task description"
```

> **Warning:** `--yolo` allows Gemini to modify files without confirmation. Only use this on tasks where you trust the output, or in sandboxed environments.

### With a working directory

Always set the working directory to the relevant project root:

```bash
cd /path/to/project && gemini --yolo -p "task"
```

### With context files

Pipe additional context into Gemini CLI:

```bash
cat TASK.md | gemini -p "Complete the task described in the input"
```

## Output handling

Gemini CLI writes output to stdout. Capture it and include relevant parts in your response or task update.

```bash
result=$(gemini --yolo -p "your task")
echo "$result"
```

## Important notes

- **Authorization**: Gemini CLI uses ADC credentials stored by `gcloud auth application-default login`. No `GOOGLE_API_KEY` or `GEMINI_API_KEY` is needed.
- **File changes**: With `--yolo`, Gemini may create, edit, or delete files. Review changes before marking a task done if the board requires approval.
- **Context window**: Gemini 2.0 Flash and Pro have very large context windows (up to 1M tokens), making them well-suited for whole-repository tasks.
- **Timeout**: Long-running tasks may time out. Break large tasks into smaller subtasks if needed.

## Example agent workflow

When assigned a development task from Mission Control:

1. Read the task description and identify the target project directory.
2. Run Gemini CLI with the task as a prompt:
   ```bash
   cd /path/to/project && gemini --yolo -p "$(cat <<'EOF'
   Task: <task title>

   <task description>
   EOF
   )"
   ```
3. Review the output for errors or incomplete steps.
4. Report back with what was done and any files changed.
