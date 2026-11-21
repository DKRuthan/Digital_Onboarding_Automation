import type { InternalSendPayload } from "./internal-send";

export const INTERNAL_ALERT_SUBJECT_PREFIX = "[Digital Onboarding Alert]";

export interface ComposedInternalAlert {
  subject: string;
  body: string;
}

export function composeInternalAlert(
  payload: InternalSendPayload,
  deliverTo: string,
  routingReason: string,
  sendMode: "dry_run" | "live",
): ComposedInternalAlert {
  const subject = payload.subject.startsWith(INTERNAL_ALERT_SUBJECT_PREFIX)
    ? payload.subject
    : `${INTERNAL_ALERT_SUBJECT_PREFIX} ${payload.issue} — ${payload.customer_name}`;

  const body = [
    "——— INTERNAL DAM ALERT ———",
    `Send mode: ${sendMode === "dry_run" ? "DRY RUN (no email delivered)" : "LIVE"}`,
    "This alert is for the operations team.",
    "",
    "——— ALERT DETAILS ———",
    `Customer name: ${payload.customer_name}`,
    `Issue: ${payload.issue}`,
    `Reason: ${payload.issue}`,
    `Owner: ${payload.owner}`,
    `Recommended next action: ${payload.recommended_action}`,
    `Source action ID: ${payload.action_id}`,
    `Template: ${payload.template_name}`,
    "",
    "——— ROUTING ———",
    `Queue recipient: ${payload.recipient}`,
    `Resolved deliver-to: ${deliverTo}`,
    `Routing reason: ${routingReason}`,
    "",
    "——— MESSAGE ———",
    "",
    payload.body,
  ].join("\n");

  return { subject, body };
}
