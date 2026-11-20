/**
 * Phase J auth session helpers.
 * Safe when AUTH_ENABLED=false or Clerk env vars are empty (local/demo mode).
 */

export class AuthRequiredError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

export class AuthDisabledError extends Error {
  constructor(message = "Auth is disabled") {
    super(message);
    this.name = "AuthDisabledError";
  }
}

export function isEnvFlagEnabled(
  raw: string | undefined,
): boolean {
  return raw?.trim().toLowerCase() === "true";
}

/** True when AUTH_ENABLED is explicitly "true". */
export function isAuthEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isEnvFlagEnabled(env.AUTH_ENABLED);
}

/** True when both Clerk keys are non-empty. */
export function hasClerkConfig(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(
    env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() &&
      env.CLERK_SECRET_KEY?.trim(),
  );
}

/** Auth is active only when enabled and Clerk is configured. */
export function isClerkAuthActive(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isAuthEnabled(env) && hasClerkConfig(env);
}

/** Resolved at build time for optional client UI labels. */
export function getAuthStatusLabel(
  env: NodeJS.ProcessEnv = process.env,
): "disabled" | "misconfigured" | "enabled" {
  if (!isAuthEnabled(env)) return "disabled";
  if (!hasClerkConfig(env)) return "misconfigured";
  return "enabled";
}

/** Returns Clerk user id when auth is active; otherwise null. Never throws. */
export async function getAuthUserId(): Promise<string | null> {
  if (!isClerkAuthActive()) return null;

  try {
    const { auth } = await import("@clerk/nextjs/server");
    const { userId } = await auth();
    return userId ?? null;
  } catch {
    return null;
  }
}

/**
 * Requires an authenticated Clerk user when auth is active.
 * Placeholder for J-4 API protection — throws AuthRequiredError / AuthDisabledError.
 */
export async function requireAuthUserId(): Promise<string> {
  if (!isAuthEnabled()) {
    throw new AuthDisabledError();
  }

  if (!hasClerkConfig()) {
    throw new AuthRequiredError("Clerk is not configured");
  }

  const userId = await getAuthUserId();
  if (!userId) {
    throw new AuthRequiredError();
  }

  return userId;
}

/** Standard 401 JSON for route handlers (J-4). */
export function unauthorizedJsonResponse(
  error = "Unauthorized",
): Response {
  return Response.json({ success: false, error }, { status: 401 });
}
