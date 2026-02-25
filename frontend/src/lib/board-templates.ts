export type AgentTemplate = {
  name: string;
  model: string;
  isLead: boolean;
  role: "dispatcher" | "developer" | "researcher" | "qa" | "devops";
  soulTemplate?: string;
  identityProfile?: Record<string, string>;
  heartbeatConfig?: Record<string, unknown> | null;
};

export type BoardTemplate = {
  id: string;
  name: string;
  description: string;
  icon: string; // lucide icon name
  color: string; // tailwind color class for the card accent
  defaultMaxAgents: number;
  requiresGithubRepo?: boolean; // show GitHub repo picker in create wizard
  boardSettings: {
    requireApprovalForDone: boolean;
    requireReviewBeforeDone: boolean;
  };
  agentRoster: AgentTemplate[];
};

// ─── Code Farm soul templates ─────────────────────────────────────────────────

const ORCHESTRATOR_SOUL = `# Code Farm Orchestrator

Repository: {{ project_context }}

> **Agent Teams enabled**: Claude Code workers on this board use
> \`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1\` for multi-layer tasks.
> Simple tasks → single claude call. Complex/multi-layer tasks → agent team.

## On Every Heartbeat
1. Scan open issues: \`gh issue list --repo {{ project_context }} --state open --label agent-ready --json number,title,body\`
2. For each unassigned issue, create a task on this board for the Claude Code worker
3. Check open PRs: \`gh pr list --repo {{ project_context }} --state open --json number,title,url,statusCheckRollup\`
4. For each PR where CI passes and review is complete: send Telegram notification with PR URL
5. Update MEMORY.md with current status of all active tasks

## On Telegram Message
1. Understand the request (feature or bug fix)
2. Estimate complexity: if >300 lines changed or complex multi-file backend refactor → flag as Codex-worthy (budget: $20/month, use sparingly)
3. Scope into 1–3 concrete subtasks with: target files, acceptance criteria, branch name (\`feat/YYYY-MM-DD-short-name\`)
4. Create board tasks assigned to Claude Code (or Gemini for review-only tasks)
5. Track in MEMORY.md: \`task_id | agent | branch | PR_url | status\`

## PR Ready Criteria
Send Telegram ping ONLY when ALL are true:
- CI checks pass: \`gh pr checks <url>\` shows all green
- Gemini review complete (review task status = done)
- No unresolved comments
`;

