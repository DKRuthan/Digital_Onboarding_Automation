"use client";

import { PermissionsProvider } from "@/components/auth/permissions-provider";
import type { OperatorRole, Permission } from "@/lib/auth/permissions";
import { DemoBanner } from "./demo-banner";
import { Sidebar } from "./sidebar";

export function DashboardShell({
  children,
  authStatusNote,
  authRequired,
  role,
  permissions,
}: {
  children: React.ReactNode;
  authStatusNote?: React.ReactNode;
  authRequired: boolean;
  role: OperatorRole | null;
  permissions: Permission[];
}) {
  return (
    <PermissionsProvider
      authRequired={authRequired}
      role={role}
      permissions={permissions}
    >
      <div className="flex min-h-screen flex-col bg-slate-50 lg:flex-row">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <DemoBanner authStatusNote={authStatusNote} />
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </PermissionsProvider>
  );
}
