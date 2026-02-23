"use client";

import { useState, useMemo } from "react";
import { MessageSquare, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { useListBoardsApiV1BoardsGet } from "@/api/generated/boards/boards";
import { useCreateTaskApiV1BoardsBoardIdTasksPost } from "@/api/generated/tasks/tasks";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
export default function ChatLogicPage() {
  const [message, setMessage] = useState("");
  const [selectedBoardId, setSelectedBoardId] = useState<string>("");
  const [statusMessage, setStatusMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const boardsQuery = useListBoardsApiV1BoardsGet(undefined, {
    query: { staleTime: 60_000 },
  });
  const boards = useMemo(
    () => (boardsQuery.data?.status === 200 ? boardsQuery.data.data.items ?? [] : []),
    [boardsQuery.data],
  );

  const createTaskMutation = useCreateTaskApiV1BoardsBoardIdTasksPost({
    mutation: {
      onSuccess: () => {
        setStatusMessage({ text: "Task created — message added to project inbox.", ok: true });
        setMessage("");
      },
      onError: () => {
        setStatusMessage({ text: "Failed to create task. Please try again.", ok: false });
      },
    },
  });

  const handleSubmit = () => {
    if (!message.trim() || !selectedBoardId) return;
    const lines = message.trim().split("\n");
    const title = lines[0].slice(0, 200);
    const description = message.trim();
    createTaskMutation.mutate({
      boardId: selectedBoardId,
      data: { title, description, status: "inbox" },
    });
  };

  return (
    <DashboardPageLayout
      signedOut={{
        message: "Sign in to use Chat Logic.",
        forceRedirectUrl: "/assistant/chat",
        signUpForceRedirectUrl: "/assistant/chat",
      }}
      title={
        <div className="flex items-center gap-2">
          <MessageSquare className="h-6 w-6 text-purple-600" />
          <span>Chat Logic</span>
        </div>
      }
      description="Send a message to a project's inbox. The board lead will pick it up at next heartbeat."
    >
      <div className="max-w-2xl space-y-4">
        {statusMessage && (
          <div className={`px-4 py-2 rounded-lg text-sm ${statusMessage.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"}`}>
            {statusMessage.text}
            <button className="ml-2 opacity-60 hover:opacity-100" onClick={() => setStatusMessage(null)}>✕</button>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Target project</label>
          <Select value={selectedBoardId} onValueChange={setSelectedBoardId}>
            <SelectTrigger className="w-full">
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
          <label className="block text-sm font-medium text-slate-700 mb-1">Message</label>
          <Textarea
            placeholder="Describe the task or instruction…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            className="resize-none"
          />
          <p className="text-xs text-slate-400 mt-1">First line becomes the task title.</p>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={!message.trim() || !selectedBoardId || createTaskMutation.isPending}
          className="gap-2"
        >
          {createTaskMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Send to inbox
        </Button>
      </div>
    </DashboardPageLayout>
  );
}