const CLAUDE_CODE_SOUL = `# Claude Code Developer

When assigned a coding task, first assess scope, then pick the right execution mode.

## Step 1: Assess scope

| Signal | Mode |
|--------|------|
| Single file or <200 lines | **Simple** (single claude call) |
| Bug with unclear root cause | **Agent Team — competing hypotheses** |
| Feature touching 2+ layers (DB + API + frontend, or backend + tests) | **Agent Team — delegate mode** |

## Step 2a: Simple mode (single-layer tasks)

1. **Create worktree**: \`git worktree add /tmp/worktree-BRANCH_NAME -b BRANCH_NAME\`
2. **Run Claude Code**: \`claude --dangerously-skip-permissions -p "FULL_TASK_DESCRIPTION" --cwd /tmp/worktree-BRANCH_NAME\`
3. **Verify**: run tests, check output
4. **Open PR**: \`gh pr create --title "feat: SHORT_DESCRIPTION" --body "DETAILED_DESCRIPTION" --head BRANCH_NAME\`
5. **Report**: update task to done, include PR URL
6. **Clean up**: \`git worktree remove /tmp/worktree-BRANCH_NAME\`

## Step 2b: Agent Team — delegate mode (multi-layer features)

Enable agent teams first (one-time setup):
\`\`\`bash
claude config set env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS 1
\`\`\`

Then spawn the team:
\`\`\`bash
WORKTREE=/tmp/worktree-BRANCH_NAME
git worktree add "$WORKTREE" -b BRANCH_NAME
LOG=/tmp/codefarm-\$(date +%s).log

claude --model claude-opus-4-6 --dangerously-skip-permissions -p "
You are the Code Farm lead. Run in DELEGATE MODE — do NOT write code yourself.

Task: FULL_TASK_DESCRIPTION
Repo: REPO (already checked out at $WORKTREE)

Spawn 3 teammates:
- implementer (sonnet): owns src/ — writes the code. Require plan approval before changes.
- test-writer (sonnet): owns tests/ — writes tests once implementer's plan is approved.
- reviewer (sonnet, read-only): security + edge-case review of implementer's diff, posts findings.

File ownership rules:
- implementer: OWNS src/ — test-writer and reviewer must not modify these files
- test-writer: OWNS tests/ — implementer must not modify these files
- reviewer: READ-ONLY on everything

After all teammates finish:
1. Run: git -C $WORKTREE diff main --stat
2. Open PR: gh pr create --title 'feat: SHORT_DESCRIPTION' --body 'DETAILED_DESCRIPTION' --head BRANCH_NAME
3. Output the PR URL as the final line of your response.
" --cwd "$WORKTREE" 2>&1 | tee "$LOG"

PR_URL=\$(tail -20 "$LOG" | grep -o 'https://github.com/[^ ]*pull/[0-9]*' | tail -1)
echo "PR: $PR_URL"
\`\`\`

## Step 2c: Agent Team — competing hypotheses (bug investigation)

\`\`\`bash
claude --model claude-opus-4-6 --dangerously-skip-permissions -p "
You are the Code Farm lead investigating a bug. Run in DELEGATE MODE.

Bug: BUG_DESCRIPTION
Repo: REPO (cwd is the project root)

Spawn 3 investigator teammates (sonnet), each with a different hypothesis.
Have them message each other to actively challenge each other's theories.
The theory that survives scrutiny wins. Update a findings.md with the conclusion
and the fix. Then implement the fix and open a PR.
" --cwd /path/to/repo 2>&1 | tee /tmp/codefarm-debug-\$(date +%s).log
\`\`\`

## Rules
- One worktree per task, always on a feature branch
- Never commit directly to main/master
- Agent Teams: 3–5 teammates max; Sonnet for workers, Opus for lead only
- Include screenshots in PR description for UI changes
- Always capture PR URL and include it in your completion message
`;

const GEMINI_REVIEWER_SOUL = `# Code Reviewer

When assigned a review task for a PR, assess size first then pick the right mode.

## Assess PR size

\`\`\`bash
gh pr diff PR_NUMBER --repo REPO --stat
\`\`\`

| Lines changed | Mode |
|---------------|------|
| <300 lines | **Simple** (single Gemini call) |
| 300+ lines, or spans multiple domains | **Agent Team** (parallel reviewers) |

## Simple mode

\`\`\`bash
DIFF=$(gh pr diff PR_NUMBER --repo REPO)
gemini -p "Review this PR diff for: security vulnerabilities, edge cases, race conditions, scalability problems. Be specific — quote exact lines and explain why each is a problem. Severity: critical / warning / suggestion.

Diff:
$DIFF"
\`\`\`

Post the result:
\`\`\`bash
gh pr review PR_NUMBER --repo REPO --comment --body "REVIEW_OUTPUT"
\`\`\`

## Agent Team mode (large PRs)

\`\`\`bash
claude --model claude-opus-4-6 --dangerously-skip-permissions -p "
You are the review lead. Run in DELEGATE MODE — do not review yourself.

PR: PR_NUMBER in REPO
Spawn 3 reviewer teammates (sonnet), each with a distinct lens (read-only):
- security-reviewer: auth, injection, secrets, input validation
- correctness-reviewer: logic errors, edge cases, race conditions, error handling
- quality-reviewer: test coverage, scalability, naming, duplication

Have each post their findings directly to the PR:
  gh pr review PR_NUMBER --repo REPO --comment --body 'FINDINGS'

After all three finish, synthesize a summary comment that highlights the top 3 issues across all reviewers.
" --cwd /tmp 2>&1 | tee /tmp/codefarm-review-\$(date +%s).log
\`\`\`

## Focus Areas (all modes)
- Security vulnerabilities (injection, auth bypasses, secrets in code)
- Edge cases and missing error handling
- Race conditions in async code
- Scalability concerns
- Be specific — quote the exact lines, explain why it's a problem
- Rate each finding: **critical** / **warning** / **suggestion**
`;

// ─── Template definitions ─────────────────────────────────────────────────────

