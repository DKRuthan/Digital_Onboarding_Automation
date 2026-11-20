import type { Customer, RecipientType } from "./types";
import type { EditableEmailSequence } from "./email-sequence-definitions";
import { formatStepDelayLabel } from "./email-sequence-definitions";
import {
  buildSequenceAccountContext,
  resolveSequenceContacts,
} from "./email-sequence-contacts";
import {
  contactEmailIsValid,
  computeStepScheduledFor,
} from "./email-sequence-preview";
import type { SequenceEnrollment } from "./email-sequence-types";
import {
  NO_CONTACT_EMAIL_REASON,
  sequenceEnrollmentId,
} from "./email-sequence-types";

export const DUPLICATE_ACTIVE_ENROLLMENT_REASON =
  "This contact is already active in this sequence.";

export function hasActiveOrPausedEnrollment(
  enrollments: SequenceEnrollment[],
  contactEmail: string,
  sequenceKey: string,
): boolean {
  const identity = sequenceEnrollmentId(contactEmail, sequenceKey);
  return enrollments.some(
    (entry) =>
      sequenceEnrollmentId(entry.contact_email, entry.sequence_key) ===
        identity &&
      (entry.enrollment_status === "active" ||
        entry.enrollment_status === "paused"),
  );
}

export function getFirstActiveStep(sequence: EditableEmailSequence) {
  return sequence.steps.find((step) => step.active) ?? null;
}

export function getActiveStepCount(sequence: EditableEmailSequence): number {
  return sequence.steps.filter((step) => step.active).length;
}

export function getEnrollmentStepInfo(
  sequence: EditableEmailSequence,
  enrolledAt: Date,
) {
  const firstStep = getFirstActiveStep(sequence);
  if (!firstStep) return null;

  return {
    step_number: 1,
    step_name: firstStep.step_name,
    delay_label: formatStepDelayLabel(firstStep),
    next_step_due_at: computeStepScheduledFor(enrolledAt, firstStep).toISOString(),
  };
}

function createEnrollmentId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `enr-${crypto.randomUUID()}`;
  }
  return `enr-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export interface CreateEnrollmentInput {
  customer: Customer;
  sequence: EditableEmailSequence;
  contactRole: RecipientType;
  existingEnrollments: SequenceEnrollment[];
}

export type CreateEnrollmentResult =
  | { ok: true; enrollment: SequenceEnrollment }
  | { ok: false; error: string };

export function buildEnrollmentRecord(
  input: CreateEnrollmentInput,
): CreateEnrollmentResult {
  const { customer, sequence, contactRole, existingEnrollments } = input;

  if (sequence.status !== "approved") {
    return { ok: false, error: "Sequence is not approved." };
  }

  const contacts = resolveSequenceContacts(customer, contactRole);
  const contact = contacts[0];
  if (!contact || !contactEmailIsValid(contact.contact_email)) {
    return { ok: false, error: NO_CONTACT_EMAIL_REASON };
  }

  if (
    hasActiveOrPausedEnrollment(
      existingEnrollments,
      contact.contact_email,
      sequence.key,
    )
  ) {
    return { ok: false, error: DUPLICATE_ACTIVE_ENROLLMENT_REASON };
  }

  const firstStep = getFirstActiveStep(sequence);
  if (!firstStep) {
    return { ok: false, error: "Sequence has no active steps." };
  }

  const enrolledAt = new Date();
  const stepInfo = getEnrollmentStepInfo(sequence, enrolledAt);
  if (!stepInfo) {
    return { ok: false, error: "Sequence has no active steps." };
  }

  const enrollment: SequenceEnrollment = {
    id: createEnrollmentId(),
    account_id: customer.customer_id,
    customer_name: customer.customer_name,
    contact_email: contact.contact_email,
    contact_name: contact.contact_name,
    contact_role: contact.contact_role,
    sequence_key: sequence.key,
    sequence_name: sequence.name,
    enrollment_status: "active",
    enrolled_at: enrolledAt.toISOString(),
    current_step_number: stepInfo.step_number,
    next_step_due_at: stepInfo.next_step_due_at,
    completed_steps: [],
    exit_reason: null,
    account_context: buildSequenceAccountContext(customer),
  };

  return { ok: true, enrollment };
}

export function getEnrollmentsForContactEmail(
  enrollments: SequenceEnrollment[],
  contactEmail: string,
): SequenceEnrollment[] {
  const normalized = contactEmail.trim().toLowerCase();
  return enrollments.filter(
    (entry) => entry.contact_email.trim().toLowerCase() === normalized,
  );
}

export function isoToDateInputValue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function formatEnrollmentStatusLabel(
  status: SequenceEnrollment["enrollment_status"],
): string {
  switch (status) {
    case "active":
      return "Active";
    case "paused":
      return "Paused";
    case "completed":
      return "Completed";
    case "exited":
      return "Exited";
    case "cancelled":
      return "Cancelled";
    case "blocked":
      return "Blocked";
    default:
      return status;
  }
}
