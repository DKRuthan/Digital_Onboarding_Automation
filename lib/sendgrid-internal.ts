import sgMail from "@sendgrid/mail";
import type { InternalSendPayload } from "./internal-send";
import { validateInternalSendRequest } from "./internal-send";
import { composeInternalAlert } from "./internal-alert-content";
import { requireSendGridEnv } from "./sendgrid-env";

export interface InternalSendResult {
  success: true;
  deliverTo: string;
  subject: string;
  routingReason: string;
  sendMode: "dry_run" | "live";
  dryRun: boolean;
}

/**
 * INTERNAL / DAM ALERTS ONLY — never sends to customer admin_email or user_email.
 *
 * Customer-facing sends require:
 * - POST /api/send-customer-email (not implemented)
 * - Stronger approval chain + authentication
 * - Explicit product sign-off
 */
export async function sendInternalAlertViaSendGrid(
  payload: InternalSendPayload,
): Promise<InternalSendResult> {
  const env = requireSendGridEnv();
  const validation = validateInternalSendRequest(payload, {
    damAlertEmail: env.damAlertEmail,
    internalEmailDomain: env.internalEmailDomain,
  });

  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const { subject, body } = composeInternalAlert(
    payload,
    validation.deliverTo,
    validation.routingReason,
    env.sendMode,
  );

  if (env.sendMode === "live") {
    sgMail.setApiKey(env.apiKey);
    await sgMail.send({
      to: validation.deliverTo,
      from: env.fromEmail,
      subject,
      text: body,
    });
  }

  return {
    success: true,
    deliverTo: validation.deliverTo,
    subject,
    routingReason: validation.routingReason,
    sendMode: env.sendMode,
    dryRun: env.sendMode === "dry_run",
  };
}
