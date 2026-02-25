export type AgentTemplate = {
  name: string;
  model: string;
  isLead: boolean;
  role: "dispatcher" | "developer" | "researcher" | "qa" | "devops";
};

export type BoardTemplate = {
  id: string;
  name: string;
  description: string;
  icon: string; // lucide icon name
  color: string; // tailwind color class for the card accent
  defaultMaxAgents: number;
  boardSettings: {
    requireApprovalForDone: boolean;
    requireReviewBeforeDone: boolean;
  };
  agentRoster: AgentTemplate[];
};

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
