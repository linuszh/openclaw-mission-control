"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Diamond,
  Inbox,
  LayoutGrid,
  Settings,
  BarChart3,
} from "lucide-react";

import { ApiError } from "@/api/mutator";
import { useAuth, useUser } from "@/auth/clerk";
import { isLocalAuthMode } from "@/auth/localAuth";
import {
  type healthzHealthzGetResponse,
  useHealthzHealthzGet,
} from "@/api/generated/default/default";
import { cn } from "@/lib/utils";
import { useInboxCount } from "@/lib/use-inbox-count";

export function DashboardSidebar() {
  const pathname = usePathname();
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const localMode = isLocalAuthMode();
  const inboxCount = useInboxCount(isSignedIn);

  const healthQuery = useHealthzHealthzGet<healthzHealthzGetResponse, ApiError>(
    {
      query: {
        refetchInterval: 30_000,
        refetchOnMount: "always",
        retry: false,
      },
      request: { cache: "no-store" },
    },
  );

  const okValue = healthQuery.data?.data?.ok;
  const systemStatus: "unknown" | "operational" | "degraded" =
    okValue === true
      ? "operational"
      : okValue === false
        ? "degraded"
        : healthQuery.isError
          ? "degraded"
          : "unknown";
  const statusLabel =
    systemStatus === "operational"
      ? "sys: OK"
      : systemStatus === "unknown"
        ? "sys: …"
        : "sys: ERR";

  const avatarLabel = localMode
    ? "L"
    : (user?.id?.slice(0, 1).toUpperCase() ?? "U");

  const navItems = [
    { href: "/home", label: "Home", icon: BarChart3, match: "/home" },
    { href: "/inbox", label: "Inbox", icon: Inbox, match: "/inbox", count: inboxCount },
    { href: "/boards", label: "Projects", icon: LayoutGrid, match: "/boards" },
    { href: "/activity", label: "Activity", icon: Activity, match: "/activity" },
    { href: "/settings", label: "Settings", icon: Settings, match: "/settings" },
  ] as const;

  return (
    <aside
      className="hidden md:flex h-full w-64 shrink-0 flex-col border-r"
      style={{
        background: "var(--sidebar-bg)",
        borderColor: "var(--sidebar-border)",
      }}
    >
      {/* Logo lockup */}
      <div className="flex items-center px-4 py-5">
        <Diamond className="h-5 w-5 shrink-0 text-blue-500" />
        <span className="ml-2 text-sm font-semibold tracking-tight text-[color:var(--sidebar-text-active)]">
          OpenClaw
        </span>
      </div>

      <div className="flex-1 px-3">
        <nav className="space-y-0.5">
          {navItems.map((item) => {
            const isActive =
              item.match === "/home"
                ? pathname === "/home" || pathname === "/"
                : pathname.startsWith(item.match);
            return (
              <div key={item.href} className="relative">
                {isActive && (
                  <span className="pointer-events-none absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-blue-500" />
                )}
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-[color:var(--sidebar-active-bg)] text-[color:var(--sidebar-text-active)]"
                      : "text-[color:var(--sidebar-text)] hover:bg-[color:var(--sidebar-hover-bg)] hover:text-[color:var(--sidebar-text-active)]",
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {"count" in item && item.count > 0 ? (
                    <span
                      className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white"
                      style={{ background: "var(--sidebar-badge-bg)" }}
                    >
                      {item.count > 99 ? "99+" : item.count}
                    </span>
                  ) : null}
                </Link>
              </div>
            );
          })}
        </nav>
      </div>

      <div
        className="border-t p-4"
        style={{ borderColor: "var(--sidebar-border)" }}
      >
        <div
          className="flex items-center gap-2 text-xs"
          style={{ color: "var(--sidebar-text)" }}
        >
          <span
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              systemStatus === "operational" && "bg-emerald-500",
              systemStatus === "degraded" && "bg-rose-500",
              systemStatus === "unknown" && "bg-slate-500",
            )}
          />
          <span className="flex-1 truncate">{statusLabel}</span>
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-600 text-[10px] font-bold text-white">
            {avatarLabel}
          </span>
        </div>
      </div>
    </aside>
  );
}
