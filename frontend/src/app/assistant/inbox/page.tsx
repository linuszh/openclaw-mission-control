"use client";

import { useListEmailsEmailsGet } from "@/api/generated/emails/emails";
import { EmailMessageRead } from "@/api/generated/model/emailMessageRead";
import { Inbox, Mail, User, Clock, ChevronRight, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function EmailTriagePage() {
  const [selectedEmail, setSelectedEmail] = useState<EmailMessageRead | null>(null);
  const emailsQuery = useListEmailsEmailsGet({
    query: {
      refetchInterval: 60_000,
    }
  });

  const emails = emailsQuery.data?.data?.items || [];
  const isLoading = emailsQuery.isLoading;

  return (
    <div className="flex h-[calc(100vh-64px)] bg-slate-50 overflow-hidden">
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
                <Button variant="outline" size="sm" className="gap-2">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  AI Summary
                </Button>
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
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
  );
}
