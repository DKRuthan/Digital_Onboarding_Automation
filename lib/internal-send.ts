import type { ActionQueueItem, Customer, QueueConflictStatus } from "./types";
import { isQueueConflictClear } from "./types";
import { isSequenceCustomerFacingItem } from "./email-sequence-queue";
import { checkDuplicateRisk } from "./action-workflow";

export interface InternalSendCustomerContext {
  admin_email: string;
  user_email: string;
  owner: string;
  account_owner: string;
  last_email_sent_date: string;
}

export interface InternalSendEnvConfig {
  damAlertEmail: string;
  internalEmailDomain: string;
}

export interface InternalSendPayload {
  action_id: string;
  customer_name: string;
  issue: string;
  recommended_action: string;
  recipient: string;
  template_name: string;
  subject: string;
  body: string;
  action_status: string;
  /** Must be "due_now" — server rejects scheduled / not-due actions. */
  schedule_status?: string;
  /** Must be "clear" — server rejects active sequence/rule conflicts. */
  conflict_status?: QueueConflictStatus | string;
  conflict_reason?: string | null;
  enrollment_id?: string;
  sequence_key?: string;
  sequence_name?: string;
  sequence_step_number?: number;
  sequence_step_name?: string;
  contact_email?: string;
  contact_role?: string;
  admin_email: string;
  user_email: string;
  owner: string;
  account_owner: string;
  last_email_sent_date: string;
}

export interface InternalRecipientValidation {
  valid: boolean;
  error?: string;
  deliverTo?: string;
  routingReason?: string;
}

export interface InternalRoutingPreview {
  valid: true;
  deliverToLabel: string;
  routingReason: string;
}

export interface InternalRoutingPreviewError {
  valid: false;
  error: string;
}

export type InternalRoutingPreviewResult =
  | InternalRoutingPreview
  | InternalRoutingPreviewError;

