"use client";

import { PermissionsProvider } from "@/components/auth/permissions-provider";
import type { OperatorRole, Permission } from "@/lib/auth/permissions";
import { Sidebar } from "./sidebar";

export function DashboardShell({
  children,
  authRequired,
  role,
  permissions,
}: {
  children: React.ReactNode;
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
        <main className="min-w-0 flex-1 overflow-auto">{children}</main>
      </div>
    </PermissionsProvider>
  );
}
