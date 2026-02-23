"use client";

export const dynamic = "force-dynamic";

import { useMemo } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import {
  Activity,
  Bot,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Mail,
  Sparkles,
  XCircle,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { SignedIn, SignedOut, SignInButton, useAuth } from "@/auth/clerk";
import type { ApiError } from "@/api/mutator";
import { useListAgentsApiV1AgentsGet } from "@/api/generated/agents/agents";
import {
  listApprovalsApiV1BoardsBoardIdApprovalsGet,
  updateApprovalApiV1BoardsBoardIdApprovalsApprovalIdPatch,
} from "@/api/generated/approvals/approvals";
import { useListBoardsApiV1BoardsGet } from "@/api/generated/boards/boards";
import { useListEmailsApiV1EmailsGet } from "@/api/generated/emails/emails";
import type { ApprovalRead, BoardRead } from "@/api/generated/model";
import { DashboardSidebar } from "@/components/organisms/DashboardSidebar";
import { MobileBottomNav } from "@/components/organisms/MobileBottomNav";
import { DashboardShell } from "@/components/templates/DashboardShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Agents status strip ─────────────────────────────────────────────────────

function AgentStatusStrip() {
  const agentsQuery = useListAgentsApiV1AgentsGet(undefined, {
    query: { refetchInterval: 30_000, retry: false },
    request: { cache: "no-store" },
  });

  const agents =
    agentsQuery.data?.status === 200
      ? (agentsQuery.data.data.items ?? [])
      : [];
  const online = agents.filter(
    (a) => a.status === "online" || a.status === "busy",
  ).length;
  const offline = agents.filter((a) => a.status === "offline").length;
  const other = agents.length - online - offline;

  if (agentsQuery.isLoading) {
    return <Skeleton className="h-10 w-full rounded-xl" />;
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <Bot className="h-4 w-4 shrink-0 text-slate-400" />
      <span className="text-sm font-medium text-slate-700">
        Agents: {agents.length} total
      </span>
      <span className="flex items-center gap-1 text-xs text-emerald-700">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        {online} online
      </span>
      {other > 0 ? (
        <span className="flex items-center gap-1 text-xs text-amber-700">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          {other} provisioning
        </span>
      ) : null}
      <span className="flex items-center gap-1 text-xs text-slate-500">
        <span className="h-2 w-2 rounded-full bg-slate-300" />
        {offline} offline
      </span>
    </div>
  );
}

// ─── Approvals section ───────────────────────────────────────────────────────

type ApprovalsData = { approvals: ApprovalRead[]; warnings: string[] };

function ApprovalsSection({
  isSignedIn,
}: {
  isSignedIn: boolean | null | undefined;
}) {
  const queryClient = useQueryClient();

  const boardsQuery = useListBoardsApiV1BoardsGet(undefined, {
    query: { enabled: Boolean(isSignedIn), retry: false, refetchInterval: 60_000 },
    request: { cache: "no-store" },
  });

  const boards = useMemo(() => {
    if (boardsQuery.data?.status !== 200) return [];
    return boardsQuery.data.data.items ?? [];
  }, [boardsQuery.data]);

  const boardIdsKey = useMemo(() => {
    const ids = boards.map((b: BoardRead) => b.id);
    ids.sort();
    return ids.join(",");
  }, [boards]);

  const approvalsKey = useMemo(
    () => ["approvals", "home", boardIdsKey] as const,
    [boardIdsKey],
  );

  const approvalsQuery = useQuery<ApprovalsData, ApiError>({
    queryKey: approvalsKey,
    enabled: Boolean(isSignedIn && boards.length > 0),
    refetchInterval: 30_000,
    retry: false,
    queryFn: async () => {
      const results = await Promise.allSettled(
        boards.map(async (board: BoardRead) => {
          const response = await listApprovalsApiV1BoardsBoardIdApprovalsGet(
            board.id,
            { limit: 100 },
            { cache: "no-store" },
          );
          if (response.status !== 200)
            throw new Error(
              `Failed for ${board.name} (${response.status}).`,
            );
          return response.data.items ?? [];
        }),
      );
      const approvals: ApprovalRead[] = [];
      const warnings: string[] = [];
      for (const r of results) {
        if (r.status === "fulfilled") approvals.push(...r.value);
        else warnings.push(r.reason?.message ?? "Load failed.");
      }
      return { approvals, warnings };
    },
  });

  const updateMutation = useMutation<
    Awaited<
      ReturnType<
        typeof updateApprovalApiV1BoardsBoardIdApprovalsApprovalIdPatch
      >
    >,
    ApiError,
    { boardId: string; approvalId: string; status: "approved" | "rejected" }
  >({
    mutationFn: ({ boardId, approvalId, status }) =>
      updateApprovalApiV1BoardsBoardIdApprovalsApprovalIdPatch(
        boardId,
        approvalId,
        { status },
        { cache: "no-store" },
      ),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: approvalsKey });
    },
  });

  const pending = useMemo(
    () =>
      (approvalsQuery.data?.approvals ?? []).filter(
        (a) => a.status === "pending",
      ),
    [approvalsQuery.data],
  );

  const visible = pending.slice(0, 5);

  if (boardsQuery.isLoading || approvalsQuery.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-400">
        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        No pending approvals
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {visible.map((approval) => (
        <div
          key={approval.id}
          className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">
              {approval.action_type}
            </p>
            {approval.created_at ? (
              <p className="text-xs text-slate-400">
                {formatDistanceToNow(new Date(approval.created_at), {
                  addSuffix: true,
                })}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 px-2 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
              onClick={() => {
                if (!approval.board_id) return;
                updateMutation.mutate({
                  boardId: approval.board_id,
                  approvalId: approval.id,
                  status: "approved",
                });
              }}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3 w-3" />
              )}
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 px-2 text-rose-700 border-rose-300 hover:bg-rose-50"
              onClick={() => {
                if (!approval.board_id) return;
                updateMutation.mutate({
                  boardId: approval.board_id,
                  approvalId: approval.id,
                  status: "rejected",
                });
              }}
              disabled={updateMutation.isPending}
            >
              <XCircle className="h-3 w-3" />
              Reject
            </Button>
          </div>
        </div>
      ))}
      {pending.length > 5 ? (
        <Link
          href="/inbox?tab=approvals"
          className="flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-blue-600 hover:bg-slate-50"
        >
          View all {pending.length} approvals
          <ChevronRight className="h-4 w-4" />
        </Link>
      ) : null}
    </div>
  );
}

