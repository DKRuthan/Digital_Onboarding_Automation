import { NextResponse } from "next/server";
import {
  authContextFromSuccess,
  recordApiEnvGateBlocked,
  recordApiPermissionDenied,
  recordApiValidationBlocked,
  recordInternalSendAttempt,
  recordInternalSendOutcome,
} from "@/lib/audit/api-route-audit";
import { requireApiPermission } from "@/lib/auth/api-auth";
import type { InternalSendPayload } from "@/lib/internal-send";
import { validateInternalSendRequest } from "@/lib/internal-send";
import { sendInternalAlertViaSendGrid } from "@/lib/sendgrid-internal";
import {
  INTERNAL_SEND_API_DISABLED_ERROR,
  isInternalSendApiEnabled,
  requireSendGridEnv,
} from "@/lib/sendgrid-env";

function internalSendAttemptMetadata(
  body: Partial<InternalSendPayload>,
): Record<string, unknown> {
  return {
    action_id: body.action_id ?? null,
    template_name: body.template_name ?? null,
    action_status: body.action_status ?? null,
    schedule_status: body.schedule_status ?? null,
    conflict_status: body.conflict_status ?? null,
    recipient_type_label: body.contact_role ?? null,
  };
}

/**
 * Approved internal/DAM alerts only.
 * Customer-facing email must use a future dedicated route with auth.
 */
export async function POST(request: Request) {
  const permission = "send_internal_alert" as const;
  const authResult = await requireApiPermission(permission);
  if (!authResult.ok) {
    recordApiPermissionDenied(request, permission, authResult);
    return authResult.response;
  }

  const auth = authContextFromSuccess(authResult);

  if (!isInternalSendApiEnabled()) {
    recordApiEnvGateBlocked(
      request,
      permission,
      auth,
      "INTERNAL_SEND_API_ENABLED",
    );
    return NextResponse.json(
      { success: false, error: INTERNAL_SEND_API_DISABLED_ERROR },
      { status: 403 },
    );
  }

  let body: InternalSendPayload;
  try {
    body = (await request.json()) as InternalSendPayload;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal send failed";
    recordApiValidationBlocked(request, permission, auth, {
      reason_code: "invalid_json",
    });
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }

  const attemptMeta = internalSendAttemptMetadata(body);

  let env;
  try {
    env = requireSendGridEnv();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal send failed";
    recordInternalSendOutcome(
      request,
      auth,
      "send.internal.error",
      "error",
      {
        ...attemptMeta,
        error_message: message.slice(0, 200),
      },
    );
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }

  const validation = validateInternalSendRequest(body, {
    damAlertEmail: env.damAlertEmail,
    internalEmailDomain: env.internalEmailDomain,
  });

  if (!validation.ok) {
    recordApiValidationBlocked(request, permission, auth, {
      ...attemptMeta,
      reason_code: "business_validation",
      validation_message: validation.error.slice(0, 200),
    });
    return NextResponse.json(
      { success: false, error: validation.error },
      { status: 400 },
    );
  }

  recordInternalSendAttempt(request, auth, attemptMeta);

  try {
    const result = await sendInternalAlertViaSendGrid(body);

    const successAction = result.dryRun
      ? "send.internal.dry_run"
      : "send.internal.success";
    recordInternalSendOutcome(
      request,
      auth,
      successAction,
      "success",
      {
        ...attemptMeta,
        dry_run: result.dryRun,
        send_mode: result.sendMode,
        routing_reason_code: result.routingReason,
      },
      result.sendMode,
    );

    return NextResponse.json({
      success: true,
      deliverTo: result.deliverTo,
      subject: result.subject,
      routingReason: result.routingReason,
      sendMode: result.sendMode,
      dryRun: result.dryRun,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal send failed";

    recordInternalSendOutcome(
      request,
      auth,
      "send.internal.error",
      "error",
      {
        ...attemptMeta,
        error_message: message.slice(0, 200),
      },
    );

    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
