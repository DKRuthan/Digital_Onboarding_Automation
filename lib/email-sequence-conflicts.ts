import type { Customer, SendLog } from "./types";
import type {
  ConflictCheckResult,
  ContactCooldownPolicy,
  SequenceEnrollment,
} from "./email-sequence-types";
import {
  DEFAULT_CONTACT_COOLDOWN_POLICY,
  sequenceEnrollmentId,
} from "./email-sequence-types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysSince(isoDate: string, now = Date.now()): number | null {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return null;
  return (now - parsed.getTime()) / MS_PER_DAY;
}

function defaultPolicy(): ContactCooldownPolicy {
  return { ...DEFAULT_CONTACT_COOLDOWN_POLICY };
}

export type SequencePreviewConflictStatus =
  | "clear"
  | "blocked_by_cooldown"
  | "blocked_by_same_template"
  | "blocked_by_frequency_cap"
  | "blocked_by_active_sequence";

export interface ContactConflictInput {
  contact_email: string;
  account_id: string;
  sequence_key: string;
  template_key: string;
  contact_role: "Admin" | "User" | "CSM";
  is_internal_alert: boolean;
  customer: Customer;
  enrollments: SequenceEnrollment[];
  send_logs: SendLog[];
  policy?: ContactCooldownPolicy;
  now?: number;
}

export interface SequencePreviewConflictResult {
  conflict_status: SequencePreviewConflictStatus;
  conflict_reason: string | null;
  next_eligible_at: string | null;
}

/**
 * Email-level cooling/conflict checks (primary).
 * Account-level limits are optional secondary checks.
 * Does not send email — recommendation / queue blocking only.
 */
export function checkContactSequenceConflicts(
  input: ContactConflictInput,
): ConflictCheckResult {
  const policy = input.policy ?? defaultPolicy();
  const now = input.now ?? Date.now();
  const emailNorm = input.contact_email.trim().toLowerCase();

  if (input.is_internal_alert && policy.internal_alerts_bypass_contact_cooldown) {
    return {
      conflict_status: "clear",
      conflict_reason: null,
      next_eligible_at: null,
    };
  }

  const activeSameSequence = input.enrollments.find(
    (entry) =>
      entry.enrollment_status === "active" &&
      sequenceEnrollmentId(entry.contact_email, entry.sequence_key) ===
        sequenceEnrollmentId(input.contact_email, input.sequence_key),
  );
  if (activeSameSequence) {
    return {
      conflict_status: "duplicate_sequence",
      conflict_reason: `Contact is already active in sequence "${input.sequence_key}".`,
      next_eligible_at: activeSameSequence.next_step_due_at,
    };
  }

  const contactLogs = input.send_logs.filter(
    (log) => log.recipient.trim().toLowerCase() === emailNorm,
  );

  if (input.customer.last_email_sent_date?.trim()) {
    const elapsed = daysSince(input.customer.last_email_sent_date, now);
    if (
      elapsed !== null &&
      elapsed >= 0 &&
      elapsed < policy.global_cooldown_days
    ) {
      const next = new Date(
        new Date(input.customer.last_email_sent_date).getTime() +
          policy.global_cooldown_days * MS_PER_DAY,
      );
      return {
        conflict_status: "cooldown",
        conflict_reason: `Same email contacted within ${policy.global_cooldown_days}-day global cooldown.`,
        next_eligible_at: next.toISOString(),
      };
    }
  }

  const recentSameTemplate = contactLogs.find((log) => {
    if (log.template !== input.template_key) return false;
    const elapsed = daysSince(log.date, now);
    return (
      elapsed !== null &&
      elapsed >= 0 &&
      elapsed < policy.same_template_cooldown_days
    );
  });
  if (recentSameTemplate) {
    const next = new Date(
      new Date(recentSameTemplate.date).getTime() +
        policy.same_template_cooldown_days * MS_PER_DAY,
    );
    return {
      conflict_status: "cooldown",
      conflict_reason: `Same email received template "${input.template_key}" recently.`,
      next_eligible_at: next.toISOString(),
    };
  }

  const emailsLast30Days = contactLogs.filter((log) => {
    const elapsed = daysSince(log.date, now);
    return elapsed !== null && elapsed >= 0 && elapsed <= 30;
  }).length;
  if (emailsLast30Days >= policy.max_emails_per_contact_30_days) {
    return {
      conflict_status: "rate_limited",
      conflict_reason: `Contact exceeded ${policy.max_emails_per_contact_30_days} emails in 30 days.`,
      next_eligible_at: null,
    };
  }

  if (policy.max_emails_per_account_7_days !== undefined) {
    const accountLogs7d = input.send_logs.filter((log) => {
      if (log.customer_name !== input.customer.customer_name) return false;
      const elapsed = daysSince(log.date, now);
      return elapsed !== null && elapsed >= 0 && elapsed <= 7;
    }).length;
    if (accountLogs7d >= policy.max_emails_per_account_7_days) {
      return {
        conflict_status: "rate_limited",
        conflict_reason: `Account exceeded ${policy.max_emails_per_account_7_days} emails in 7 days.`,
        next_eligible_at: null,
      };
    }
  }

  return {
    conflict_status: "clear",
    conflict_reason: null,
    next_eligible_at: null,
  };
}

