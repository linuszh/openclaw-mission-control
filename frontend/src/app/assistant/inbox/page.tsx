"use client";

import { useState } from "react";
import { useListEmailsApiV1EmailsGet } from "@/api/generated/emails/emails";
import {
  useConvertEmailToTaskApiV1EmailsEmailIdConvertPost,
  useSummarizeEmailApiV1EmailsEmailIdSummarizePost,
} from "@/api/generated/emails/emails";
import { useListBoardsApiV1BoardsGet } from "@/api/generated/boards/boards";
import { EmailMessageRead } from "@/api/generated/model/emailMessageRead";
import { Inbox, Mail, User, Clock, ChevronRight, Sparkles, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";

export default function EmailTriagePage() {
  const [selectedEmail, setSelectedEmail] = useState<EmailMessageRead | null>(null);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [convertBoardId, setConvertBoardId] = useState("");
  const [convertTitle, setConvertTitle] = useState("");
  const [statusMessage, setStatusMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const emailsQuery = useListEmailsApiV1EmailsGet({}, {
    query: { refetchInterval: 60_000 },
  });

  const boardsQuery = useListBoardsApiV1BoardsGet(undefined, {
    query: { staleTime: 60_000 },
  });

  const emails = emailsQuery.data?.status === 200 ? emailsQuery.data.data.items || [] : [];
  const boards = boardsQuery.data?.status === 200 ? boardsQuery.data.data.items ?? [] : [];
  const isLoading = emailsQuery.isLoading;

  const convertMutation = useConvertEmailToTaskApiV1EmailsEmailIdConvertPost({
    mutation: {
      onSuccess: () => {
        setStatusMessage({ text: "Task created from email.", ok: true });
        setConvertDialogOpen(false);
        setConvertBoardId("");
        setConvertTitle("");
      },
      onError: () => {
        setStatusMessage({ text: "Failed to convert email to task.", ok: false });
      },
    },
  });

  const summarizeMutation = useSummarizeEmailApiV1EmailsEmailIdSummarizePost({
    mutation: {
      onSuccess: (data) => {
        const dispatched = (data.data as { dispatched?: boolean } | undefined)?.dispatched;
        if (dispatched) {
          setStatusMessage({ text: "Summary requested — check your Gatekeeper messages.", ok: true });
        } else {
          setStatusMessage({ text: "No Gatekeeper available to dispatch summary.", ok: false });
        }
      },
      onError: () => {
        setStatusMessage({ text: "Failed to request AI summary.", ok: false });
      },
    },
  });

  const handleOpenConvert = (email: EmailMessageRead) => {
    setConvertTitle(email.subject);
    setConvertDialogOpen(true);
  };

  const handleConvertSubmit = () => {
    if (!selectedEmail || !convertBoardId) return;
    convertMutation.mutate({
      emailId: selectedEmail.id,
      data: {
        board_id: convertBoardId,
        title: convertTitle || undefined,
      },
    });
  };

  const handleSummarize = (email: EmailMessageRead) => {
    summarizeMutation.mutate({ emailId: email.id });
  };

  return (
    <DashboardPageLayout
      signedOut={{
        message: "Sign in to access your Inbox.",
        forceRedirectUrl: "/assistant/inbox",
        signUpForceRedirectUrl: "/assistant/inbox",
      }}
      title={
        <div className="flex items-center gap-2">
          <Inbox className="h-6 w-6 text-blue-600" />
          <span>Email Triage</span>
        </div>
      }
      description="Process and convert emails into actionable tasks."
      contentClassName="p-0 h-[calc(100vh-140px)]"
    >
      {statusMessage && (
        <div className={`mx-8 mt-4 px-4 py-2 rounded-lg text-sm ${statusMessage.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"}`}>
          {statusMessage.text}
          <button className="ml-2 opacity-60 hover:opacity-100" onClick={() => setStatusMessage(null)}>✕</button>
        </div>
      )}
      <div className="flex h-full bg-slate-50 overflow-hidden rounded-xl border border-slate-200 shadow-sm mx-8 mb-8 mt-4">
        {/* Sidebar List */}
        <div className="w-1/3 border-r border-slate-200 bg-white flex flex-col h-full overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Inbox className="h-5 w-5 text-blue-600" />
              <h1 className="text-xl font-bold">Inbox</h1>
            </div>
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              {emails.length} Messages
            </Badge>
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                ))}
              </div>
            ) : emails.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8 text-center">
                <Mail className="h-12 w-12 mb-4 opacity-20" />
                <p>No messages found. Ensure your IMAP settings are correct.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {emails.map((email) => (
                  <div
                    key={email.id}
                    onClick={() => setSelectedEmail(email)}
                    className={`p-4 cursor-pointer hover:bg-blue-50 transition-colors ${
                      selectedEmail?.id === email.id ? "bg-blue-50 border-l-4 border-blue-600" : ""
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-semibold text-slate-900 truncate flex-1">{email.sender}</span>
                      <span className="text-[10px] text-slate-400 uppercase font-medium ml-2 shrink-0">
                        {formatDistanceToNow(new Date(email.received_at), { addSuffix: true })}
                      </span>
                    </div>
                    <div className="text-sm font-medium text-slate-800 truncate mb-1">{email.subject}</div>
                    <div className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                      {email.snippet || "No snippet available."}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Detail View */}
        <div className="flex-1 overflow-y-auto flex flex-col h-full">
          {selectedEmail ? (
            <div className="p-8 max-w-4xl mx-auto w-full h-full flex flex-col shrink-0">
              <div className="flex items-start justify-between mb-8 shrink-0">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 mb-2">{selectedEmail.subject}</h2>
                  <div className="flex items-center gap-4 text-sm text-slate-500">
                    <span className="flex items-center gap-1">
                      <User className="h-4 w-4" />
                      {selectedEmail.sender}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {new Date(selectedEmail.received_at).toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => handleSummarize(selectedEmail)}
                    disabled={summarizeMutation.isPending}
                  >
                    {summarizeMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 text-amber-500" />
                    )}
                    AI Summary
                  </Button>
                  <Button
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700"
                    onClick={() => handleOpenConvert(selectedEmail)}
                  >
                    Convert to Task
                  </Button>
                </div>
              </div>

              <Card className="flex-1 shadow-sm border-slate-200 overflow-hidden shrink-0 min-h-0 flex flex-col">
                <CardContent className="p-8 prose prose-slate max-w-none overflow-y-auto h-full shrink-0">
                  <div className="whitespace-pre-wrap text-slate-800 font-sans leading-relaxed">
                    {selectedEmail.body || "This message has no body content."}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-300">
              <div className="p-12 rounded-full bg-white shadow-sm mb-6 border border-slate-100">
                <ChevronRight className="h-12 w-12" />
              </div>
              <p className="text-lg font-medium text-slate-400">Select a message to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Convert to Task Dialog */}
      <Dialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert to Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Target project</label>
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
              <label className="block text-sm font-medium text-slate-700 mb-1">Task title</label>
              <Input
                value={convertTitle}
                onChange={(e) => setConvertTitle(e.target.value)}
                placeholder="Leave blank to use email subject"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConvertSubmit}
              disabled={!convertBoardId || convertMutation.isPending}
              className="gap-2"
            >
              {convertMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardPageLayout>
  );
}