// ─── Email previews ───────────────────────────────────────────────────────────

function EmailPreviews() {
  const emailsQuery = useListEmailsApiV1EmailsGet(
    {},
    { query: { refetchInterval: 60_000, retry: false } },
  );

  const emails = useMemo(() => {
    if (emailsQuery.data?.status !== 200) return [];
    return emailsQuery.data.data.items ?? [];
  }, [emailsQuery.data]);

  const visible = emails.slice(0, 5);

  if (emailsQuery.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-400">
        <Mail className="h-4 w-4" />
        No emails synced yet
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {visible.map((email) => (
        <Link
          key={email.id}
          href="/inbox?tab=email"
          className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition-colors hover:bg-slate-50"
        >
          <Mail className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">
              {email.subject}
            </p>
            <p className="text-xs text-slate-500">{email.sender}</p>
          </div>
          <span className="shrink-0 text-xs text-slate-400">
            {formatDistanceToNow(new Date(email.received_at), {
              addSuffix: true,
            })}
          </span>
        </Link>
      ))}
      {emails.length > 5 ? (
        <Link
          href="/inbox?tab=email"
          className="flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-blue-600 hover:bg-slate-50"
        >
          View all {emails.length} emails
          <ChevronRight className="h-4 w-4" />
        </Link>
      ) : null}
    </div>
  );
}

// ─── KPI strip ────────────────────────────────────────────────────────────────

function KpiStrip() {
  const agentsQuery = useListAgentsApiV1AgentsGet(undefined, {
    query: { refetchInterval: 30_000, retry: false },
    request: { cache: "no-store" },
  });

  const agents =
    agentsQuery.data?.status === 200
      ? (agentsQuery.data.data.items ?? [])
      : [];
  const activeAgents = agents.filter(
    (a) => a.status === "online" || a.status === "busy",
  ).length;

  const kpis = [
    {
      label: "Active agents",
      value: agentsQuery.isLoading ? "—" : String(activeAgents),
      color: "text-emerald-600",
    },
    {
      label: "Total agents",
      value: agentsQuery.isLoading ? "—" : String(agents.length),
      color: "text-slate-700",
    },
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-3">
      {kpis.map((kpi) => (
        <div
          key={kpi.label}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <p className="text-xs text-slate-500">{kpi.label}</p>
          <p className={`mt-1 text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Inner page ───────────────────────────────────────────────────────────────

function HomeInner() {
  const { isSignedIn } = useAuth();

  return (
    <main className="flex-1 overflow-y-auto bg-slate-50 pb-16 md:pb-0">
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-slate-900">
          Home
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Your mission control command center.
        </p>
      </div>

      <div className="p-6">
        {/* Agent status */}
        <div className="mb-6">
          <AgentStatusStrip />
        </div>

        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          {/* Left: attention items */}
          <div className="space-y-6">
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <CheckCircle2 className="h-4 w-4 text-amber-500" />
                  Pending approvals
                </h2>
                <Link
                  href="/inbox?tab=approvals"
                  className="flex items-center gap-0.5 text-xs text-blue-600 hover:underline"
                >
                  View all
                  <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
              <ApprovalsSection isSignedIn={isSignedIn} />
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <Mail className="h-4 w-4 text-blue-500" />
                  Recent emails
                </h2>
                <Link
                  href="/inbox?tab=email"
                  className="flex items-center gap-0.5 text-xs text-blue-600 hover:underline"
                >
                  View all
                  <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
              <EmailPreviews />
            </section>
          </div>

          {/* Right: awareness */}
          <div className="space-y-6">
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Sparkles className="h-4 w-4 text-purple-500" />
                Overview
              </h2>
              <KpiStrip />
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <Activity className="h-4 w-4 text-slate-400" />
                  Quick links
                </h2>
              </div>
              <div className="space-y-2">
                {[
                  { href: "/boards", label: "All projects" },
                  { href: "/activity", label: "Live activity feed" },
                  { href: "/agents", label: "Manage agents" },
                  { href: "/settings", label: "Settings" },
                ].map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                  >
                    {link.label}
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </Link>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <DashboardShell>
      <SignedOut>
        <div className="flex h-full flex-col items-center justify-center gap-4 p-10 text-center">
          <p className="text-sm text-slate-500">
            Sign in to view your command center.
          </p>
          <SignInButton
            mode="modal"
            forceRedirectUrl="/home"
            signUpForceRedirectUrl="/home"
          >
            <Button>Sign in</Button>
          </SignInButton>
        </div>
      </SignedOut>
      <SignedIn>
        <DashboardSidebar />
        <HomeInner />
        <MobileBottomNav />
      </SignedIn>
    </DashboardShell>
  );
}