/** Preview-specific conflict check with granular status labels per step. */
export function checkContactSequencePreviewConflict(
  input: ContactConflictInput,
): SequencePreviewConflictResult {
  const policy = input.policy ?? defaultPolicy();
  const now = input.now ?? Date.now();
  const emailNorm = input.contact_email.trim().toLowerCase();

  if (input.is_internal_alert && policy.internal_alerts_bypass_contact_cooldown) {
    return {
      conflict_status: "clear",
      conflict_reason: null,
      next_eligible_at: null,
    };
  }

  const activeSameSequence = input.enrollments.find(
    (entry) =>
      entry.enrollment_status === "active" &&
      sequenceEnrollmentId(entry.contact_email, entry.sequence_key) ===
        sequenceEnrollmentId(input.contact_email, input.sequence_key),
  );
  if (activeSameSequence) {
    return {
      conflict_status: "blocked_by_active_sequence",
      conflict_reason: `Contact is already active in sequence "${input.sequence_key}".`,
      next_eligible_at: activeSameSequence.next_step_due_at,
    };
  }

  const contactLogs = input.send_logs.filter(
    (log) => log.recipient.trim().toLowerCase() === emailNorm,
  );

  if (input.customer.last_email_sent_date?.trim()) {
    const elapsed = daysSince(input.customer.last_email_sent_date, now);
    if (
      elapsed !== null &&
      elapsed >= 0 &&
      elapsed < policy.global_cooldown_days
    ) {
      const next = new Date(
        new Date(input.customer.last_email_sent_date).getTime() +
          policy.global_cooldown_days * MS_PER_DAY,
      );
      return {
        conflict_status: "blocked_by_cooldown",
        conflict_reason: `Same email contacted within ${policy.global_cooldown_days}-day global cooldown.`,
        next_eligible_at: next.toISOString(),
      };
    }
  }

  const recentSameTemplate = contactLogs.find((log) => {
    if (log.template !== input.template_key) return false;
    const elapsed = daysSince(log.date, now);
    return (
      elapsed !== null &&
      elapsed >= 0 &&
      elapsed < policy.same_template_cooldown_days
    );
  });
  if (recentSameTemplate) {
    const next = new Date(
      new Date(recentSameTemplate.date).getTime() +
        policy.same_template_cooldown_days * MS_PER_DAY,
    );
    return {
      conflict_status: "blocked_by_same_template",
      conflict_reason: `Same email received template "${input.template_key}" recently.`,
      next_eligible_at: next.toISOString(),
    };
  }

  const emailsLast30Days = contactLogs.filter((log) => {
    const elapsed = daysSince(log.date, now);
    return elapsed !== null && elapsed >= 0 && elapsed <= 30;
  }).length;
  if (emailsLast30Days >= policy.max_emails_per_contact_30_days) {
    return {
      conflict_status: "blocked_by_frequency_cap",
      conflict_reason: `Contact exceeded ${policy.max_emails_per_contact_30_days} emails in 30 days.`,
      next_eligible_at: null,
    };
  }

  if (policy.max_emails_per_account_7_days !== undefined) {
    const accountLogs7d = input.send_logs.filter((log) => {
      if (log.customer_name !== input.customer.customer_name) return false;
      const elapsed = daysSince(log.date, now);
      return elapsed !== null && elapsed >= 0 && elapsed <= 7;
    }).length;
    if (accountLogs7d >= policy.max_emails_per_account_7_days) {
      return {
        conflict_status: "blocked_by_frequency_cap",
        conflict_reason: `Account exceeded ${policy.max_emails_per_account_7_days} emails in 7 days.`,
        next_eligible_at: null,
      };
    }
  }

  return {
    conflict_status: "clear",
    conflict_reason: null,
    next_eligible_at: null,
  };
}
