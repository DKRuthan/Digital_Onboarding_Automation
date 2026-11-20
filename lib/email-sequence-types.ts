import type {
  ActionQueueItem,
  QueueConflictStatus,
  RecipientType,
  RuleTiming,
  SendLog,
} from "./types";

export type CompletedStepStatus = "completed" | "skipped";

export type StepCompletionSource =
  | "manual"
  | "internal_dry_run"
  | "internal_live_send"
  | "skipped";

export interface CompletedStepRecord {
  step_id: string;
  step_number: number;
  step_name: string;
  status: CompletedStepStatus;
  completed_at: string;
  completion_source: StepCompletionSource;
  notes?: string;
}

/** Unique enrollment identity: contact_email + sequence_key (not account_id alone). */
export function sequenceEnrollmentId(
  contactEmail: string,
  sequenceKey: string,
): string {
  return `${contactEmail.trim().toLowerCase()}::${sequenceKey.trim()}`;
}

export type EnrollmentStatus =
  | "active"
  | "paused"
  | "completed"
  | "exited"
  | "cancelled"
  | "blocked";

export type ConflictStatus =
  | "clear"
  | "blocked"
  | "cooldown"
  | "duplicate_sequence"
  | "rate_limited";

/** Account context carried on enrollments and queue rows — not the send recipient. */
export interface SequenceAccountContext {
  customer_id: string;
  customer_name: string;
  account_owner: string;
  seats_total: number;
  seats_assigned: number;
  usage_sessions: number;
  usage_threshold_percent: number;
  renewal_date: string;
}

export interface SequenceContact {
  contact_email: string;
  contact_name: string;
  contact_role: RecipientType;
}

export interface EmailSequenceStep {
  step_number: number;
  step_name: string;
  /** Resolves which contact_email to enroll when the step becomes due. */
  recipient_type: RecipientType;
  template_key: string;
  /** Optional per-step timing (inherits sequence default if omitted). */
  timing?: RuleTiming;
  delay_after_previous_days?: number;
}

export interface EmailSequence {
  key: string;
  name: string;
  description: string;
  active: boolean;
  steps: EmailSequenceStep[];
  /** Default timing for steps without their own timing config. */
  default_timing?: RuleTiming;
}

/**
 * Contact/email-level enrollment record.
 * Primary key: contact_email + sequence_key.
 */
export interface SequenceEnrollment {
  id: string;
  account_id: string;
  customer_name: string;
  contact_email: string;
  contact_name: string;
  contact_role: RecipientType;
  sequence_key: string;
  sequence_name: string;
  enrollment_status: EnrollmentStatus;
  enrolled_at: string;
  current_step_number: number;
  next_step_due_at: string;
  completed_steps: CompletedStepRecord[];
  exit_reason: string | null;
  account_context: SequenceAccountContext;
}

export interface ConflictCheckResult {
  conflict_status: ConflictStatus;
  conflict_reason: string | null;
  next_eligible_at: string | null;
}

/** Sequence-enrollment Action Queue row (fields also on ActionQueueItem). */
export interface SequenceAwareActionQueueItem extends ActionQueueItem {
  source: "sequence_enrollment";
  contact_email: string;
  sequence_key: string;
  sequence_name: string;
  sequence_step_number: number;
  sequence_step_name: string;
  conflict_status: QueueConflictStatus;
}

/** Send Log row with optional sequence enrollment metadata. */
export interface SequenceAwareSendLog extends SendLog {
  contact_email?: string;
  contact_role?: RecipientType;
  account_id?: string;
  sequence_key?: string;
  sequence_step_number?: number;
  conflict_status?: QueueConflictStatus | "";
}

export interface ContactCooldownPolicy {
  global_cooldown_days: number;
  same_template_cooldown_days: number;
  max_emails_per_contact_30_days: number;
  max_emails_per_account_7_days?: number;
  max_emails_per_account_30_days?: number;
  max_contacts_per_account_per_period?: number;
  /** Internal CSM/DAM alerts may bypass customer email cooldown when true. */
  internal_alerts_bypass_contact_cooldown: boolean;
}

export const DEFAULT_CONTACT_COOLDOWN_POLICY: ContactCooldownPolicy = {
  global_cooldown_days: 7,
  same_template_cooldown_days: 14,
  max_emails_per_contact_30_days: 5,
  max_emails_per_account_7_days: 10,
  max_emails_per_account_30_days: 20,
  max_contacts_per_account_per_period: 3,
  internal_alerts_bypass_contact_cooldown: true,
};

export const NO_CONTACT_EMAIL_REASON =
  "No eligible contact email found.";