/** Client-safe routing preview without exposing env email addresses. */
export function getInternalRoutingPreview(
  recipient: string,
  customer: InternalSendCustomerContext,
): InternalRoutingPreviewResult {
  const value = recipient.trim();
  if (!value) {
    return { valid: false, error: "Recipient is missing" };
  }

  if (isCustomerFacingRecipient(value, customer)) {
    return {
      valid: false,
      error: "Customer admin/user recipients are disabled. Internal/DAM only.",
    };
  }

  if (value.includes("@")) {
    return {
      valid: true,
      deliverToLabel: "Internal route configured",
      routingReason: "Direct internal email address",
    };
  }

  if (value === customer.owner) {
    return {
      valid: true,
      deliverToLabel: "Routed to DAM alert inbox",
      routingReason: `CSM owner "${value}" routed to DAM alert inbox`,
    };
  }

  if (value === customer.account_owner) {
    return {
      valid: true,
      deliverToLabel: "Routed to DAM alert inbox",
      routingReason: `Account owner "${value}" routed to DAM alert inbox`,
    };
  }

  return {
    valid: false,
    error: "Recipient is not an approved internal owner/DAM contact",
  };
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export function isCustomerFacingRecipient(
  recipient: string,
  customer: InternalSendCustomerContext,
): boolean {
  const value = normalize(recipient);
  return (
    value === normalize(customer.admin_email) ||
    value === normalize(customer.user_email)
  );
}

/** Client-safe eligibility check; server enforces domain/DAM env rules. */
export function isEligibleInternalRecipient(
  recipient: string,
  customer: InternalSendCustomerContext,
): boolean {
  const value = recipient.trim();
  if (!value || isCustomerFacingRecipient(value, customer)) return false;
  if (value.includes("@")) return true;
  return value === customer.owner || value === customer.account_owner;
}

function getEnvConfig(): InternalSendEnvConfig {
  return {
    damAlertEmail: process.env.SENDGRID_DAM_ALERT_EMAIL?.trim() ?? "",
    internalEmailDomain:
      process.env.SENDGRID_INTERNAL_EMAIL_DOMAIN?.trim().toLowerCase() ?? "",
  };
}

/**
 * Customer-facing sends must use a separate route with stronger approval/auth.
 * Resolves internal recipient routing for DAM/CSM alerts.
 */
export function resolveInternalRecipient(
  recipient: string,
  customer: InternalSendCustomerContext,
  config: InternalSendEnvConfig = getEnvConfig(),
): InternalRecipientValidation {
  const value = recipient.trim();
  if (!value) {
    return { valid: false, error: "Recipient is missing" };
  }

  if (isCustomerFacingRecipient(value, customer)) {
    return {
      valid: false,
      error: "Customer admin/user recipients are disabled. Internal/DAM only.",
    };
  }

  const recipientNorm = normalize(value);

  if (value.includes("@")) {
    if (
      config.internalEmailDomain &&
      recipientNorm.endsWith(config.internalEmailDomain)
    ) {
      return {
        valid: true,
        deliverTo: value,
        routingReason: `Direct internal email (${config.internalEmailDomain} domain)`,
      };
    }
    return {
      valid: false,
      error: `Recipient email is not on approved domain ${config.internalEmailDomain || "(not configured)"}`,
    };
  }

  if (value === customer.owner) {
    if (!config.damAlertEmail) {
      return {
        valid: false,
        error: "SENDGRID_DAM_ALERT_EMAIL is not configured for CSM owner alerts",
      };
    }
    return {
      valid: true,
      deliverTo: config.damAlertEmail,
      routingReason: `CSM owner "${value}" routed to DAM alert inbox`,
    };
  }

  if (value === customer.account_owner) {
    if (!config.damAlertEmail) {
      return {
        valid: false,
        error:
          "SENDGRID_DAM_ALERT_EMAIL is not configured for account owner alerts",
      };
    }
    return {
      valid: true,
      deliverTo: config.damAlertEmail,
      routingReason: `Account owner "${value}" routed to DAM alert inbox`,
    };
  }

  return {
    valid: false,
    error: "Recipient is not an approved internal owner/DAM contact",
  };
}

/** @deprecated Use resolveInternalRecipient */
export function validateInternalRecipient(
  recipient: string,
  customer: InternalSendCustomerContext,
): InternalRecipientValidation {
  return resolveInternalRecipient(recipient, customer);
}

export function isDuplicateSendBlocked(lastEmailSentDate: string): boolean {
  if (!lastEmailSentDate?.trim()) return false;
  const lastSent = new Date(lastEmailSentDate);
  if (Number.isNaN(lastSent.getTime())) return false;
  const elapsed = Date.now() - lastSent.getTime();
  return elapsed >= 0 && elapsed < 7 * 24 * 60 * 60 * 1000;
}

const SCHEDULE_NOT_DUE_ERROR =
  "Action is scheduled for later and cannot be sent yet.";

export const CONFLICT_NOT_CLEAR_ERROR =
  "Action has an active conflict and cannot be sent yet.";

/** Server-side: only explicit "clear" passes; missing or any other value rejects. */
export function isPayloadConflictClear(payload: InternalSendPayload): boolean {
  return payload.conflict_status === "clear";
}

export function validateInternalSendRequest(
  payload: InternalSendPayload,
  config: InternalSendEnvConfig = getEnvConfig(),
): { ok: true; deliverTo: string; routingReason: string } | { ok: false; error: string } {
  if (payload.action_status !== "Approved") {
    return { ok: false, error: "Action must be Approved before sending" };
  }

  if (payload.schedule_status !== "due_now") {
    return { ok: false, error: SCHEDULE_NOT_DUE_ERROR };
  }

  if (!isPayloadConflictClear(payload)) {
    return { ok: false, error: CONFLICT_NOT_CLEAR_ERROR };
  }

  if (isDuplicateSendBlocked(payload.last_email_sent_date)) {
    return {
      ok: false,
      error:
        "Duplicate protection: last customer email was sent within 7 days. Reset and re-approve to send.",
    };
  }

  const recipientCheck = resolveInternalRecipient(payload.recipient, payload, config);
  if (!recipientCheck.valid || !recipientCheck.deliverTo) {
    return { ok: false, error: recipientCheck.error ?? "Invalid recipient" };
  }

  const required: (keyof InternalSendPayload)[] = [
    "action_id",
    "customer_name",
    "issue",
    "recommended_action",
    "recipient",
    "template_name",
    "subject",
    "body",
    "owner",
  ];

  for (const field of required) {
    if (!String(payload[field] ?? "").trim()) {
      return { ok: false, error: `Missing or invalid field: ${field}` };
    }
  }

  return {
    ok: true,
    deliverTo: recipientCheck.deliverTo,
    routingReason: recipientCheck.routingReason ?? "Internal routing",
  };
}

export function canSendInternalAction(
  item: ActionQueueItem,
  customer: Customer,
): boolean {
  if (item.workflow_status !== "Approved") return false;
  if (item.schedule_status !== "due_now") return false;
  if (!isQueueConflictClear(item.conflict_status)) return false;
  if (isSequenceCustomerFacingItem(item)) return false;
  if (!isEligibleInternalRecipient(item.recipient, customer)) return false;
  return !checkDuplicateRisk(customer).blocked;
}

export function buildInternalSendPayload(
  item: ActionQueueItem,
  customer: Customer,
  subject: string,
  body: string,
): InternalSendPayload {
  return {
    action_id: item.id,
    customer_name: item.customer_name,
    issue: item.issue,
    recommended_action: item.recommended_action,
    recipient: item.recipient,
    template_name: item.template,
    subject,
    body,
    action_status: item.workflow_status,
    schedule_status: item.schedule_status,
    conflict_status: isQueueConflictClear(item.conflict_status)
      ? "clear"
      : item.conflict_status ?? "",
    conflict_reason: item.conflict_reason ?? null,
    enrollment_id: item.enrollment_id,
    sequence_key: item.sequence_key,
    sequence_name: item.sequence_name,
    sequence_step_number: item.sequence_step_number,
    sequence_step_name: item.sequence_step_name,
    contact_email: item.contact_email,
    contact_role: item.recipient_type,
    admin_email: customer.admin_email,
    user_email: customer.user_email,
    owner: customer.owner,
    account_owner: customer.account_owner,
    last_email_sent_date: customer.last_email_sent_date,
  };
}
