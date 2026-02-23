import type { ReactNode } from "react";

// Settings pages each render DashboardPageLayout which includes DashboardShell.
// This layout is a transparent passthrough — no additional wrapping needed.
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return children;
}
