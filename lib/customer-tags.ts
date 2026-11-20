import type { EditableEmailSequence, SequenceCategory } from "./email-sequence-definitions";
import type { SequenceEnrollment } from "./email-sequence-types";
import type { Customer, SendLog } from "./types";

export type CustomerTagCategory = "account" | "contact" | "journey";

export type CustomerTagSeverity = "info" | "success" | "warning" | "risk";

export type ComputedCustomerTag = {
  key: string;
  label: string;
  category: CustomerTagCategory;
  severity: CustomerTagSeverity;
  reason: string;
};

/** Minimal sequence shape for journey tag resolution. */
export type JourneyTagSequence = Pick<
  EditableEmailSequence,
  "key" | "name" | "category"
>;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const COOLING_DAYS = 7;

const JOURNEY_TAG_BY_CATEGORY: Record<
  SequenceCategory,
  { key: string; label: string; severity: CustomerTagSeverity }
> = {
  onboarding: {
    key: "journey-onboarding",
    label: "Onboarding Sequence",
    severity: "info",
  },
  activation: {
    key: "journey-activation",
    label: "Activation Sequence",
    severity: "info",
  },
  education: {
    key: "journey-education",
    label: "Education Sequence",
    severity: "info",
  },
  renewal: {
    key: "journey-renewal",
    label: "Renewal Sequence",
    severity: "warning",
  },
};

const REACTIVATION_JOURNEY_TAG: ComputedCustomerTag = {
  key: "journey-reactivation",
  label: "Reactivation Sequence",
  category: "journey",
  severity: "warning",
  reason: "Contact is enrolled in a reactivation-oriented sequence.",
};

