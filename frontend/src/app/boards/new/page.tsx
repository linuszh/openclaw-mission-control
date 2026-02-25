"use client";

export const dynamic = "force-dynamic";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Code2,
  Plus,
  Search,
  Server,
  ChevronLeft,
} from "lucide-react";

import { useAuth } from "@/auth/clerk";

import { ApiError, customFetch } from "@/api/mutator";
import { useCreateBoardApiV1BoardsPost } from "@/api/generated/boards/boards";
import {
  type listBoardGroupsApiV1BoardGroupsGetResponse,
  useListBoardGroupsApiV1BoardGroupsGet,
} from "@/api/generated/board-groups/board-groups";
import {
  type listGatewaysApiV1GatewaysGetResponse,
  useListGatewaysApiV1GatewaysGet,
} from "@/api/generated/gateways/gateways";
import { useOrganizationMembership } from "@/lib/use-organization-membership";
import type { BoardGroupRead } from "@/api/generated/model";
import { BOARD_TEMPLATES, type BoardTemplate } from "@/lib/board-templates";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SearchableSelect from "@/components/ui/searchable-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";

type GatewayModel = { id: string; name: string };
const NO_MODEL_VALUE = "__default__";
const DEFAULT_MODEL_OPTION = { value: NO_MODEL_VALUE, label: "Default (gateway setting)" };

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "board";

// ─── Template icon map ────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Code2,
  Search,
  Server,
  Plus,
};

const COLOR_MAP: Record<string, { border: string; bg: string; text: string }> = {
  blue: { border: "border-blue-500", bg: "bg-blue-50", text: "text-blue-700" },
  purple: { border: "border-purple-500", bg: "bg-purple-50", text: "text-purple-700" },
  orange: { border: "border-orange-500", bg: "bg-orange-50", text: "text-orange-700" },
  slate: { border: "border-slate-400", bg: "bg-slate-50", text: "text-slate-700" },
};

// ─── Step 1: Template picker ──────────────────────────────────────────────────