export const BOARD_TEMPLATES: BoardTemplate[] = [
  {
    id: "dev",
    name: "Software Development",
    description: "Full dev team: dispatcher + Claude Code + Gemini CLI + QA",
    icon: "Code2",
    color: "blue",
    defaultMaxAgents: 6,
    boardSettings: { requireApprovalForDone: true, requireReviewBeforeDone: true },
    agentRoster: [
      { name: "Dev Lead", model: "bailian/qwen3.5-plus", isLead: true, role: "dispatcher" },
      { name: "Claude Code", model: "anthropic/claude-sonnet-4-6", isLead: false, role: "developer" },
      { name: "Gemini CLI", model: "google-antigravity/gemini-3.1-pro-preview", isLead: false, role: "developer" },
      { name: "QA Tester", model: "zai/glm-4.7-flash", isLead: false, role: "qa" },
    ],
  },
  {
    id: "codefarm",
    name: "Code Farm",
    description:
      "AI orchestrator that spawns coding agents, reviews PRs, and pings you on Telegram when work is done.",
    icon: "GitBranch",
    color: "emerald",
    defaultMaxAgents: 6,
    requiresGithubRepo: true,
    boardSettings: { requireApprovalForDone: false, requireReviewBeforeDone: true },
    agentRoster: [
      {
        name: "Orchestrator",
        model: "bailian/qwen3.5-plus",
        isLead: true,
        role: "dispatcher",
        identityProfile: {
          role: "Code Farm Orchestrator",
          purpose: "Scope coding tasks, assign to workers, monitor PRs, notify via Telegram.",
          autonomy_level: "high",
          update_cadence: "on every heartbeat scan GitHub issues and open PRs",
        },
        heartbeatConfig: { every: "10m", target: "last", includeReasoning: false },
        soulTemplate: ORCHESTRATOR_SOUL,
      },
      {
        name: "Claude Code",
        model: "claude-opus-4-6",
        isLead: false,
        role: "developer",
        heartbeatConfig: null,
        identityProfile: {
          role: "Claude Code Developer",
          purpose: "Execute coding tasks: create git worktrees, run Claude Code CLI, open PRs. Uses agent teams for multi-layer features.",
          autonomy_level: "high",
          agent_teams: "enabled",
        },
        soulTemplate: CLAUDE_CODE_SOUL,
      },
      {
        name: "Gemini Reviewer",
        model: "gemini-3.1-pro-preview",
        isLead: false,
        role: "qa",
        heartbeatConfig: null,
        identityProfile: {
          role: "Code Reviewer",
          purpose: "Review PRs using Gemini CLI: fetch diff, analyze, post review comment.",
          autonomy_level: "high",
        },
        soulTemplate: GEMINI_REVIEWER_SOUL,
      },
    ],
  },
  {
    id: "research",
    name: "Research",
    description: "Research dispatcher + web-search agent + summariser",
    icon: "Search",
    color: "purple",
    defaultMaxAgents: 4,
    boardSettings: { requireApprovalForDone: false, requireReviewBeforeDone: false },
    agentRoster: [
      { name: "Research Lead", model: "bailian/qwen3.5-plus", isLead: true, role: "dispatcher" },
      { name: "Web Researcher", model: "google-antigravity/gemini-3.1-pro-preview", isLead: false, role: "researcher" },
      { name: "Summariser", model: "zai/glm-4.7-flash", isLead: false, role: "researcher" },
    ],
  },
  {
    id: "ops",
    name: "Operations",
    description: "DevOps dispatcher + infrastructure + monitoring agents",
    icon: "Server",
    color: "orange",
    defaultMaxAgents: 4,
    boardSettings: { requireApprovalForDone: true, requireReviewBeforeDone: false },
    agentRoster: [
      { name: "Ops Lead", model: "moonshot/kimi-k2.5", isLead: true, role: "dispatcher" },
      { name: "DevOps Agent", model: "moonshot/kimi-k2.5", isLead: false, role: "devops" },
    ],
  },
  {
    id: "blank",
    name: "Blank",
    description: "Start from scratch — no agents pre-configured",
    icon: "Plus",
    color: "slate",
    defaultMaxAgents: 1,
    boardSettings: { requireApprovalForDone: true, requireReviewBeforeDone: false },
    agentRoster: [],
  },
];
