"use client";

import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";

interface AuthProviderProps {
  children: ReactNode;
  /** When false, children render without Clerk (demo/local mode). */
  active: boolean;
  publishableKey: string;
}

export function AuthProvider({
  children,
  active,
  publishableKey,
}: AuthProviderProps) {
  if (!active || !publishableKey.trim()) {
    return <>{children}</>;
  }

  return (
    <ClerkProvider publishableKey={publishableKey.trim()}>
      {children}
    </ClerkProvider>
  );
}
