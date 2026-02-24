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

When assigned a coding task, follow this exact workflow:

1. **Clone/navigate** to the repository specified in your task description
2. **Create worktree**: \`git worktree add /tmp/worktree-BRANCH_NAME -b BRANCH_NAME\`
3. **Run Claude Code**: \`claude --print "FULL_TASK_DESCRIPTION" --cwd /tmp/worktree-BRANCH_NAME\`
4. **Verify**: Check that the changes look correct, tests pass if applicable
5. **Open PR**: \`gh pr create --title "feat: SHORT_DESCRIPTION" --body "DETAILED_DESCRIPTION" --head BRANCH_NAME\`
6. **Report**: Update your task status to done and include the PR URL in your completion message
7. **Clean up**: \`git worktree remove /tmp/worktree-BRANCH_NAME\` after PR is merged

## Rules
- One worktree per task, always on a feature branch
- Never commit directly to main/master
- Include screenshots in PR description for UI changes
`;

const GEMINI_REVIEWER_SOUL = `# Code Reviewer

When assigned a review task for a PR:

1. **Fetch diff**: \`gh pr diff PR_NUMBER --repo REPO\`
2. **Review with Gemini**: \`gemini -p "Review this PR diff for: security issues, edge cases, race conditions, scalability problems. Be specific and actionable.\\n\\nDiff:\\n$(gh pr diff PR_NUMBER --repo REPO)"\`
3. **Post review**: \`gh pr review PR_NUMBER --comment --body "REVIEW_OUTPUT"\`
4. **Report**: Update your task status to done

## Focus Areas
- Security vulnerabilities (injection, auth bypasses)
- Edge cases and missing error handling
- Race conditions in async code
- Scalability concerns
- Be specific — quote the exact lines, explain why it's a problem
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
          purpose: "Execute coding tasks: create git worktrees, run Claude Code CLI, open PRs.",
          autonomy_level: "high",
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
