"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  Inbox,
  LayoutGrid,
  MoreHorizontal,
} from "lucide-react";

import { useAuth } from "@/auth/clerk";
import { cn } from "@/lib/utils";
import { useInboxCount } from "@/lib/use-inbox-count";

export function MobileBottomNav() {
  const pathname = usePathname();
  const { isSignedIn } = useAuth();
  const inboxCount = useInboxCount(isSignedIn);

  const navItems = [
    { href: "/home", label: "Home", icon: BarChart3, match: "/home" },
    {
      href: "/inbox",
      label: "Inbox",
      icon: Inbox,
      match: "/inbox",
      count: inboxCount,
    },
    { href: "/boards", label: "Projects", icon: LayoutGrid, match: "/boards" },
    {
      href: "/activity",
      label: "Activity",
      icon: Activity,
      match: "/activity",
    },
    {
      href: "/settings",
      label: "More",
      icon: MoreHorizontal,
      match: "/settings",
    },
  ] as const;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-slate-200 bg-white md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
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
              "relative flex flex-col items-center gap-0.5 px-3 py-1 text-[10px] font-medium transition-colors",
              isActive
                ? "text-blue-600"
                : "text-slate-500 hover:text-slate-700",
            )}
          >
            <span className="relative">
              <item.icon className="h-5 w-5" />
              {"count" in item && item.count > 0 ? (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">
                  {item.count > 99 ? "99+" : item.count}
                </span>
              ) : null}
            </span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
