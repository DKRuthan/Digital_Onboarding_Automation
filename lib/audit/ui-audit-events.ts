/**
 * Phase J-6D UI-origin audit action allowlist and permission map.
 * UI events are non-authoritative until Phase I server-side persistence.
 */

import type { AuditResult } from "@/lib/audit/audit-types";
import type { Permission } from "@/lib/auth/permissions";

export const UI_AUDIT_ACTIONS = [
  "data.upload.validate",
  "data.upload.apply",
  "data.excel_import.validate",
  "data.excel_import.apply",
  "data.demo.use",
  "data.demo.restore",
  "queue.refresh",
  "trigger.create",
  "trigger.edit",
  "trigger.duplicate",
  "trigger.enable",
  "trigger.disable",
  "trigger.reset_defaults",
  "trigger.test",
  "trigger.export_json",
  "template.create",
  "template.edit",
  "template.approve",
  "template.unapprove",
  "template.duplicate",
  "template.reset_defaults",
  "send.test.ui_click",
  "sequence.create",
  "sequence.edit",
  "sequence.duplicate",
  "sequence.reset_defaults",
  "enrollment.create",
  "enrollment.pause",
  "enrollment.resume",
  "enrollment.cancel",
  "enrollment.step_complete",
  "enrollment.step_skip",
  "queue.mark_reviewed",
  "queue.approve",
  "queue.skip",
  "queue.reset_status",
  "queue.preview_opened",
  "queue.sequence_step_complete",
  "queue.sequence_step_skip",
  "send.internal.ui_click",
  "send.simulated_log.created",
  "export.reports_csv",
  "export.customers_csv",
  "export.contacts_csv",
  "export.action_queue_csv",
  "export.triggers_json",
  "export.sequences_json",
] as const;

export type UiAuditAction = (typeof UI_AUDIT_ACTIONS)[number];

const UI_AUDIT_ACTION_SET = new Set<string>(UI_AUDIT_ACTIONS);

export function isAllowedUiAuditAction(action: string): action is UiAuditAction {
  return UI_AUDIT_ACTION_SET.has(action);
}

/** Fields the client must never supply — server stamps identity and source. */
export const CLIENT_FORBIDDEN_AUDIT_FIELDS = [
  "actor_user_id",
  "actorUserId",
  "actor_role",
  "actorRole",
  "workspace_id",
  "workspaceId",
  "auth_required",
  "authRequired",
  "created_at",
  "createdAt",
  "source",
] as const;

export const UI_AUDIT_MAX_BODY_BYTES = 8192;

export type UiAuditRequestBody = {
  action: UiAuditAction;
  targetType: string;
  targetId?: string;
  result?: AuditResult;
  metadata?: Record<string, unknown>;
};

const UI_AUDIT_PERMISSION_MAP: Record<UiAuditAction, Permission> = {
  "data.upload.validate": "upload_customer_data",
  "data.upload.apply": "upload_customer_data",
  "data.excel_import.validate": "upload_customer_data",
  "data.excel_import.apply": "upload_customer_data",
  "data.demo.use": "upload_customer_data",
  "data.demo.restore": "upload_customer_data",
  "queue.refresh": "upload_customer_data",
  "trigger.create": "create_triggers",
  "trigger.edit": "edit_triggers",
  "trigger.duplicate": "edit_triggers",
  "trigger.enable": "edit_triggers",
  "trigger.disable": "edit_triggers",
  "trigger.reset_defaults": "edit_triggers",
  "trigger.test": "edit_triggers",
  "trigger.export_json": "export_reports",
  "template.create": "edit_templates",
  "template.edit": "edit_templates",
  "template.approve": "edit_templates",
  "template.unapprove": "edit_templates",
  "template.duplicate": "edit_templates",
  "template.reset_defaults": "edit_templates",
  "send.test.ui_click": "send_test_email",
  "sequence.create": "manage_sequences",
  "sequence.edit": "manage_sequences",
  "sequence.duplicate": "manage_sequences",
  "sequence.reset_defaults": "manage_sequences",
  "enrollment.create": "manage_sequences",
  "enrollment.pause": "manage_sequences",
  "enrollment.resume": "manage_sequences",
  "enrollment.cancel": "manage_sequences",
  "enrollment.step_complete": "manage_sequences",
  "enrollment.step_skip": "manage_sequences",
  "queue.mark_reviewed": "approve_queue_actions",
  "queue.approve": "approve_queue_actions",
  "queue.skip": "approve_queue_actions",
  "queue.reset_status": "approve_queue_actions",
  "queue.preview_opened": "approve_queue_actions",
  "queue.sequence_step_complete": "approve_queue_actions",
  "queue.sequence_step_skip": "approve_queue_actions",
  "send.internal.ui_click": "send_internal_alert",
  "send.simulated_log.created": "approve_queue_actions",
  "export.reports_csv": "export_reports",
  "export.customers_csv": "export_reports",
  "export.contacts_csv": "export_reports",
  "export.action_queue_csv": "export_reports",
  "export.triggers_json": "export_reports",
  "export.sequences_json": "export_reports",
};

export function getUiAuditPermission(action: UiAuditAction): Permission {
  return UI_AUDIT_PERMISSION_MAP[action];
}

const VALID_RESULTS = new Set<AuditResult>([
  "success",
  "denied",
  "error",
  "blocked",
]);

export function hasForbiddenClientAuditFields(
  body: Record<string, unknown>,
): boolean {
  return CLIENT_FORBIDDEN_AUDIT_FIELDS.some((key) => key in body);
}

export function parseUiAuditRequestBody(
  raw: unknown,
): { ok: true; body: UiAuditRequestBody } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Invalid request body" };
  }

  const record = raw as Record<string, unknown>;

  if (hasForbiddenClientAuditFields(record)) {
    return { ok: false, error: "Client-supplied identity fields are not allowed" };
  }

  const action = record.action;
  if (typeof action !== "string" || !action.trim()) {
    return { ok: false, error: "Missing action" };
  }

  if (!isAllowedUiAuditAction(action)) {
    return { ok: false, error: "Unsupported audit action" };
  }

  const targetType = record.targetType;
  if (typeof targetType !== "string" || !targetType.trim()) {
    return { ok: false, error: "Missing targetType" };
  }

  const targetId = record.targetId;
  if (
    targetId !== undefined &&
    targetId !== null &&
    typeof targetId !== "string"
  ) {
    return { ok: false, error: "Invalid targetId" };
  }

  const result = record.result;
  if (result !== undefined) {
    if (typeof result !== "string" || !VALID_RESULTS.has(result as AuditResult)) {
      return { ok: false, error: "Invalid result" };
    }
  }

  const metadata = record.metadata;
  if (
    metadata !== undefined &&
    (typeof metadata !== "object" || metadata === null || Array.isArray(metadata))
  ) {
    return { ok: false, error: "Invalid metadata" };
  }

  return {
    ok: true,
    body: {
      action,
      targetType: targetType.trim(),
      targetId: typeof targetId === "string" ? targetId.trim() : undefined,
      result: result as AuditResult | undefined,
      metadata: metadata as Record<string, unknown> | undefined,
    },
  };
}

export function buildUiAuditMetadata(
  metadata?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    authoritative: false,
    origin: "client_ui",
    ...metadata,
  };
}
