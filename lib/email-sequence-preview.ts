import type { Customer, EmailTemplate, RecipientType, SendLog } from "./types";
import type { EditableEmailSequence, EditableSequenceStep } from "./email-sequence-definitions";
import { formatStepDelayLabel } from "./email-sequence-definitions";
import type { SequenceEnrollment } from "./email-sequence-types";
import { sequenceEnrollmentId } from "./email-sequence-types";
import { resolveSequenceContacts } from "./email-sequence-contacts";
import {
  checkContactSequencePreviewConflict,
  type SequencePreviewConflictStatus,
} from "./email-sequence-conflicts";
import {
  type SequenceStepTemplateStatus,
  resolveStepTemplateStatus,
} from "./email-sequence-templates";

export type { SequencePreviewConflictStatus };

export function contactEmailIsValid(email: string): boolean {
  const trimmed = email.trim();
  return trimmed.length > 0 && trimmed.includes("@");
}

export interface SequencePreviewStepRow {
  step_number: number;
  step_name: string;
  delay_label: string;
  scheduled_for: string;
  channel: EditableSequenceStep["channel"];
  recipient_type: RecipientType;
  contact_email: string;
  contact_name: string;
  template_key: string;
  template_name: string;
  template_status: SequenceStepTemplateStatus;
  requires_approval: boolean;
  conflict_status: SequencePreviewConflictStatus;
  conflict_reason: string | null;
  next_eligible_at: string | null;
}

export interface SequenceContactPreviewResult {
  customer_name: string;
  customer_id: string;
  preview_role: RecipientType;
  contact_email: string | null;
  contact_name: string | null;
  enrollment_identity: string | null;
  sequence_name: string;
  sequence_key: string;
  preview_start_date: string;
  blocked: boolean;
  blocked_message: string | null;
  approval_warning: string | null;
  limited_conflict_note: string;
  steps: SequencePreviewStepRow[];
}

function parseStartDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (match) {
    return new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      10,
      0,
      0,
      0,
    );
  }
  const fallback = new Date();
  fallback.setHours(10, 0, 0, 0);
  return fallback;
}

function addCalendarDays(date: Date, amount: number): Date {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + amount);
  return result;
}

function addBusinessDays(date: Date, amount: number): Date {
  let remaining = amount;
  const result = new Date(date.getTime());
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return result;
}

export function computeStepScheduledFor(
  startDate: Date,
  step: EditableSequenceStep,
): Date {
  const addFn =
    step.delay_unit === "business_days" ? addBusinessDays : addCalendarDays;
  return addFn(startDate, step.delay_amount);
}

function resolveTemplateName(
  templateKey: string,
  templates: EmailTemplate[],
): string {
  if (!templateKey.trim()) return "—";
  return templates.find((entry) => entry.key === templateKey)?.name ?? templateKey;
}

export function formatPreviewConflictLabel(
  status: SequencePreviewConflictStatus,
): string {
  switch (status) {
    case "clear":
      return "Clear";
    case "blocked_by_cooldown":
      return "Blocked by cooldown";
    case "blocked_by_same_template":
      return "Blocked by same template";
    case "blocked_by_frequency_cap":
      return "Blocked by frequency cap";
    case "blocked_by_active_sequence":
      return "Blocked by active sequence";
    default:
      return status;
  }
}

export function previewConflictVariant(
  status: SequencePreviewConflictStatus,
): "success" | "warning" | "danger" | "muted" | "default" {
  switch (status) {
    case "clear":
      return "success";
    case "blocked_by_cooldown":
    case "blocked_by_same_template":
      return "warning";
    case "blocked_by_frequency_cap":
    case "blocked_by_active_sequence":
      return "danger";
    default:
      return "default";
  }
}

