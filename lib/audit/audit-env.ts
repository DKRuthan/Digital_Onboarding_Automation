import { isEnvFlagEnabled } from "@/lib/auth/session";

const FALLBACK_WORKSPACE_ID = "ws_unconfigured";

/** True when AUDIT_ENABLED is explicitly "true". Default false. */
export function isAuditEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isEnvFlagEnabled(env.AUDIT_ENABLED);
}

export function isAuditDatabaseConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(env.DATABASE_URL?.trim());
}

/** True when audit writes would attempt a DB insert. */
export function shouldPersistAudit(env: NodeJS.ProcessEnv = process.env): boolean {
  return isAuditEnabled(env) && isAuditDatabaseConfigured(env);
}

/**
 * Workspace scope for audit rows — from server env only, never hardcoded in app logic.
 */
export function getDefaultWorkspaceId(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.DEFAULT_WORKSPACE_ID?.trim();
  return configured || FALLBACK_WORKSPACE_ID;
}
