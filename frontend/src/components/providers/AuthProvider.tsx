"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { useState, useEffect, type ReactNode } from "react";

import { isLikelyValidClerkPublishableKey } from "@/auth/clerkKey";
import {
  clearLocalAuthToken,
  getLocalAuthToken,
  isLocalAuthMode,
} from "@/auth/localAuth";
import { LocalAuthLogin } from "@/components/organisms/LocalAuthLogin";

export function AuthProvider({ children }: { children: ReactNode }) {
  const localMode = isLocalAuthMode();
  const [mounted, setMounted] = useState(false);
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    if (!localMode) {
      clearLocalAuthToken();
    } else {
      setHasToken(!!getLocalAuthToken());
    }
    setMounted(true);
  }, [localMode]);

  if (localMode) {
    // Before mount (SSR + hydration): render children to avoid mismatch.
    // Children handle unauthorized state themselves via DashboardPageLayout.
    if (!mounted) return <>{children}</>;
    if (!hasToken) return <LocalAuthLogin />;
    return <>{children}</>;
  }

  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const afterSignOutUrl =
    process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_OUT_URL ?? "/";

  if (!isLikelyValidClerkPublishableKey(publishableKey)) {
    return <>{children}</>;
  }

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      afterSignOutUrl={afterSignOutUrl}
    >
      {children}
    </ClerkProvider>
  );
}
