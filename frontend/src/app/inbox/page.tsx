"use client";

export const dynamic = "force-dynamic";

import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { SignedIn, SignedOut, SignInButton, useAuth } from "@/auth/clerk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  Sparkles,
  XCircle,
} from "lucide-react";

import type { ApiError } from "@/api/mutator";
import {
  listApprovalsApiV1BoardsBoardIdApprovalsGet,
  updateApprovalApiV1BoardsBoardIdApprovalsApprovalIdPatch,
} from "@/api/generated/approvals/approvals";
import { useListBoardsApiV1BoardsGet } from "@/api/generated/boards/boards";
import {
  useListEmailsApiV1EmailsGet,
  useConvertEmailToTaskApiV1EmailsEmailIdConvertPost,
  useSummarizeEmailApiV1EmailsEmailIdSummarizePost,
} from "@/api/generated/emails/emails";
import type { ApprovalRead, BoardRead } from "@/api/generated/model";
import type { EmailMessageRead } from "@/api/generated/model/emailMessageRead";
import { BoardApprovalsPanel } from "@/components/BoardApprovalsPanel";
import { DashboardSidebar } from "@/components/organisms/DashboardSidebar";
import { MobileBottomNav } from "@/components/organisms/MobileBottomNav";
import { DashboardShell } from "@/components/templates/DashboardShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Approvals data hook ────────────────────────────────────────────────────

type GlobalApprovalsData = {
  approvals: ApprovalRead[];
  warnings: string[];
};

function useGlobalApprovals(
  isSignedIn: boolean | null | undefined,
  boards: BoardRead[],
) {
  const boardIdsKey = useMemo(() => {
    const ids = boards.map((b) => b.id);
    ids.sort();
    return ids.join(",");
  }, [boards]);

  const key = useMemo(
    () => ["approvals", "global", boardIdsKey] as const,
    [boardIdsKey],
  );

  const query = useQuery<GlobalApprovalsData, ApiError>({
    queryKey: key,
    enabled: Boolean(isSignedIn && boards.length > 0),
    refetchInterval: 15_000,
    refetchOnMount: "always",
    retry: false,
    queryFn: async () => {
      const results = await Promise.allSettled(
        boards.map(async (board) => {
          const response = await listApprovalsApiV1BoardsBoardIdApprovalsGet(
            board.id,
            { limit: 200 },
            { cache: "no-store" },
          );
          if (response.status !== 200) {
            throw new Error(
              `Failed to load approvals for ${board.name} (status ${response.status}).`,
            );
          }
          return { boardId: board.id, approvals: response.data.items ?? [] };
        }),
      );
      const approvals: ApprovalRead[] = [];
      const warnings: string[] = [];
      for (const result of results) {
        if (result.status === "fulfilled") {
          approvals.push(...result.value.approvals);
        } else {
          warnings.push(result.reason?.message ?? "Unable to load approvals.");
        }
      }
      return { approvals, warnings };
    },
  });

  return { query, key };
}

// ─── Email detail dialog ─────────────────────────────────────────────────────

