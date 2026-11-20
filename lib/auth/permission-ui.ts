import {
  getDemoPermissions,
  getPermissionsForRole,
  roleHasPermission,
  type OperatorRole,
  type Permission,
} from "@/lib/auth/permissions";

export function permissionDeniedTitle(permission: Permission): string {
  return `Requires ${permission} permission`;
}

export function permissionsInclude(
  permissions: readonly Permission[],
  permission: Permission,
): boolean {
  return permissions.includes(permission);
}

export function gateByPermission(
  can: boolean,
  permission: Permission,
  otherwiseDisabled = false,
): { disabled: boolean; title?: string } {
  if (!can) {
    return { disabled: true, title: permissionDeniedTitle(permission) };
  }
  if (otherwiseDisabled) {
    return { disabled: true };
  }
  return { disabled: false };
}

/** Pure helper for verify scripts — mirrors role matrix from permissions.ts. */
export function canRolePerform(
  role: OperatorRole,
  permission: Permission,
): boolean {
  return roleHasPermission(role, permission);
}

/** Resolves effective permissions for auth-on/off without a Clerk session. */
export function getEffectivePermissionsForAuthState(
  authRequired: boolean,
  role: OperatorRole | null,
): Permission[] {
  if (!authRequired) {
    return getDemoPermissions();
  }
  return getPermissionsForRole(role ?? "Viewer");
}
