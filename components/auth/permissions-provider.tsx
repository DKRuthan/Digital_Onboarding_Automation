"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  permissionsInclude,
} from "@/lib/auth/permission-ui";
import type { OperatorRole, Permission } from "@/lib/auth/permissions";

type PermissionsContextValue = {
  authRequired: boolean;
  role: OperatorRole | null;
  permissions: Permission[];
};

const PermissionsContext = createContext<PermissionsContextValue | null>(null);

export function PermissionsProvider({
  authRequired,
  role,
  permissions,
  children,
}: PermissionsContextValue & { children: ReactNode }) {
  const value = useMemo(
    () => ({ authRequired, role, permissions }),
    [authRequired, role, permissions],
  );

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions(): PermissionsContextValue {
  const context = useContext(PermissionsContext);
  if (!context) {
    throw new Error("usePermissions must be used within PermissionsProvider");
  }
  return context;
}

export function useCan(permission: Permission): boolean {
  const { permissions } = usePermissions();
  return permissionsInclude(permissions, permission);
}

export function useRole(): OperatorRole | null {
  return usePermissions().role;
}
