import type { EditableEmailSequence } from "./email-sequence-definitions";
import { formatStepDelayLabel } from "./email-sequence-definitions";
import { resolveSequenceContacts } from "./email-sequence-contacts";
import { checkContactSequencePreviewConflict } from "./email-sequence-conflicts";
import { contactEmailIsValid, computeStepScheduledFor } from "./email-sequence-preview";
import type { SequenceEnrollment } from "./email-sequence-types";
import type {
  ActionQueueBase,
  Customer,
  QueueConflictStatus,
  ScheduleStatus,
  SendLog,
} from "./types";

export interface SequenceQueueBuildContext {
  sequences: EditableEmailSequence[];
  enrollments: SequenceEnrollment[];
  sendLogs: SendLog[];
  customers: Customer[];
}

function resolveSequenceScheduleStatus(
  scheduledFor: Date,
  now = new Date(),
): ScheduleStatus {
  return scheduledFor.getTime() <= now.getTime() ? "due_now" : "not_due";
}

function resolveStepQueueRecipient(
  customer: Customer,
  enrollment: SequenceEnrollment,
  step: EditableEmailSequence["steps"][number],
): string {
  if (step.channel === "internal_alert") {
    return customer.owner?.trim() || enrollment.contact_name;
  }
  return enrollment.contact_email;
}

function resolveStepConflictContact(
  customer: Customer,
  enrollment: SequenceEnrollment,
  step: EditableEmailSequence["steps"][number],
): string {
  const stepContacts = resolveSequenceContacts(customer, step.recipient_type);
  const stepContact = stepContacts[0];
  if (step.channel === "internal_alert") {
    return stepContact?.contact_email ?? customer.owner ?? enrollment.contact_email;
  }
  return enrollment.contact_email;
}

/**
 * Build Action Queue rows from active manual sequence enrollments (current step only).
 * Does not send email or mutate enrollments.
 */
export function buildSequenceActionQueueItems(
  context: SequenceQueueBuildContext,
): ActionQueueBase[] {
  const { sequences, enrollments, sendLogs, customers } = context;
  const customerMap = new Map(customers.map((entry) => [entry.customer_id, entry]));
  const sequenceMap = new Map(sequences.map((entry) => [entry.key, entry]));
  const items: ActionQueueBase[] = [];

  for (const enrollment of enrollments) {
    if (enrollment.enrollment_status !== "active") continue;

    const sequence = sequenceMap.get(enrollment.sequence_key);
    if (!sequence || sequence.status !== "approved") continue;

    const customer = customerMap.get(enrollment.account_id);
    if (!customer) continue;

    const activeSteps = sequence.steps.filter((step) => step.active);
    const step = activeSteps[enrollment.current_step_number - 1];
    if (!step) continue;

    const enrolledAt = new Date(enrollment.enrolled_at);
    const scheduledFor = computeStepScheduledFor(enrolledAt, step);
    const schedule_status = resolveSequenceScheduleStatus(scheduledFor);
    const templateKey = step.template_key.trim();
    const conflictContact = resolveStepConflictContact(
      customer,
      enrollment,
      step,
    );

    let conflict_status: QueueConflictStatus = "clear";
    let conflict_reason: string | null = null;
    let next_eligible_at: string | null = null;

    if (
      step.channel === "email" &&
      !contactEmailIsValid(enrollment.contact_email)
    ) {
      conflict_status = "blocked_by_cooldown";
      conflict_reason = "No eligible contact email found for this step.";
    } else {
      const otherEnrollments = enrollments.filter(
        (entry) => entry.id !== enrollment.id,
      );
      const conflict = checkContactSequencePreviewConflict({
        contact_email: conflictContact,
        account_id: customer.customer_id,
        contact_role: step.recipient_type,
        customer,
        sequence_key: sequence.key,
        template_key: templateKey,
        is_internal_alert: step.channel === "internal_alert",
        now: scheduledFor.getTime(),
        policy: sequence.cooling_policy,
        send_logs: sendLogs,
        enrollments: otherEnrollments,
      });
      conflict_status = conflict.conflict_status;
      conflict_reason = conflict.conflict_reason;
      next_eligible_at = conflict.next_eligible_at;
    }

    items.push({
      id: `seq-${enrollment.id}-step-${enrollment.current_step_number}`,
      customer_id: enrollment.account_id,
      customer_name: enrollment.customer_name,
      issue: `${enrollment.sequence_name} — Step ${enrollment.current_step_number}: ${step.step_name}`,
      recommended_action: `Sequence ${step.channel} for ${step.recipient_type} using template "${templateKey || "—"}"`,
      recipient: resolveStepQueueRecipient(customer, enrollment, step),
      template: templateKey,
      automation_status: customer.automation_status,
      rule_id: `sequence:${enrollment.sequence_key}`,
      recipient_type: step.recipient_type,
      scheduled_for: scheduledFor.toISOString(),
      schedule_status,
      timing_type: "after_delay",
      timing_label: `${formatStepDelayLabel(step)} from enrollment`,
      source: "sequence_enrollment",
      enrollment_id: enrollment.id,
      contact_email: enrollment.contact_email,
      sequence_key: enrollment.sequence_key,
      sequence_name: enrollment.sequence_name,
      sequence_step_id: step.id,
      sequence_step_number: enrollment.current_step_number,
      sequence_step_name: step.step_name,
      conflict_status,
      conflict_reason,
      next_eligible_at,
      channel: step.channel,
      requires_approval: step.requires_approval,
      template_key: templateKey,
    });
  }

  return items;
}

export function isSequenceCustomerFacingItem(item: ActionQueueBase): boolean {
  return (
    item.source === "sequence_enrollment" &&
    item.channel === "email"
  );
}

export function formatQueueConflictLabel(
  status?: QueueConflictStatus | null,
): string {
  switch (status) {
    case "clear":
    case undefined:
    case null:
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

export function queueConflictVariant(
  status?: QueueConflictStatus | null,
): "success" | "warning" | "danger" | "muted" | "default" {
  switch (status) {
    case "clear":
    case undefined:
    case null:
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

export function formatQueueSourceLabel(source: ActionQueueBase["source"]): string {
  return source === "sequence_enrollment" ? "Sequence" : "Trigger";
}