export function formatPreviewScheduledFor(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function buildSequenceContactPreview(params: {
  sequence: EditableEmailSequence;
  customer: Customer;
  previewRole: RecipientType;
  startDate: string;
  emailTemplates: EmailTemplate[];
  sendLogs: SendLog[];
  enrollments?: SequenceEnrollment[];
}): SequenceContactPreviewResult {
  const {
    sequence,
    customer,
    previewRole,
    startDate,
    emailTemplates,
    sendLogs,
    enrollments = [],
  } = params;

  const start = parseStartDate(startDate);
  const headerContacts = resolveSequenceContacts(customer, previewRole);
  const headerContact = headerContacts[0] ?? null;

  let blockedMessage: string | null = null;
  if (!headerContact) {
    blockedMessage = "No eligible contact email found.";
  } else if (!contactEmailIsValid(headerContact.contact_email)) {
    blockedMessage =
      previewRole === "CSM"
        ? "No eligible contact email found. CSM owner is not a valid email address."
        : "No eligible contact email found.";
  }

  const approvalWarning =
    sequence.status !== "approved"
      ? "This sequence is not approved and cannot be used for enrollment."
      : null;

  const activeSteps = sequence.steps.filter((step) => step.active);

  const steps: SequencePreviewStepRow[] = activeSteps.map((step, index) => {
    const stepContacts = resolveSequenceContacts(customer, step.recipient_type);
    const stepContact = stepContacts[0];
    const scheduledFor = computeStepScheduledFor(start, step);
    const templateKey = step.template_key.trim();
    const templateStatus = resolveStepTemplateStatus(step, emailTemplates);

    let conflict_status: SequencePreviewConflictStatus = "clear";
    let conflict_reason: string | null = null;
    let next_eligible_at: string | null = null;

    if (!stepContact) {
      conflict_status = "blocked_by_cooldown";
      conflict_reason = "No eligible contact email found for this step.";
    } else if (
      step.channel === "email" &&
      !contactEmailIsValid(stepContact.contact_email)
    ) {
      conflict_status = "blocked_by_cooldown";
      conflict_reason = "No eligible contact email found for this step.";
    } else {
      const conflict = checkContactSequencePreviewConflict({
        contact_email: stepContact.contact_email,
        account_id: customer.customer_id,
        contact_role: step.recipient_type,
        customer,
        sequence_key: sequence.key,
        template_key: templateKey,
        is_internal_alert: step.channel === "internal_alert",
        now: scheduledFor.getTime(),
        policy: sequence.cooling_policy,
        send_logs: sendLogs,
        enrollments,
      });
      conflict_status = conflict.conflict_status;
      conflict_reason = conflict.conflict_reason;
      next_eligible_at = conflict.next_eligible_at;
    }

    return {
      step_number: index + 1,
      step_name: step.step_name,
      delay_label: formatStepDelayLabel(step),
      scheduled_for: scheduledFor.toISOString(),
      channel: step.channel,
      recipient_type: step.recipient_type,
      contact_email: stepContact?.contact_email ?? "—",
      contact_name: stepContact?.contact_name ?? "—",
      template_key: templateKey || "—",
      template_name: resolveTemplateName(templateKey, emailTemplates),
      template_status: templateStatus,
      requires_approval: step.requires_approval,
      conflict_status,
      conflict_reason,
      next_eligible_at,
    };
  });

  const enrollmentEmail =
    headerContact && contactEmailIsValid(headerContact.contact_email)
      ? headerContact.contact_email
      : headerContact?.contact_email ?? null;

  return {
    customer_name: customer.customer_name,
    customer_id: customer.customer_id,
    preview_role: previewRole,
    contact_email: headerContact?.contact_email ?? null,
    contact_name: headerContact?.contact_name ?? null,
    enrollment_identity:
      enrollmentEmail && sequence.key
        ? sequenceEnrollmentId(enrollmentEmail, sequence.key)
        : null,
    sequence_name: sequence.name,
    sequence_key: sequence.key,
    preview_start_date: startDate,
    blocked: Boolean(blockedMessage),
    blocked_message: blockedMessage,
    approval_warning: approvalWarning,
    limited_conflict_note:
      "Limited conflict check: using current session logs and available customer data.",
    steps,
  };
}

export function audienceToRecipientType(
  audience: EditableEmailSequence["audience"],
): RecipientType {
  switch (audience) {
    case "user":
      return "User";
    case "csm":
      return "CSM";
    default:
      return "Admin";
  }
}

export function todayDateInputValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
