/**
 * Phase J-6 audit event types and J-6C API action allowlist.
 */

export type AuditResult = "success" | "denied" | "error" | "blocked";

export type AuditSource = "api" | "ui" | "system";

export type AuditSeverity = "info" | "security" | "send";

/** J-6C API / security actions — extend in J-6D for UI-origin events. */
export const AUDIT_ACTIONS = [
  "auth.session.denied",
  "auth.permission.denied",
  "api.env_gate.blocked",
  "api.validation.blocked",
  "config.internal_send.read",
  "send.internal.attempt",
  "send.internal.dry_run",
  "send.internal.success",
  "send.internal.error",
  "send.test.attempt",
  "send.test.success",
  "send.test.error",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

const AUDIT_ACTION_SET = new Set<string>(AUDIT_ACTIONS);

export function isAllowedAuditAction(action: string): action is AuditAction {
  return AUDIT_ACTION_SET.has(action);
}

export type AuditEventInput = {
  action: string;
  targetType: string;
  targetId?: string | null;
  result: AuditResult;
  metadata?: Record<string, unknown>;
  workspaceId?: string;
  actorUserId?: string | null;
  actorRole?: string | null;
  source?: AuditSource;
  severity?: AuditSeverity;
  authRequired?: boolean;
  permission?: string | null;
  sendMode?: string | null;
  requestId?: string | null;
  ipHash?: string | null;
  userAgent?: string | null;
};

export type AuditEventRow = {
  id: string;
  workspace_id: string;
  actor_user_id: string | null;
  actor_role: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  result: string;
  metadata_json: Record<string, unknown>;
  source: string;
  severity: string;
  auth_required: boolean;
  permission: string | null;
  send_mode: string | null;
  request_id: string | null;
  ip_hash: string | null;
  user_agent: string | null;
  created_at: string;
};
