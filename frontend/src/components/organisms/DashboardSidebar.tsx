"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  Inbox,
  LayoutGrid,
  Settings,
} from "lucide-react";

import { ApiError } from "@/api/mutator";
import { useAuth } from "@/auth/clerk";
import {
  type healthzHealthzGetResponse,
  useHealthzHealthzGet,
} from "@/api/generated/default/default";
import { cn } from "@/lib/utils";
import { useInboxCount } from "@/lib/use-inbox-count";

export function DashboardSidebar() {
  const pathname = usePathname();
  const { isSignedIn } = useAuth();
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
      ? "All systems operational"
      : systemStatus === "unknown"
        ? "Status unavailable"
        : "System degraded";

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
      <div className="flex-1 px-3 py-5">
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive =
              item.match === "/home"
                ? pathname === "/home" || pathname === "/"
                : pathname.startsWith(item.match);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "text-[color:var(--sidebar-text-active)]"
                    : "text-[color:var(--sidebar-text)] hover:text-[color:var(--sidebar-text-active)]",
                )}
                style={{
                  background: isActive
                    ? "var(--sidebar-active-bg)"
                    : undefined,
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background =
                      "var(--sidebar-hover-bg)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = "";
                  }
                }}
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
              "h-2 w-2 rounded-full shrink-0",
              systemStatus === "operational" && "bg-emerald-500",
              systemStatus === "degraded" && "bg-rose-500",
              systemStatus === "unknown" && "bg-slate-500",
            )}
          />
          {statusLabel}
        </div>
      </div>
    </aside>
  );
}
