"use client";

import Link from "next/link";
import { Sparkles, Inbox, MessageSquare, ClipboardList, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";

export default function AssistantHubPage() {
  return (
    <DashboardPageLayout
      signedOut={{
        message: "Sign in to access your Personal Assistant.",
        forceRedirectUrl: "/assistant",
        signUpForceRedirectUrl: "/assistant",
      }}
      title={
        <div className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-blue-600" />
          <span>Personal Assistant</span>
        </div>
      }
      description="Unify your communications and task triage."
    >
      <div className="container mx-auto py-2 px-0">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Link href="/assistant/inbox">
          <Card className="hover:bg-slate-50 transition-colors cursor-pointer h-full border-2 border-transparent hover:border-blue-200">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Inbox className="h-5 w-5 text-blue-500" />
                <CardTitle>Email Triage</CardTitle>
              </div>
              <CardDescription>
                AI-powered inbox triage and summarization. Unify your communications.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-slate-500">
                View latest synced emails and convert them into project tasks with one click.
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/assistant/chat">
          <Card className="hover:bg-slate-50 transition-colors cursor-pointer h-full border-2 border-transparent hover:border-purple-200">
            <CardHeader>
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-purple-500" />
                <CardTitle>Chat Logic</CardTitle>
              </div>
              <CardDescription>
                Conversational interface for your projects.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-slate-500">
                Directly interact with the Gatekeeper to manage your projects via chat.
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/assistant/briefing">
          <Card className="hover:bg-slate-50 transition-colors cursor-pointer h-full border-2 border-transparent hover:border-emerald-200">
            <CardHeader>
              <div className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-emerald-500" />
                <CardTitle>Daily Briefing</CardTitle>
              </div>
              <CardDescription>
                Your automated morning report.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-slate-500">
                Summarized view of pending approvals, blocked tasks, and project progress.
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="mt-12">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-slate-400" />
          System Insights
        </h2>
        <div className="bg-slate-50 rounded-xl p-8 border border-slate-200 text-center">
          <p className="text-slate-500 max-w-md mx-auto">
            The Personal Assistant is being built to bridge the gap between your communications and your work. 
            Connect your email accounts to start triaging.
          </p>
        </div>
      </div>
      </div>
    </DashboardPageLayout>
  );
}
