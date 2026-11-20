import { NextResponse } from "next/server";
import {
  authContextFromSuccess,
  recordApiEnvGateBlocked,
  recordApiPermissionDenied,
  recordApiValidationBlocked,
  recordTestSendAttempt,
  recordTestSendOutcome,
} from "@/lib/audit/api-route-audit";
import { requireApiPermission } from "@/lib/auth/api-auth";
import {
  REDACTED_TEST_RECIPIENT,
  TEST_SEND_API_DISABLED_ERROR,
  isTestSendApiEnabled,
} from "@/lib/sendgrid-env";
import {
  sendTestEmailViaSendGrid,
  type SendTestEmailInput,
} from "@/lib/sendgrid-test";

const REQUIRED_FIELDS: (keyof SendTestEmailInput)[] = [
  "customer_name",
  "issue",
  "recommended_action",
  "intended_recipient",
  "template_name",
  "subject",
  "body",
];

/**
 * TEST MODE API — only sends to SENDGRID_TEST_TO_EMAIL.
 * Real sends to customers belong in a future /api/send-email route
 * after approval logic and auth are implemented.
 */
export async function POST(request: Request) {
  const permission = "send_test_email" as const;
  const authResult = await requireApiPermission(permission);
  if (!authResult.ok) {
    recordApiPermissionDenied(request, permission, authResult);
    return authResult.response;
  }

  const auth = authContextFromSuccess(authResult);

  if (!isTestSendApiEnabled()) {
    recordApiEnvGateBlocked(
      request,
      permission,
      auth,
      "SENDGRID_TEST_SEND_ENABLED",
    );
    return NextResponse.json(
      { success: false, error: TEST_SEND_API_DISABLED_ERROR },
      { status: 403 },
    );
  }

  let attemptedTemplateName: string | null = null;

  try {
    const body = (await request.json()) as Partial<SendTestEmailInput>;

    for (const field of REQUIRED_FIELDS) {
      const value = body[field];
      if (typeof value !== "string" || !value.trim()) {
        recordApiValidationBlocked(request, permission, auth, {
          reason_code: "missing_field",
          field,
        });
        return NextResponse.json(
          { success: false, error: `Missing or invalid field: ${field}` },
          { status: 400 },
        );
      }
    }

    const input: SendTestEmailInput = {
      customer_name: body.customer_name!.trim(),
      issue: body.issue!.trim(),
      recommended_action: body.recommended_action!.trim(),
      intended_recipient: body.intended_recipient!.trim(),
      template_name: body.template_name!.trim(),
      subject: body.subject!.trim(),
      body: body.body!.trim(),
    };

    attemptedTemplateName = input.template_name;

    recordTestSendAttempt(request, auth, {
      template_name: input.template_name,
    });

    const result = await sendTestEmailViaSendGrid(input);

    recordTestSendOutcome(request, auth, "send.test.success", "success", {
      template_name: input.template_name,
      dry_run: false,
    });

    return NextResponse.json({
      success: true,
      testRecipient: REDACTED_TEST_RECIPIENT,
      subject: result.subject,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send test email";

    if (
      error instanceof SyntaxError ||
      (error instanceof Error && error.message.includes("JSON"))
    ) {
      recordApiValidationBlocked(request, permission, auth, {
        reason_code: "invalid_json",
      });
    } else {
      recordTestSendOutcome(request, auth, "send.test.error", "error", {
        template_name: attemptedTemplateName,
        error_message: message.slice(0, 200),
      });
    }

    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