function normalizeStage(stage: string): string {
  return stage.trim().toLowerCase();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isOnboardingStage(stage: string): boolean {
  return normalizeStage(stage) === "onboarding";
}

function tag(
  key: string,
  label: string,
  category: CustomerTagCategory,
  severity: CustomerTagSeverity,
  reason: string,
): ComputedCustomerTag {
  return { key, label, category, severity, reason };
}

function daysSinceDate(isoDate: string, now = Date.now()): number | null {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return null;
  return (now - parsed.getTime()) / MS_PER_DAY;
}

function isWithinCoolingWindow(isoDate: string, windowDays: number, now = Date.now()): boolean {
  const elapsed = daysSinceDate(isoDate, now);
  return elapsed !== null && elapsed >= 0 && elapsed < windowDays;
}

function activeOrPausedEnrollments(
  enrollments: SequenceEnrollment[] | undefined,
  contactEmail?: string,
): SequenceEnrollment[] {
  if (!enrollments?.length) return [];
  return enrollments.filter((entry) => {
    if (entry.enrollment_status !== "active" && entry.enrollment_status !== "paused") {
      return false;
    }
    if (contactEmail !== undefined) {
      return normalizeEmail(entry.contact_email) === normalizeEmail(contactEmail);
    }
    return true;
  });
}

function inferSequenceCategory(
  sequenceKey: string,
  sequenceName: string,
  sequences?: JourneyTagSequence[],
): SequenceCategory | "reactivation" | null {
  const fromLibrary = sequences?.find((seq) => seq.key === sequenceKey);
  if (fromLibrary) {
    const combined = `${fromLibrary.key} ${fromLibrary.name}`.toLowerCase();
    if (/reactivat/.test(combined)) return "reactivation";
    return fromLibrary.category;
  }

  const combined = `${sequenceKey} ${sequenceName}`.toLowerCase();
  if (/reactivat/.test(combined)) return "reactivation";
  if (/renewal/.test(combined)) return "renewal";
  if (/activ|usage|getting-started/.test(combined)) return "activation";
  if (/academy|webinar|education/.test(combined)) return "education";
  if (/invite|onboard|seat/.test(combined)) return "onboarding";
  return null;
}

/** Account-level tags derived from customer row fields. */
export function computeAccountTags(customer: Customer): ComputedCustomerTag[] {
  const tags: ComputedCustomerTag[] = [];

  if (customer.days_since_start <= 30 || isOnboardingStage(customer.stage)) {
    tags.push(
      tag(
        "account-new-customer",
        "New Customer",
        "account",
        "info",
        customer.days_since_start <= 30
          ? `Account started ${customer.days_since_start} days ago.`
          : `Lifecycle stage is ${customer.stage}.`,
      ),
    );
  }

  if (isOnboardingStage(customer.stage) || customer.days_since_start <= 90) {
    tags.push(
      tag(
        "account-onboarding",
        "Onboarding",
        "account",
        "info",
        isOnboardingStage(customer.stage)
          ? `Lifecycle stage is ${customer.stage}.`
          : `Account is within the first 90 days (${customer.days_since_start} days since start).`,
      ),
    );
  }

  if (customer.usage_sessions > 0 && customer.invite_status === "Accepted") {
    tags.push(
      tag(
        "account-activated",
        "Activated",
        "account",
        "success",
        `${customer.usage_sessions} usage session(s) with invite accepted.`,
      ),
    );
  }

  if (customer.usage_threshold_percent < 30) {
    tags.push(
      tag(
        "account-low-usage",
        "Low Usage",
        "account",
        "warning",
        `Usage is ${customer.usage_threshold_percent}% of threshold.`,
      ),
    );
  }

  if (customer.usage_threshold_percent >= 70) {
    tags.push(
      tag(
        "account-high-usage",
        "High Usage",
        "account",
        "success",
        `Usage is ${customer.usage_threshold_percent}% of threshold.`,
      ),
    );
  }

  if (
    customer.days_to_renewal <= 90 &&
    customer.usage_threshold_percent < 50
  ) {
    tags.push(
      tag(
        "account-renewal-risk",
        "Renewal Risk",
        "account",
        "risk",
        `Renewal in ${customer.days_to_renewal} days with usage at ${customer.usage_threshold_percent}%.`,
      ),
    );
  }

  if (
    customer.seat_assignment_percent >= 85 &&
    customer.usage_threshold_percent >= 50
  ) {
    tags.push(
      tag(
        "account-expansion-opportunity",
        "Expansion Opportunity",
        "account",
        "success",
        `Seats ${customer.seat_assignment_percent}% assigned with strong usage.`,
      ),
    );
  }

  if (customer.usage_sessions === 0 && customer.days_since_start >= 30) {
    tags.push(
      tag(
        "account-dormant",
        "Dormant",
        "account",
        "warning",
        `No usage after ${customer.days_since_start} days since start.`,
      ),
    );
  }

  return tags;
}

function isContactCoolingActive(
  customer: Customer,
  contactEmail: string,
  sendLogs?: SendLog[],
  now = Date.now(),
): boolean {
  const emailNorm = normalizeEmail(contactEmail);

  if (sendLogs?.length) {
    for (const log of sendLogs) {
      if (normalizeEmail(log.recipient) !== emailNorm) continue;
      if (isWithinCoolingWindow(log.date, COOLING_DAYS, now)) {
        return true;
      }
    }
  }

  const adminEmail = customer.admin_email?.trim()
    ? normalizeEmail(customer.admin_email)
    : "";
  const userEmail = customer.user_email?.trim()
    ? normalizeEmail(customer.user_email)
    : "";

  if (
    customer.last_email_sent_date?.trim() &&
    (emailNorm === adminEmail || emailNorm === userEmail) &&
    isWithinCoolingWindow(customer.last_email_sent_date, COOLING_DAYS, now)
  ) {
    return true;
  }

  return false;
}

/**
 * Contact-level tags for a resolved contact email + role.
 * Uses account fields as proxy when contact-level history is unavailable.
 */
export function computeContactTags(input: {
  customer: Customer;
  contactEmail: string;
  contactRole: "Admin" | "User" | "CSM" | string;
  enrollments?: SequenceEnrollment[];
  sendLogs?: SendLog[];
}): ComputedCustomerTag[] {
  const { customer, contactEmail, contactRole, enrollments, sendLogs } = input;
  const tags: ComputedCustomerTag[] = [];

  if (contactRole === "Admin") {
    tags.push(
      tag("contact-admin", "Admin", "contact", "info", "Resolved admin contact."),
    );
  }

  if (contactRole === "User") {
    tags.push(
      tag(
        "contact-end-user",
        "End User",
        "contact",
        "info",
        "Resolved end-user contact.",
      ),
    );
  }

  if (customer.invite_status === "Pending") {
    tags.push(
      tag(
        "contact-pending-invite",
        "Pending Invite",
        "contact",
        "warning",
        contactRole === "Admin"
          ? "Account invite is still pending for admin contact."
          : "Account invite is pending (account-level proxy).",
      ),
    );
  }

  if (customer.invite_status === "Accepted") {
    tags.push(
      tag(
        "contact-accepted-invite",
        "Accepted Invite",
        "contact",
        "success",
        "Account invite has been accepted.",
      ),
    );
  }

  if (customer.usage_sessions === 0) {
    tags.push(
      tag(
        "contact-no-usage",
        "No Usage",
        "contact",
        "warning",
        "Account has no product usage (account-level proxy).",
      ),
    );
  }

  if (contactRole === "User" && customer.active_users >= 1) {
    tags.push(
      tag(
        "contact-power-user",
        "Power User",
        "contact",
        "success",
        `${customer.active_users} active user(s) on account (account-level proxy).`,
      ),
    );
  }

  const contactEnrollments = activeOrPausedEnrollments(enrollments, contactEmail);
  if (contactEnrollments.length > 0) {
    const names = contactEnrollments.map((entry) => entry.sequence_name).join(", ");
    tags.push(
      tag(
        "contact-in-sequence",
        "In Sequence",
        "contact",
        "info",
        `Active or paused enrollment: ${names}.`,
      ),
    );
  }

  if (isContactCoolingActive(customer, contactEmail, sendLogs)) {
    tags.push(
      tag(
        "contact-cooling-active",
        "Cooling Active",
        "contact",
        "warning",
        `Contact email was messaged within the last ${COOLING_DAYS} days.`,
      ),
    );
  }

  // Known limitation: Do Not Contact tag is not computed until `do_not_contact`
  // exists on Customer or Contact (planned — not in current upload model).

  return tags;
}

/** Journey tags from active/paused enrollments and sequence metadata. */
export function computeJourneyTags(input: {
  customer: Customer;
  enrollments?: SequenceEnrollment[];
  sequences?: JourneyTagSequence[];
}): ComputedCustomerTag[] {
  const { customer, enrollments, sequences } = input;
  const tags: ComputedCustomerTag[] = [];
  const seen = new Set<string>();

  const accountEnrollments = activeOrPausedEnrollments(enrollments)?.filter(
    (entry) => entry.account_id === customer.customer_id,
  );

  for (const enrollment of accountEnrollments) {
    const category = inferSequenceCategory(
      enrollment.sequence_key,
      enrollment.sequence_name,
      sequences,
    );

    if (category === "reactivation") {
      if (!seen.has(REACTIVATION_JOURNEY_TAG.key)) {
        seen.add(REACTIVATION_JOURNEY_TAG.key);
        tags.push({
          ...REACTIVATION_JOURNEY_TAG,
          reason: `Enrolled in "${enrollment.sequence_name}".`,
        });
      }
      continue;
    }

    if (!category) continue;

    const journeyMeta = JOURNEY_TAG_BY_CATEGORY[category];
    if (seen.has(journeyMeta.key)) continue;

    seen.add(journeyMeta.key);
    tags.push(
      tag(
        journeyMeta.key,
        journeyMeta.label,
        "journey",
        journeyMeta.severity,
        `Enrolled in "${enrollment.sequence_name}" (${category}).`,
      ),
    );
  }

  return tags;
}

/** Combined account + journey tags for one customer row. */
export function computeCustomerTags(input: {
  customer: Customer;
  enrollments?: SequenceEnrollment[];
  sequences?: JourneyTagSequence[];
  sendLogs?: SendLog[];
}): ComputedCustomerTag[] {
  const { customer, enrollments, sequences } = input;
  return [
    ...computeAccountTags(customer),
    ...computeJourneyTags({ customer, enrollments, sequences }),
  ];
}
