import "server-only";

import {
  buildRequestAuditMetadata,
  recordAuditLog,
  recordSecurityAuditLog,
} from "@/lib/audit/audit-log";
import type { AuditAction, AuditSeverity } from "@/lib/audit/audit-types";
import type {
  RequireApiPermissionFailure,
  RequireApiPermissionSuccess,
} from "@/lib/auth/api-auth";
import type { Permission } from "@/lib/auth/permissions";

type RouteAuthContext = {
  actorUserId: string | null;
  actorRole: string | null;
  authRequired: boolean;
};

function authContextFromSuccess(
  result: RequireApiPermissionSuccess,
): RouteAuthContext {
  return {
    actorUserId: result.userId,
    actorRole: result.role,
    authRequired: result.authRequired,
  };
}

function routePath(request: Request): string {
  return new URL(request.url).pathname;
}

/** Records 401 or 403 from requireApiPermission failure. */
export function recordApiPermissionDenied(
  request: Request,
  permission: Permission,
  failure: RequireApiPermissionFailure,
): void {
  const action: AuditAction =
    failure.reason === "forbidden"
      ? "auth.permission.denied"
      : "auth.session.denied";

  const reqMeta = buildRequestAuditMetadata(request);
  recordSecurityAuditLog({
    action,
    targetType: "api_route",
    targetId: routePath(request),
    result: "denied",
    permission,
    actorUserId: failure.userId ?? null,
    actorRole: failure.role ?? null,
    authRequired: failure.authRequired,
    requestId: reqMeta.requestId,
    ipHash: reqMeta.ipHash,
    userAgent: reqMeta.userAgent,
    metadata: {
      route: routePath(request),
      method: request.method,
      reason: failure.reason,
      required_permission: permission,
    },
  });
}

export function recordApiEnvGateBlocked(
  request: Request,
  permission: Permission,
  auth: RouteAuthContext,
  gateName: string,
): void {
  recordSecurityAuditLog({
    action: "api.env_gate.blocked",
    targetType: "api_route",
    targetId: routePath(request),
    result: "blocked",
    permission,
    actorUserId: auth.actorUserId,
    actorRole: auth.actorRole,
    authRequired: auth.authRequired,
    ...buildRequestAuditMetadata(request),
    metadata: {
      route: routePath(request),
      method: request.method,
      gate: gateName,
    },
  });
}

export function recordApiValidationBlocked(
  request: Request,
  permission: Permission,
  auth: RouteAuthContext,
  metadata: Record<string, unknown>,
): void {
  recordSecurityAuditLog({
    action: "api.validation.blocked",
    targetType: "api_route",
    targetId: routePath(request),
    result: "blocked",
    permission,
    actorUserId: auth.actorUserId,
    actorRole: auth.actorRole,
    authRequired: auth.authRequired,
    ...buildRequestAuditMetadata(request),
    metadata: {
      route: routePath(request),
      method: request.method,
      ...metadata,
    },
  });
}

export function recordConfigInternalSendRead(
  request: Request,
  auth: RequireApiPermissionSuccess,
  configFlags: {
    configured: boolean;
    sendMode: string;
    customerSendsEnabled: boolean;
    internalSendsEnabled: boolean;
    testSendEnabled: boolean;
    validationErrorCount: number;
  },
): void {
  recordAuditLog({
    action: "config.internal_send.read",
    targetType: "api_route",
    targetId: "/api/internal-send-config",
    result: "success",
    severity: "info",
    source: "api",
    permission: "view_dashboard",
    actorUserId: auth.userId,
    actorRole: auth.role,
    authRequired: auth.authRequired,
    ...buildRequestAuditMetadata(request),
    metadata: {
      route: "/api/internal-send-config",
      method: "GET",
      ...configFlags,
    },
  });
}

export function recordInternalSendAttempt(
  request: Request,
  auth: RouteAuthContext,
  metadata: Record<string, unknown>,
): void {
  recordAuditLog({
    action: "send.internal.attempt",
    targetType: "action_queue_item",
    targetId:
      typeof metadata.action_id === "string" ? metadata.action_id : null,
    result: "success",
    severity: "send",
    permission: "send_internal_alert",
    actorUserId: auth.actorUserId,
    actorRole: auth.actorRole,
    authRequired: auth.authRequired,
    ...buildRequestAuditMetadata(request),
    metadata: {
      route: "/api/send-approved-internal",
      method: "POST",
      ...metadata,
    },
  });
}

export function recordInternalSendOutcome(
  request: Request,
  auth: RouteAuthContext,
  action: Extract<
    AuditAction,
    "send.internal.dry_run" | "send.internal.success" | "send.internal.error"
  >,
  result: "success" | "error",
  metadata: Record<string, unknown>,
  sendMode?: string | null,
): void {
  recordAuditLog({
    action,
    targetType: "action_queue_item",
    targetId:
      typeof metadata.action_id === "string" ? metadata.action_id : null,
    result,
    severity: "send",
    permission: "send_internal_alert",
    sendMode: sendMode ?? null,
    actorUserId: auth.actorUserId,
    actorRole: auth.actorRole,
    authRequired: auth.authRequired,
    ...buildRequestAuditMetadata(request),
    metadata: {
      route: "/api/send-approved-internal",
      method: "POST",
      ...metadata,
    },
  });
}

export function recordTestSendAttempt(
  request: Request,
  auth: RouteAuthContext,
  metadata: Record<string, unknown>,
): void {
  recordAuditLog({
    action: "send.test.attempt",
    targetType: "email_template",
    targetId:
      typeof metadata.template_name === "string"
        ? metadata.template_name
        : null,
    result: "success",
    severity: "send",
    permission: "send_test_email",
    sendMode: "test",
    actorUserId: auth.actorUserId,
    actorRole: auth.actorRole,
    authRequired: auth.authRequired,
    ...buildRequestAuditMetadata(request),
    metadata: {
      route: "/api/send-test-email",
      method: "POST",
      ...metadata,
    },
  });
}

export function recordTestSendOutcome(
  request: Request,
  auth: RouteAuthContext,
  action: Extract<AuditAction, "send.test.success" | "send.test.error">,
  result: "success" | "error",
  metadata: Record<string, unknown>,
): void {
  recordAuditLog({
    action,
    targetType: "email_template",
    targetId:
      typeof metadata.template_name === "string"
        ? metadata.template_name
        : null,
    result,
    severity: "send" as AuditSeverity,
    permission: "send_test_email",
    sendMode: "test",
    actorUserId: auth.actorUserId,
    actorRole: auth.actorRole,
    authRequired: auth.authRequired,
    ...buildRequestAuditMetadata(request),
    metadata: {
      route: "/api/send-test-email",
      method: "POST",
      ...metadata,
    },
  });
}

export { authContextFromSuccess };
