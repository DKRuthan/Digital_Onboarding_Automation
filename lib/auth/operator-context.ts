import { resolveOperatorRole } from "@/lib/auth/api-auth";
import {
  getDemoPermissions,
  getPermissionsForRole,
  type OperatorRole,
  type Permission,
} from "@/lib/auth/permissions";
import { isClerkAuthActive } from "@/lib/auth/session";

export type EffectivePermissionsContext = {
  authRequired: boolean;
  role: OperatorRole | null;
  permissions: Permission[];
};

/**
 * Resolves UI permissions for the current dashboard session.
 * Auth off → demo/operator permissions. Auth on → role from Clerk metadata.
 */
export async function getEffectivePermissionsForSession(): Promise<EffectivePermissionsContext> {
  if (!isClerkAuthActive()) {
    return {
      authRequired: false,
      role: null,
      permissions: getDemoPermissions(),
    };
  }

  const role = await resolveOperatorRole();
  return {
    authRequired: true,
    role,
    permissions: getPermissionsForRole(role),
  };
}