function TemplatePicker({
  onSelect,
}: {
  onSelect: (template: BoardTemplate) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Choose a template</h2>
        <p className="mt-1 text-sm text-slate-500">
          Start with a pre-configured team or build from scratch.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {BOARD_TEMPLATES.map((template) => {
          const Icon = ICON_MAP[template.icon] ?? Plus;
          const colors = COLOR_MAP[template.color] ?? COLOR_MAP.slate;
          const isSelected = selected === template.id;

          return (
            <button
              key={template.id}
              type="button"
              onClick={() => setSelected(template.id)}
              className={cn(
                "group relative flex flex-col overflow-hidden rounded-xl border-2 bg-white text-left shadow-sm transition-all hover:shadow-md",
                isSelected ? "ring-2 ring-blue-500 ring-offset-2 border-blue-500" : "border-slate-200 hover:border-slate-300",
              )}
            >
              {/* Colored top border accent */}
              <div className={cn("h-1 w-full", `bg-${template.color}-500`)} />
              <div className="flex flex-1 flex-col p-4">
                <div className={cn("mb-3 flex h-10 w-10 items-center justify-center rounded-lg", colors.bg)}>
                  <Icon className={cn("h-5 w-5", colors.text)} />
                </div>
                <p className="text-sm font-semibold text-slate-900">{template.name}</p>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed">{template.description}</p>

                {template.agentRoster.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {template.agentRoster.map((agent) => (
                      <span
                        key={agent.name}
                        className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600"
                      >
                        {agent.isLead ? "★ " : ""}{agent.name}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex justify-end">
        <Button
          disabled={!selected}
          onClick={() => {
            const template = BOARD_TEMPLATES.find((t) => t.id === selected);
            if (template) onSelect(template);
          }}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}

// ─── Step 2: Configure form ───────────────────────────────────────────────────

function ConfigureForm({
  template,
  onBack,
}: {
  template: BoardTemplate;
  onBack: () => void;
}) {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const { isAdmin } = useOrganizationMembership(isSignedIn);

  const leadModel = template.agentRoster.find((a) => a.isLead)?.model ?? NO_MODEL_VALUE;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [gatewayId, setGatewayId] = useState<string>("");
  const [boardGroupId, setBoardGroupId] = useState<string>("none");
  const [defaultModel, setDefaultModel] = useState<string>(
    leadModel !== "" ? leadModel : NO_MODEL_VALUE,
  );
  const [notificationChannel, setNotificationChannel] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const gatewaysQuery = useListGatewaysApiV1GatewaysGet<
    listGatewaysApiV1GatewaysGetResponse,
    ApiError
  >(undefined, {
    query: {
      enabled: Boolean(isSignedIn && isAdmin),
      refetchOnMount: "always",
      retry: false,
    },
  });

  const groupsQuery = useListBoardGroupsApiV1BoardGroupsGet<
    listBoardGroupsApiV1BoardGroupsGetResponse,
    ApiError
  >(undefined, {
    query: {
      enabled: Boolean(isSignedIn && isAdmin),
      refetchOnMount: "always",
      retry: false,
    },
  });

  const gateways = useMemo(() => {
    if (gatewaysQuery.data?.status !== 200) return [];
    return gatewaysQuery.data.data.items ?? [];
  }, [gatewaysQuery.data]);

  const groups = useMemo<BoardGroupRead[]>(() => {
    if (groupsQuery.data?.status !== 200) return [];
    return groupsQuery.data.data.items ?? [];
  }, [groupsQuery.data]);

  const displayGatewayId = gatewayId || gateways[0]?.id || "";

  const modelsQuery = useQuery({
    queryKey: ["gateway-models", displayGatewayId],
    queryFn: () =>
      customFetch<{ data: { models: GatewayModel[] } }>(
        `/api/v1/gateways/${displayGatewayId}/models?configured=true`,
        { method: "GET" },
      ),
    enabled: Boolean(isSignedIn && isAdmin && displayGatewayId),
  });

  const modelOptions = [
    DEFAULT_MODEL_OPTION,
    ...(modelsQuery.data?.data?.models ?? []).map((m) => ({
      value: m.id,
      label: m.name,
    })),
  ];

  const createBoardMutation = useCreateBoardApiV1BoardsPost<ApiError>({
    mutation: {
      onSuccess: (result) => {
        if (result.status === 200) {
          const newBoardId = result.data.id;
          // Store selected template in localStorage for the setup banner
          if (template.id !== "blank" && template.agentRoster.length > 0) {
            try {
              localStorage.setItem(
                `board-template-${newBoardId}`,
                JSON.stringify(template),
              );
            } catch {
              // localStorage may be unavailable
            }
            router.push(`/boards/${newBoardId}?setupAgents=true`);
          } else {
            router.push(`/boards/${newBoardId}/edit?onboarding=1`);
          }
        }
      },
      onError: (err) => {
        setError(err.message || "Something went wrong.");
      },
    },
  });

  const isLoading =
    gatewaysQuery.isLoading ||
    groupsQuery.isLoading ||
    createBoardMutation.isPending;

  const errorMessage =
    error ?? gatewaysQuery.error?.message ?? groupsQuery.error?.message ?? null;

  const isFormReady = Boolean(name.trim() && description.trim() && displayGatewayId);

  const gatewayOptions = useMemo(
    () => gateways.map((gateway) => ({ value: gateway.id, label: gateway.name })),
    [gateways],
  );

  const groupOptions = useMemo(
    () => [
      { value: "none", label: "No group" },
      ...groups.map((group) => ({ value: group.id, label: group.name })),
    ],
    [groups],
  );

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isSignedIn) return;
    const trimmedName = name.trim();
    const resolvedGatewayId = displayGatewayId;
    if (!trimmedName) {
      setError("Board name is required.");
      return;
    }
    if (!resolvedGatewayId) {
      setError("Select a gateway before creating a board.");
      return;
    }
    const trimmedDescription = description.trim();
    if (!trimmedDescription) {
      setError("Board description is required.");
      return;
    }
    setError(null);
    createBoardMutation.mutate({
      data: {
        name: trimmedName,
        slug: slugify(trimmedName),
        description: trimmedDescription,
        gateway_id: resolvedGatewayId,
        board_group_id: boardGroupId === "none" ? null : boardGroupId,
        default_model: defaultModel === NO_MODEL_VALUE ? null : defaultModel || null,
        notification_channel: notificationChannel || undefined,
      },
    });
  };

  return (
    <div className="space-y-5">
      {/* Back + template chip */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>
        <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          Template: {template.name}
        </span>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="space-y-4">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-900">
                Board name <span className="text-red-500">*</span>
              </label>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Release operations"
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-900">
                Gateway <span className="text-red-500">*</span>
              </label>
              <SearchableSelect
                ariaLabel="Select gateway"
                value={displayGatewayId}
                onValueChange={setGatewayId}
                options={gatewayOptions}
                placeholder="Select gateway"
                searchPlaceholder="Search gateways..."
                emptyMessage="No gateways found."
                triggerClassName="w-full h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                contentClassName="rounded-xl border border-slate-200 shadow-lg"
                itemClassName="px-4 py-3 text-sm text-slate-700 data-[selected=true]:bg-slate-50 data-[selected=true]:text-slate-900"
              />
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-900">
                Board group
              </label>
              <SearchableSelect
                ariaLabel="Select board group"
                value={boardGroupId}
                onValueChange={setBoardGroupId}
                options={groupOptions}
                placeholder="No group"
                searchPlaceholder="Search groups..."
                emptyMessage="No groups found."
                triggerClassName="w-full h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                contentClassName="rounded-xl border border-slate-200 shadow-lg"
                itemClassName="px-4 py-3 text-sm text-slate-700 data-[selected=true]:bg-slate-50 data-[selected=true]:text-slate-900"
                disabled={isLoading}
              />
              <p className="text-xs text-slate-500">
                Optional. Groups increase cross-board visibility.
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-900">
                Default model
              </label>
              <Select
                value={defaultModel}
                onValueChange={setDefaultModel}
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
                Override the default model for agents on this board.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-900">
              Description <span className="text-red-500">*</span>
            </label>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What context should the lead agent know before onboarding?"
              className="min-h-[120px]"
              disabled={isLoading}
            />
          </div>

          {/* Notifications */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">
              Notifications
            </label>
            <select
              value={notificationChannel}
              onChange={(e) => setNotificationChannel(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">None</option>
              <option value="telegram">Telegram</option>
              <option value="discord">Discord</option>
              <option value="both">Telegram + Discord</option>
            </select>
            <p className="text-xs text-slate-400">
              Receive approval requests and done/blocked task alerts via Telegram or Discord.
            </p>
          </div>
        </div>

        {gateways.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <p>
              No gateways available. Create one in{" "}
              <Link
                href="/gateways"
                className="font-medium text-blue-600 hover:text-blue-700"
              >
                Gateways
              </Link>{" "}
              to continue.
            </p>
          </div>
        ) : null}

        {errorMessage ? (
          <p className="text-sm text-red-500">{errorMessage}</p>
        ) : null}

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.push("/boards")}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading || !isFormReady}>
            {isLoading ? "Creating…" : "Create board"}
          </Button>
        </div>
      </form>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewBoardPage() {
  const { isSignedIn } = useAuth();
  const { isAdmin } = useOrganizationMembership(isSignedIn);
  const [selectedTemplate, setSelectedTemplate] = useState<BoardTemplate | null>(null);

  return (
    <DashboardPageLayout
      signedOut={{
        message: "Sign in to create a board.",
        forceRedirectUrl: "/boards/new",
        signUpForceRedirectUrl: "/boards/new",
      }}
      title="Create project"
      description="Projects organize tasks and agents by mission context."
      isAdmin={isAdmin}
      adminOnlyMessage="Only organization owners and admins can create boards."
    >
      {selectedTemplate === null ? (
        <TemplatePicker onSelect={setSelectedTemplate} />
      ) : (
        <ConfigureForm template={selectedTemplate} onBack={() => setSelectedTemplate(null)} />
      )}
    </DashboardPageLayout>
  );
}
