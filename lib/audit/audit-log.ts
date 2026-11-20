import "server-only";

import { getAuditSql } from "@/lib/audit/audit-db";
import { getDefaultWorkspaceId, isAuditEnabled } from "@/lib/audit/audit-env";
import {
  isAllowedAuditAction,
  type AuditEventInput,
  type AuditSeverity,
} from "@/lib/audit/audit-types";
import { isAllowedUiAuditAction } from "@/lib/audit/ui-audit-events";
import { hashAuditValue, safeAuditMetadata } from "@/lib/audit/safe-audit-metadata";
import { isClerkAuthActive } from "@/lib/auth/session";

export { getDefaultWorkspaceId, isAuditEnabled } from "@/lib/audit/audit-env";

export type RequestAuditMetadata = {
  requestId: string | null;
  ipHash: string | null;
  userAgent: string | null;
};

function resolveActorRole(
  actorRole: string | null | undefined,
  authRequired: boolean,
): string {
  if (actorRole?.trim()) return actorRole.trim();
  return authRequired ? "Viewer" : "demo";
}

function logAuditWriteFailure(message: string, error?: unknown): void {
  if (error instanceof Error) {
    console.error(`[audit] ${message}:`, error.message);
    return;
  }
  console.error(`[audit] ${message}`);
}

/**
 * Extracts non-sensitive request context for audit rows.
 */
export function buildRequestAuditMetadata(
  request?: Request | null,
): RequestAuditMetadata {
  if (!request) {
    return { requestId: null, ipHash: null, userAgent: null };
  }

  const requestId =
    request.headers.get("x-request-id")?.trim() ||
    request.headers.get("x-vercel-id")?.trim() ||
    null;

  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim() ?? null;
  const ipHash = ip ? hashAuditValue(ip) : null;

  const userAgentRaw = request.headers.get("user-agent");
  const userAgent = userAgentRaw
    ? userAgentRaw.slice(0, 256)
    : null;

  return { requestId, ipHash, userAgent };
}

/**
 * Writes one append-only audit row. No-ops when audit is disabled or DB is missing.
 * Never throws — failures are logged to stderr only.
 */
export async function writeAuditLog(event: AuditEventInput): Promise<void> {
  if (!isAuditEnabled()) {
    return;
  }

  if (!isAllowedAuditAction(event.action) && !isAllowedUiAuditAction(event.action)) {
    logAuditWriteFailure(`disallowed action "${event.action}"`);
    return;
  }

  const sql = getAuditSql();
  if (!sql) {
    logAuditWriteFailure(
      "AUDIT_ENABLED=true but DATABASE_URL is missing or empty; skipping write",
    );
    return;
  }

  const authRequired = event.authRequired ?? isClerkAuthActive();
  const metadata = safeAuditMetadata(event.metadata);
  const workspaceId = event.workspaceId ?? getDefaultWorkspaceId();
  const actorRole = resolveActorRole(event.actorRole, authRequired);

  try {
    await sql`
      INSERT INTO audit_logs (
        workspace_id,
        actor_user_id,
        actor_role,
        action,
        target_type,
        target_id,
        result,
        metadata_json,
        source,
        severity,
        auth_required,
        permission,
        send_mode,
        request_id,
        ip_hash,
        user_agent
      ) VALUES (
        ${workspaceId},
        ${event.actorUserId ?? null},
        ${actorRole},
        ${event.action},
        ${event.targetType},
        ${event.targetId ?? null},
        ${event.result},
        ${metadata},
        ${event.source ?? "api"},
        ${event.severity ?? "info"},
        ${authRequired},
        ${event.permission ?? null},
        ${event.sendMode ?? null},
        ${event.requestId ?? null},
        ${event.ipHash ?? null},
        ${event.userAgent ?? null}
      )
    `;
  } catch (error) {
    logAuditWriteFailure("write failed", error);
  }
}

/** Security/denial events — severity defaults to security. */
export async function writeSecurityAuditLog(
  event: AuditEventInput,
): Promise<void> {
  const severity: AuditSeverity = event.severity ?? "security";
  await writeAuditLog({ ...event, severity });
}

/**
 * Fire-and-forget audit write for route handlers (J-6C).
 * Swallows promise rejections — writeAuditLog already catches internally.
 */
export function recordAuditLog(event: AuditEventInput): void {
  void writeAuditLog(event);
}

export function recordSecurityAuditLog(event: AuditEventInput): void {
  void writeSecurityAuditLog(event);
}
