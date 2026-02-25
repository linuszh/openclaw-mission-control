"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/auth/clerk";

import { ApiError, customFetch } from "@/api/mutator";
import {
  type listBoardsApiV1BoardsGetResponse,
  useListBoardsApiV1BoardsGet,
} from "@/api/generated/boards/boards";
import { useCreateAgentApiV1AgentsPost } from "@/api/generated/agents/agents";
import { useOrganizationMembership } from "@/lib/use-organization-membership";
import type { BoardRead } from "@/api/generated/model";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SearchableSelect, {
  type SearchableSelectOption,
} from "@/components/ui/searchable-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEFAULT_IDENTITY_PROFILE, CLI_AGENT_TEMPLATES } from "@/lib/agent-templates";

type GatewayModel = { id: string; name: string };

const NO_MODEL_VALUE = "__default__";
const DEFAULT_MODEL_OPTION = { value: NO_MODEL_VALUE, label: "Default (gateway setting)" };

type IdentityProfile = {
  role: string;
  communication_style: string;
  emoji: string;
  model: string;
  tool?: string;
};

const EMOJI_OPTIONS = [
  { value: ":gear:", label: "Gear", glyph: "⚙️" },
  { value: ":sparkles:", label: "Sparkles", glyph: "✨" },
  { value: ":rocket:", label: "Rocket", glyph: "🚀" },
  { value: ":megaphone:", label: "Megaphone", glyph: "📣" },
  { value: ":chart_with_upwards_trend:", label: "Growth", glyph: "📈" },
  { value: ":bulb:", label: "Idea", glyph: "💡" },
  { value: ":wrench:", label: "Builder", glyph: "🔧" },
  { value: ":shield:", label: "Shield", glyph: "🛡️" },
  { value: ":memo:", label: "Notes", glyph: "📝" },
  { value: ":brain:", label: "Brain", glyph: "🧠" },
];

const getBoardOptions = (boards: BoardRead[]): SearchableSelectOption[] =>
  boards.map((board) => ({
    value: board.id,
    label: board.name,
  }));

const normalizeIdentityProfile = (
  profile: IdentityProfile,
): IdentityProfile | null => {
  const normalized: IdentityProfile = {
    role: profile.role.trim(),
    communication_style: profile.communication_style.trim(),
    emoji: profile.emoji.trim(),
    model: profile.model === NO_MODEL_VALUE ? "" : profile.model.trim(),
    ...(profile.tool ? { tool: profile.tool } : {}),
  };
  const hasValue = Object.values(normalized).some((value) => value && value.length > 0);
  return hasValue ? normalized : null;
};

