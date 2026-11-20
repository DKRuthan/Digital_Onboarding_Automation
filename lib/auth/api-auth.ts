import { NextResponse } from "next/server";
import type { OperatorRole, Permission } from "@/lib/auth/permissions";
import {
  getDemoPermissions,
  getPermissionsForRole,
  normalizeOperatorRole,
  roleHasPermission,
} from "@/lib/auth/permissions";
import { getAuthUserId, isClerkAuthActive } from "@/lib/auth/session";

export type RequireApiSessionSuccess = {
  ok: true;
  authRequired: boolean;
  userId: string | null;
};

export type RequireApiSessionFailure = {
  ok: false;
  response: NextResponse;
};

export type RequireApiSessionResult =
  | RequireApiSessionSuccess
  | RequireApiSessionFailure;

export type RequireApiPermissionSuccess = {
  ok: true;
  authRequired: boolean;
  userId: string | null;
  role: OperatorRole | null;
  permissions: Permission[];
};

export type RequireApiPermissionFailure = {
  ok: false;
  response: NextResponse;
  reason: "unauthorized" | "forbidden";
  permission: Permission;
  userId: string | null;
  role: OperatorRole | null;
  authRequired: boolean;
};

export type RequireApiPermissionResult =
  | RequireApiPermissionSuccess
  | RequireApiPermissionFailure;

/** True when API routes must enforce a Clerk session (AUTH_ENABLED + Clerk keys). */
export function isApiAuthRequired(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isClerkAuthActive(env);
}

/** Standard 401 JSON for protected API routes. */
export function unauthorizedResponse(): NextResponse {
  return NextResponse.json(
    { success: false, error: "Unauthorized" },
    { status: 401 },
  );
}

/** Standard 403 JSON when session is valid but permission is denied. */
export function forbiddenResponse(): NextResponse {
  return NextResponse.json(
    { success: false, error: "Forbidden" },
    { status: 403 },
  );
}

/**
 * Resolves operator role from Clerk publicMetadata.role when auth is active.
 * Missing/invalid values fall back to Viewer.
 */
export async function resolveOperatorRole(): Promise<OperatorRole> {
  if (!isClerkAuthActive()) {
    return "Viewer";
  }

  try {
    const { currentUser } = await import("@clerk/nextjs/server");
    const user = await currentUser();
    return normalizeOperatorRole(user?.publicMetadata?.role);
  } catch {
    return "Viewer";
  }
}

/**
 * Ensures an authenticated session when API auth is required.
 * When auth is disabled, returns ok with authRequired=false (no throw).
 */
export async function requireApiSession(): Promise<RequireApiSessionResult> {
  if (!isApiAuthRequired()) {
    return { ok: true, authRequired: false, userId: null };
  }

  const userId = await getAuthUserId();
  if (!userId) {
    return { ok: false, response: unauthorizedResponse() };
  }

  return { ok: true, authRequired: true, userId };
}

/**
 * Session + RBAC permission check for API route handlers.
 * When auth is disabled, skips session/permission checks and returns demo permissions.
 */
export async function requireApiPermission(
  permission: Permission,
): Promise<RequireApiPermissionResult> {
  if (!isApiAuthRequired()) {
    return {
      ok: true,
      authRequired: false,
      userId: null,
      role: null,
      permissions: getDemoPermissions(),
    };
  }

  const session = await requireApiSession();
  if (!session.ok) {
    return {
      ok: false,
      response: session.response,
      reason: "unauthorized",
      permission,
      userId: null,
      role: null,
      authRequired: true,
    };
  }

  const role = await resolveOperatorRole();
  const permissions = getPermissionsForRole(role);

  if (!roleHasPermission(role, permission)) {
    return {
      ok: false,
      response: forbiddenResponse(),
      reason: "forbidden",
      permission,
      userId: session.userId,
      role,
      authRequired: true,
    };
  }

  return {
    ok: true,
    authRequired: true,
    userId: session.userId,
    role,
    permissions,
  };
}
