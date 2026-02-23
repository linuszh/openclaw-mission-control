"use client";

import { useMemo } from "react";
import { ClipboardList, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { useListBoardsApiV1BoardsGet } from "@/api/generated/boards/boards";
import { useListApprovalsApiV1BoardsBoardIdApprovalsGet } from "@/api/generated/approvals/approvals";
import { useListTasksApiV1BoardsBoardIdTasksGet } from "@/api/generated/tasks/tasks";
import type { BoardRead } from "@/api/generated/model";

function BoardApprovalRow({ board }: { board: BoardRead }) {
  const approvalsQuery = useListApprovalsApiV1BoardsBoardIdApprovalsGet(
    board.id,
    { status: "pending", limit: 100, offset: 0 },
    { query: { staleTime: 30_000 } },
  );
  const tasksQuery = useListTasksApiV1BoardsBoardIdTasksGet(
    board.id,
    { limit: 200, offset: 0 },
    { query: { staleTime: 30_000 } },
  );

  const pendingApprovals =
    approvalsQuery.data?.status === 200 ? approvalsQuery.data.data.items ?? [] : [];
  const allTasks =
    tasksQuery.data?.status === 200 ? tasksQuery.data.data.items ?? [] : [];
  const blockedTasks = allTasks.filter((t) => t.is_blocked);

  if (pendingApprovals.length === 0 && blockedTasks.length === 0) return null;

  return (
    <div className="mb-4">
      <h3 className="text-sm font-semibold text-slate-700 mb-2">{board.name}</h3>
      {pendingApprovals.length > 0 && (
        <div className="space-y-1 mb-2">
          {pendingApprovals.map((approval) => (
            <div
              key={approval.id}
              className="flex items-center gap-2 text-sm text-slate-600 pl-3"
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <span className="truncate">
                {approval.action_type}
              </span>
              <Badge variant="outline" className="text-xs shrink-0 bg-amber-50 border-amber-200 text-amber-700">
                {Math.round((approval.confidence ?? 0) * 100)}%
              </Badge>
            </div>
          ))}
        </div>
      )}
      {blockedTasks.length > 0 && (
        <div className="space-y-1">
          {blockedTasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-2 text-sm text-slate-600 pl-3"
            >
              <AlertTriangle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
              <span className="truncate">{task.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DailyBriefingPage() {
  const boardsQuery = useListBoardsApiV1BoardsGet(undefined, {
    query: { staleTime: 60_000 },
  });

  const boards = useMemo(
    () => (boardsQuery.data?.status === 200 ? boardsQuery.data.data.items ?? [] : []),
    [boardsQuery.data],
  );

  return (
    <DashboardPageLayout
      signedOut={{
        message: "Sign in to view your daily briefing.",
        forceRedirectUrl: "/assistant/briefing",
        signUpForceRedirectUrl: "/assistant/briefing",
      }}
      title={
        <div className="flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-emerald-600" />
          <span>Daily Briefing</span>
        </div>
      }
      description="Overview of pending approvals and blocked tasks across all projects."
    >
      {boardsQuery.isLoading ? (
        <div className="flex items-center gap-2 text-slate-500 py-8">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading boards…
        </div>
      ) : boards.length === 0 ? (
        <div className="text-slate-400 py-8 text-center">No projects found.</div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="h-4 w-4 text-amber-500" />
                Pending Approvals &amp; Blocked Tasks
              </CardTitle>
            </CardHeader>
            <CardContent>
              {boards.map((board) => (
                <BoardApprovalRow key={board.id} board={board} />
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </DashboardPageLayout>
  );
}