export default function NewAgentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isSignedIn } = useAuth();

  const { isAdmin } = useOrganizationMembership(isSignedIn);

  const prefillName = searchParams.get("name") ?? "";
  const prefillModel = searchParams.get("model") ?? "";
  const prefillBoardId = searchParams.get("boardId") ?? "";
  const prefillIsLead = searchParams.get("isLead") === "true";

  const [name, setName] = useState(prefillName);
  const [boardId, setBoardId] = useState<string>(prefillBoardId);
  const [heartbeatEvery, setHeartbeatEvery] = useState("10m");
  const [identityProfile, setIdentityProfile] = useState<IdentityProfile>({
    ...DEFAULT_IDENTITY_PROFILE,
    model: prefillModel !== "" ? prefillModel : NO_MODEL_VALUE,
  });
  const [error, setError] = useState<string | null>(null);

  const boardsQuery = useListBoardsApiV1BoardsGet<
    listBoardsApiV1BoardsGetResponse,
    ApiError
  >(undefined, {
    query: {
      enabled: Boolean(isSignedIn && isAdmin),
      refetchOnMount: "always",
    },
  });

  const createAgentMutation = useCreateAgentApiV1AgentsPost<ApiError>({
    mutation: {
      onSuccess: (result) => {
        if (result.status === 200) {
          router.push(`/agents/${result.data.id}`);
        }
      },
      onError: (err) => {
        setError(err.message || "Something went wrong.");
      },
    },
  });

  const boards =
    boardsQuery.data?.status === 200 ? (boardsQuery.data.data.items ?? []) : [];
  const displayBoardId = boardId || boards[0]?.id || "";

  const selectedBoard = boards.find((b) => b.id === displayBoardId);
  const gatewayIdForModels = selectedBoard?.gateway_id ?? null;

  const modelsQuery = useQuery({
    queryKey: ["gateway-models", gatewayIdForModels],
    queryFn: () =>
      customFetch<{ data: { models: GatewayModel[] } }>(
        `/api/v1/gateways/${gatewayIdForModels}/models?configured=true`,
        { method: "GET" },
      ),
    enabled: Boolean(isSignedIn && isAdmin && gatewayIdForModels),
  });

  const modelOptions = [
    DEFAULT_MODEL_OPTION,
    ...(modelsQuery.data?.data?.models ?? []).map((m) => ({
      value: m.id,
      label: m.name,
    })),
  ];

  const isLoading = boardsQuery.isLoading || createAgentMutation.isPending;
  const errorMessage = error ?? boardsQuery.error?.message ?? null;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isSignedIn) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Agent name is required.");
      return;
    }
    const resolvedBoardId = displayBoardId;
    if (!resolvedBoardId) {
      setError("Select a board before creating an agent.");
      return;
    }
    setError(null);
    createAgentMutation.mutate({
      data: {
        name: trimmed,
        board_id: resolvedBoardId,
        is_board_lead: prefillIsLead,
        heartbeat_config: {
          every: heartbeatEvery.trim() || "10m",
          target: "last",
          includeReasoning: false,
        },
        identity_profile: normalizeIdentityProfile(
          identityProfile,
        ) as unknown as Record<string, unknown> | null,
      },
    });
  };

  return (
    <DashboardPageLayout
      signedOut={{
        message: "Sign in to create an agent.",
        forceRedirectUrl: "/agents/new",
        signUpForceRedirectUrl: "/agents/new",
      }}
      title="Create agent"
      description="Agents start in provisioning until they check in."
      isAdmin={isAdmin}
      adminOnlyMessage="Only organization owners and admins can create agents."
    >
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Quick-start template
        </p>
        <p className="text-sm text-slate-500">
          Pre-fill the form for a specific CLI execution engine.
        </p>
        <div className="flex flex-wrap gap-2">
          {CLI_AGENT_TEMPLATES.map((template) => (
            <button
              key={template.tool}
              type="button"
              onClick={() =>
                setIdentityProfile((current) => ({
                  ...current,
                  role: template.role,
                  communication_style: template.communication_style,
                  emoji: template.emoji,
                  tool: template.tool,
                }))
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-colors"
            >
              {template.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() =>
              setIdentityProfile({
                ...DEFAULT_IDENTITY_PROFILE,
                model: NO_MODEL_VALUE,
              })
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-50 transition-colors"
          >
            Reset
          </button>
        </div>
      </div>
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Basic configuration
          </p>
          <div className="mt-4 space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900">
                  Agent name <span className="text-red-500">*</span>
                </label>
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Deploy bot"
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900">
                  Role
                </label>
                <Input
                  value={identityProfile.role}
                  onChange={(event) =>
                    setIdentityProfile((current) => ({
                      ...current,
                      role: event.target.value,
                    }))
                  }
                  placeholder="e.g. Founder, Social Media Manager"
                  disabled={isLoading}
                />
              </div>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900">
                  Board <span className="text-red-500">*</span>
                </label>
                <SearchableSelect
                  ariaLabel="Select board"
                  value={displayBoardId}
                  onValueChange={setBoardId}
                  options={getBoardOptions(boards)}
                  placeholder="Select board"
                  searchPlaceholder="Search boards..."
                  emptyMessage="No matching boards."
                  triggerClassName="w-full h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  contentClassName="rounded-xl border border-slate-200 shadow-lg"
                  itemClassName="px-4 py-3 text-sm text-slate-700 data-[selected=true]:bg-slate-50 data-[selected=true]:text-slate-900"
                  disabled={boards.length === 0}
                />
                {boards.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Create a board before adding agents.
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900">
                  Emoji
                </label>
                <Select
                  value={identityProfile.emoji}
                  onValueChange={(value) =>
                    setIdentityProfile((current) => ({
                      ...current,
                      emoji: value,
                    }))
                  }
                  disabled={isLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select emoji" />
                  </SelectTrigger>
                  <SelectContent>
                    {EMOJI_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.glyph} {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Personality & behavior
          </p>
          <div className="mt-4 space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-900">
                Communication style
              </label>
              <Input
                value={identityProfile.communication_style}
                onChange={(event) =>
                  setIdentityProfile((current) => ({
                    ...current,
                    communication_style: event.target.value,
                  }))
                }
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-900">
                Model
              </label>
              <Select
                value={identityProfile.model || NO_MODEL_VALUE}
                onValueChange={(value) =>
                  setIdentityProfile((current) => ({
                    ...current,
                    model: value,
                  }))
                }
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Default (gateway setting)" />
                </SelectTrigger>
                <SelectContent>
                  {modelOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">
                Override the default model for this agent.
              </p>
            </div>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Schedule & notifications
          </p>
          <div className="mt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-900">
                Interval
              </label>
              <Input
                value={heartbeatEvery}
                onChange={(event) => setHeartbeatEvery(event.target.value)}
                placeholder="e.g. 10m"
                disabled={isLoading}
              />
              <p className="text-xs text-slate-500">
                How often this agent runs HEARTBEAT.md (10m, 30m, 2h).
              </p>
            </div>
          </div>
        </div>

        {errorMessage ? (
          <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600 shadow-sm">
            {errorMessage}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Creating…" : "Create agent"}
          </Button>
          <Button
            variant="outline"
            type="button"
            onClick={() => router.push("/agents")}
          >
            Back to agents
          </Button>
        </div>
      </form>
    </DashboardPageLayout>
  );
}
