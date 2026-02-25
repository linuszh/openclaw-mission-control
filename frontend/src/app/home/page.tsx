"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Bot,
  LayoutGrid,
  Plus,
  Settings,
} from "lucide-react";

import { SignedIn, SignedOut, SignInButton, useAuth } from "@/auth/clerk";
import { useListAgentsApiV1AgentsGet } from "@/api/generated/agents/agents";
import { useListBoardsApiV1BoardsGet } from "@/api/generated/boards/boards";
import { DashboardSidebar } from "@/components/organisms/DashboardSidebar";
import { MobileBottomNav } from "@/components/organisms/MobileBottomNav";
import { DashboardShell } from "@/components/templates/DashboardShell";
import { StatusDot } from "@/components/atoms/StatusDot";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useInboxCount } from "@/lib/use-inbox-count";

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  isLoading,
  accent,
}: {
  label: string;
  value: number | string;
  isLoading: boolean;
  accent?: "emerald" | "blue" | "rose" | "slate";
}) {
  const valueClass =
    accent === "emerald"
      ? "text-emerald-600"
      : accent === "blue"
        ? "text-blue-600"
        : accent === "rose"
          ? "text-rose-600"
          : "text-slate-700";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      {isLoading ? (
        <Skeleton className="mt-2 h-8 w-12 rounded" />
      ) : (
        <p className={`mt-1 text-2xl font-bold ${valueClass}`}>{value}</p>
      )}
    </div>
  );
}

// ─── Inner page ───────────────────────────────────────────────────────────────

function HomeInner() {
  const { isSignedIn } = useAuth();

  const agentsQuery = useListAgentsApiV1AgentsGet(undefined, {
    query: { refetchInterval: 30_000, retry: false },
    request: { cache: "no-store" },
  });
  const boardsQuery = useListBoardsApiV1BoardsGet(undefined, {
    query: { refetchInterval: 60_000, retry: false, enabled: Boolean(isSignedIn) },
    request: { cache: "no-store" },
  });
  const inboxCount = useInboxCount(isSignedIn);

  const agents =
    agentsQuery.data?.status === 200 ? (agentsQuery.data.data.items ?? []) : [];
  const activeAgents = agents.filter(
    (a) => a.status === "online" || a.status === "busy",
  ).length;
  const boards =
    boardsQuery.data?.status === 200 ? (boardsQuery.data.data.items ?? []) : [];

  const isAgentsLoading = agentsQuery.isLoading;
  const isBoardsLoading = boardsQuery.isLoading;

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

      <div className="p-6 space-y-6">
        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Active agents"
            value={activeAgents}
            isLoading={isAgentsLoading}
            accent="emerald"
          />
          <StatCard
            label="Total boards"
            value={boards.length}
            isLoading={isBoardsLoading}
            accent="blue"
          />
          <StatCard
            label="Pending inbox"
            value={inboxCount}
            isLoading={false}
            accent={inboxCount > 0 ? "rose" : "slate"}
          />
          <StatCard
            label="Total agents"
            value={agents.length}
            isLoading={isAgentsLoading}
            accent="slate"
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Agent roster */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Bot className="h-4 w-4 text-slate-400" />
                Agent roster
              </h2>
              <Link
                href="/agents"
                className="flex items-center gap-0.5 text-xs text-blue-600 hover:underline"
              >
                Manage
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              {isAgentsLoading ? (
                <div className="space-y-3 p-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full rounded" />
                  ))}
                </div>
              ) : agents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Bot className="mb-3 h-8 w-8 text-slate-300" />
                  <p className="text-sm font-medium text-slate-600">No agents yet</p>
                  <p className="mt-1 text-xs text-slate-400">Create a board and provision your first agent.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {agents.map((agent) => {
                    const model =
                      typeof agent.identity_profile === "object" &&
                      agent.identity_profile !== null &&
                      "model" in agent.identity_profile
                        ? String(agent.identity_profile.model)
                        : null;
                    return (
                      <Link
                        key={agent.id}
                        href={`/agents/${agent.id}`}
                        className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-slate-50"
                      >
                        <StatusDot status={agent.status ?? "offline"} />
                        <span className="flex-1 font-medium text-slate-900 truncate">
                          {agent.name}
                        </span>
                        {model ? (
                          <span className="shrink-0 text-xs text-slate-400 truncate max-w-[120px]">
                            {model.split("/").pop()}
                          </span>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* Quick actions */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Activity className="h-4 w-4 text-slate-400" />
              Quick actions
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                {
                  href: "/boards/new",
                  label: "New project",
                  icon: Plus,
                  accent: "bg-blue-600 text-white hover:bg-blue-700 shadow-sm",
                },
                {
                  href: "/inbox",
                  label: "View inbox",
                  icon: ArrowRight,
                  accent: "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200",
                },
                {
                  href: "/activity",
                  label: "Live activity",
                  icon: Activity,
                  accent: "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200",
                },
                {
                  href: "/agents",
                  label: "Manage agents",
                  icon: Bot,
                  accent: "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200",
                },
                {
                  href: "/boards",
                  label: "All projects",
                  icon: LayoutGrid,
                  accent: "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200",
                },
                {
                  href: "/settings",
                  label: "Settings",
                  icon: Settings,
                  accent: "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200",
                },
              ].map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-colors shadow-sm ${action.accent}`}
                >
                  <action.icon className="h-4 w-4 shrink-0" />
                  {action.label}
                </Link>
              ))}
            </div>
          </section>
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