function EmailDetailDialog({
  email,
  open,
  onOpenChange,
  boards,
}: {
  email: EmailMessageRead | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  boards: BoardRead[];
}) {
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [convertBoardId, setConvertBoardId] = useState("");
  const [convertTitle, setConvertTitle] = useState("");
  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    ok: boolean;
  } | null>(null);

  const convertMutation = useConvertEmailToTaskApiV1EmailsEmailIdConvertPost({
    mutation: {
      onSuccess: () => {
        setStatusMessage({ text: "Task created from email.", ok: true });
        setConvertDialogOpen(false);
        setConvertBoardId("");
        setConvertTitle("");
      },
      onError: () => {
        setStatusMessage({
          text: "Failed to convert email to task.",
          ok: false,
        });
      },
    },
  });

  const summarizeMutation = useSummarizeEmailApiV1EmailsEmailIdSummarizePost({
    mutation: {
      onSuccess: (data) => {
        const dispatched = (
          data.data as { dispatched?: boolean } | undefined
        )?.dispatched;
        setStatusMessage({
          text: dispatched
            ? "Summary requested — check your agent messages."
            : "No agent available to dispatch summary.",
          ok: Boolean(dispatched),
        });
      },
      onError: () => {
        setStatusMessage({ text: "Failed to request AI summary.", ok: false });
      },
    },
  });

  if (!email) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg leading-snug">
              {email.subject}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
              <span>From: {email.sender}</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(email.received_at).toLocaleString()}
              </span>
            </div>
            {statusMessage ? (
              <div
                className={`rounded-lg border px-3 py-2 text-sm ${statusMessage.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}
              >
                {statusMessage.text}
                <button
                  className="ml-2 opacity-60 hover:opacity-100"
                  onClick={() => setStatusMessage(null)}
                >
                  ✕
                </button>
              </div>
            ) : null}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed whitespace-pre-wrap text-slate-800">
              {email.body || "No body content."}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => summarizeMutation.mutate({ emailId: email.id })}
              disabled={summarizeMutation.isPending}
            >
              {summarizeMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3 text-amber-500" />
              )}
              AI Summary
            </Button>
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700"
              onClick={() => {
                setConvertTitle(email.subject);
                setConvertDialogOpen(true);
              }}
            >
              Convert to Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert to Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Target project
              </label>
              <Select value={convertBoardId} onValueChange={setConvertBoardId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a project…" />
                </SelectTrigger>
                <SelectContent>
                  {boards.map((board) => (
                    <SelectItem key={board.id} value={board.id}>
                      {board.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Task title
              </label>
              <Input
                value={convertTitle}
                onChange={(e) => setConvertTitle(e.target.value)}
                placeholder="Leave blank to use email subject"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConvertDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!convertBoardId) return;
                convertMutation.mutate({
                  emailId: email.id,
                  data: {
                    board_id: convertBoardId,
                    title: convertTitle || undefined,
                  },
                });
              }}
              disabled={!convertBoardId || convertMutation.isPending}
              className="gap-2"
            >
              {convertMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Create Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Email tab ────────────────────────────────────────────────────────────────

function EmailTab({ boards }: { boards: BoardRead[] }) {
  const [selectedEmail, setSelectedEmail] = useState<EmailMessageRead | null>(
    null,
  );
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  const emailsQuery = useListEmailsApiV1EmailsGet(
    {},
    { query: { refetchInterval: 60_000 } },
  );
  const emails =
    emailsQuery.data?.status === 200
      ? (emailsQuery.data.data.items ?? [])
      : [];
  const isLoading = emailsQuery.isLoading;

  const handleSelect = (email: EmailMessageRead) => {
    setSelectedEmail(email);
    setMobileDetailOpen(true);
  };

  return (
    <>
      <div className="flex h-[calc(100vh-220px)] min-h-[400px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* List pane */}
        <div className="flex w-full flex-col border-r border-slate-200 md:w-1/3">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 p-4">
            <span className="text-sm font-semibold text-slate-900">
              Messages
            </span>
            <Badge
              variant="outline"
              className="bg-blue-50 text-blue-700 border-blue-200"
            >
              {emails.length}
            </Badge>
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="space-y-4 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                ))}
              </div>
            ) : emails.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center p-8 text-center text-slate-400">
                <Mail className="mb-3 h-10 w-10 opacity-20" />
                <p className="text-sm">
                  No messages. Ensure your IMAP account is connected.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {emails.map((email) => (
                  <button
                    key={email.id}
                    type="button"
                    onClick={() => handleSelect(email)}
                    className={`w-full cursor-pointer p-4 text-left transition-colors hover:bg-blue-50 ${
                      selectedEmail?.id === email.id
                        ? "border-l-4 border-blue-600 bg-blue-50"
                        : ""
                    }`}
                  >
                    <div className="mb-1 flex items-start justify-between">
                      <span className="flex-1 truncate text-sm font-semibold text-slate-900">
                        {email.sender}
                      </span>
                      <span className="ml-2 shrink-0 text-[10px] font-medium uppercase text-slate-400">
                        {formatDistanceToNow(new Date(email.received_at), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                    <div className="mb-1 truncate text-sm font-medium text-slate-800">
                      {email.subject}
                    </div>
                    <div className="line-clamp-2 text-xs leading-relaxed text-slate-500">
                      {email.snippet || "No preview available."}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Detail pane — desktop only */}
        <div className="hidden flex-1 overflow-y-auto md:flex md:flex-col">
          {selectedEmail ? (
            <div className="flex h-full flex-col p-6">
              <div className="mb-4 shrink-0">
                <h2 className="mb-1 text-xl font-bold text-slate-900">
                  {selectedEmail.subject}
                </h2>
                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                  <span>From: {selectedEmail.sender}</span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(selectedEmail.received_at).toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-5 text-sm leading-relaxed whitespace-pre-wrap text-slate-800">
                {selectedEmail.body || "No body content."}
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center text-slate-300">
              <Mail className="mb-3 h-10 w-10 opacity-30" />
              <p className="text-sm text-slate-400">
                Select a message to read it
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Mobile full-screen email dialog */}
      <EmailDetailDialog
        email={selectedEmail}
        open={mobileDetailOpen}
        onOpenChange={setMobileDetailOpen}
        boards={boards}
      />
    </>
  );
}

// ─── Inner page (signed in) ───────────────────────────────────────────────────

function InboxInner() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") ?? "all";
  const [activeTab, setActiveTab] = useState(
    ["all", "approvals", "email"].includes(initialTab) ? initialTab : "all",
  );

  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();

  const boardsQuery = useListBoardsApiV1BoardsGet(undefined, {
    query: {
      enabled: Boolean(isSignedIn),
      refetchInterval: 30_000,
      refetchOnMount: "always",
      retry: false,
    },
    request: { cache: "no-store" },
  });

  const boards = useMemo(() => {
    if (boardsQuery.data?.status !== 200) return [];
    return boardsQuery.data.data.items ?? [];
  }, [boardsQuery.data]);

  const boardLabelById = useMemo(() => {
    const entries = boards.map((board: BoardRead) => [board.id, board.name]);
    return Object.fromEntries(entries) as Record<string, string>;
  }, [boards]);

  const { query: approvalsQuery, key: approvalsKey } = useGlobalApprovals(
    isSignedIn,
    boards,
  );

  const updateApprovalMutation = useMutation<
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
  });

  const approvals = useMemo(
    () => approvalsQuery.data?.approvals ?? [],
    [approvalsQuery.data],
  );
  const warnings = useMemo(
    () => approvalsQuery.data?.warnings ?? [],
    [approvalsQuery.data],
  );
  const errorText = approvalsQuery.error?.message ?? null;
  const combinedError = useMemo(() => {
    const parts: string[] = [];
    if (errorText) parts.push(errorText);
    if (warnings.length > 0) parts.push(warnings.join(" "));
    return parts.length > 0 ? parts.join(" ") : null;
  }, [errorText, warnings]);

  const handleDecision = useCallback(
    (approvalId: string, status: "approved" | "rejected") => {
      const approval = approvals.find((item) => item.id === approvalId);
      const boardId = approval?.board_id;
      if (!boardId) return;
      updateApprovalMutation.mutate(
        { boardId, approvalId, status },
        {
          onSuccess: (result) => {
            if (result.status !== 200) return;
            queryClient.setQueryData<GlobalApprovalsData>(
              approvalsKey,
              (prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  approvals: prev.approvals.map((item) =>
                    item.id === approvalId ? result.data : item,
                  ),
                };
              },
            );
          },
          onSettled: () => {
            queryClient.invalidateQueries({ queryKey: approvalsKey });
          },
        },
      );
    },
    [approvals, approvalsKey, queryClient, updateApprovalMutation],
  );

  const pendingApprovals = useMemo(
    () => approvals.filter((a) => a.status === "pending"),
    [approvals],
  );

  return (
    <main className="flex-1 overflow-y-auto bg-slate-50 pb-16 md:pb-0">
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-slate-900">
          Inbox
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Approvals and email triage in one place.
        </p>
      </div>

      <div className="p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="approvals" className="gap-1.5">
              Approvals
              {pendingApprovals.length > 0 ? (
                <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold text-white">
                  {pendingApprovals.length}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="email">Email</TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            <AllTab
              approvals={approvals}
              isLoading={boardsQuery.isLoading || approvalsQuery.isLoading}
              onDecision={handleDecision}
              boards={boards}
              boardLabelById={boardLabelById}
            />
          </TabsContent>

          <TabsContent value="approvals">
            <div className="h-[calc(100vh-220px)] min-h-[400px]">
              <BoardApprovalsPanel
                boardId="global"
                approvals={approvals}
                isLoading={boardsQuery.isLoading || approvalsQuery.isLoading}
                error={combinedError}
                onDecision={handleDecision}
                scrollable
                boardLabelById={boardLabelById}
              />
            </div>
          </TabsContent>

          <TabsContent value="email">
            <EmailTab boards={boards} />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

// ─── All tab ──────────────────────────────────────────────────────────────────

type AllTabProps = {
  approvals: ApprovalRead[];
  isLoading: boolean;
  onDecision: (approvalId: string, status: "approved" | "rejected") => void;
  boards: BoardRead[];
  boardLabelById: Record<string, string>;
};

function AllTab({
  approvals,
  isLoading,
  onDecision,
  boards,
  boardLabelById,
}: AllTabProps) {
  const [selectedEmail, setSelectedEmail] = useState<EmailMessageRead | null>(
    null,
  );
  const [emailDetailOpen, setEmailDetailOpen] = useState(false);

  const emailsQuery = useListEmailsApiV1EmailsGet(
    {},
    { query: { refetchInterval: 60_000 } },
  );
  const emails =
    emailsQuery.data?.status === 200
      ? (emailsQuery.data.data.items ?? [])
      : [];

  const pendingApprovals = useMemo(
    () => approvals.filter((a) => a.status === "pending"),
    [approvals],
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (pendingApprovals.length === 0 && emails.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white py-16 text-center">
        <CheckCircle2 className="mb-3 h-10 w-10 text-emerald-400" />
        <p className="text-sm font-medium text-slate-700">All caught up!</p>
        <p className="mt-1 text-xs text-slate-400">
          No pending approvals or emails.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {pendingApprovals.map((approval) => (
        <div
          key={approval.id}
          className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
        >
          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
            Approval
          </span>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">
              {approval.action_type}
            </p>
            {approval.board_id && boardLabelById[approval.board_id] ? (
              <p className="text-xs text-slate-500">
                {boardLabelById[approval.board_id]}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-1 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
              onClick={() => onDecision(approval.id, "approved")}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1 text-rose-700 border-rose-300 hover:bg-rose-50"
              onClick={() => onDecision(approval.id, "rejected")}
            >
              <XCircle className="h-3.5 w-3.5" />
              Reject
            </Button>
          </div>
        </div>
      ))}

      {emails.map((email) => (
        <button
          key={email.id}
          type="button"
          onClick={() => {
            setSelectedEmail(email);
            setEmailDetailOpen(true);
          }}
          className="flex w-full flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition-colors hover:bg-slate-50"
        >
          <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700">
            Email
          </span>
          <div className="flex-1 min-w-0">
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
        </button>
      ))}

      <EmailDetailDialog
        email={selectedEmail}
        open={emailDetailOpen}
        onOpenChange={setEmailDetailOpen}
        boards={boards}
      />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InboxPage() {
  return (
    <DashboardShell>
      <SignedOut>
        <div className="flex h-full flex-col items-center justify-center gap-4 rounded-2xl p-10 text-center">
          <p className="text-sm text-slate-500">Sign in to view your inbox.</p>
          <SignInButton
            mode="modal"
            forceRedirectUrl="/inbox"
            signUpForceRedirectUrl="/inbox"
          >
            <Button>Sign in</Button>
          </SignInButton>
        </div>
      </SignedOut>
      <SignedIn>
        <DashboardSidebar />
        <InboxInner />
        <MobileBottomNav />
      </SignedIn>
    </DashboardShell>
  );
}
