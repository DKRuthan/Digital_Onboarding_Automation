import type { SequenceEnrollment } from "./email-sequence-types";
import { resolveSequenceContacts } from "./email-sequence-contacts";
import type { Customer } from "./types";

export type DataQualitySeverity = "info" | "warning" | "blocker";

export type DataQualityIssue = {
  key: string;
  label: string;
  severity: DataQualitySeverity;
  field?: string;
  message: string;
  impact: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_SINCE_START_TOLERANCE = 2;

export function isValidCustomerEmail(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && EMAIL_RE.test(trimmed);
}

function issue(
  key: string,
  label: string,
  severity: DataQualitySeverity,
  message: string,
  impact: string,
  field?: string,
): DataQualityIssue {
  return { key, label, severity, field, message, impact };
}

function parseDateOnly(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isMissingString(value: string | undefined | null): boolean {
  return !value?.trim();
}

function isMissingUsageNumber(value: number | undefined | null): boolean {
  return value === undefined || value === null || !Number.isFinite(value);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function expectedDaysSinceStart(termStartDate: string, now = Date.now()): number | null {
  const start = parseDateOnly(termStartDate);
  if (!start) return null;
  return Math.floor((now - start.getTime()) / MS_PER_DAY);
}

function customerContactEmails(customer: Customer): string[] {
  const emails: string[] = [];
  if (customer.admin_email?.trim()) {
    emails.push(normalizeEmail(customer.admin_email));
  }
  if (customer.user_email?.trim()) {
    emails.push(normalizeEmail(customer.user_email));
  }
  const csmContacts = resolveSequenceContacts(customer, "CSM");
  for (const contact of csmContacts) {
    if (contact.contact_email.includes("@")) {
      emails.push(normalizeEmail(contact.contact_email));
    }
  }
  return emails;
}

function enrollmentMatchesCustomer(
  enrollment: SequenceEnrollment,
  customer: Customer,
): boolean {
  if (enrollment.account_id === customer.customer_id) return true;
  const contactEmails = customerContactEmails(customer);
  return contactEmails.includes(normalizeEmail(enrollment.contact_email));
}

function contactEmailOnCustomer(
  customer: Customer,
  contactEmail: string,
): boolean {
  return customerContactEmails(customer).includes(normalizeEmail(contactEmail));
}

/** Per-customer data quality issues (single-row checks). */
export function computeCustomerDataQualityIssues(
  customer: Customer,
  options?: {
    enrollments?: SequenceEnrollment[];
  },
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  const enrollments = options?.enrollments;

  if (isMissingString(customer.customer_id)) {
    issues.push(
      issue(
        "missing-customer-id",
        "Missing customer ID",
        "blocker",
        "Customer ID is required.",
        "Account cannot be uniquely identified in uploads, queue rows, or exports.",
        "customer_id",
      ),
    );
  }

  if (isMissingString(customer.customer_name)) {
    issues.push(
      issue(
        "missing-customer-name",
        "Missing customer name",
        "blocker",
        "Customer name is required.",
        "Account context is incomplete across Customer Data and Action Queue.",
        "customer_name",
      ),
    );
  }

  if (isMissingString(customer.admin_email)) {
    issues.push(
      issue(
        "missing-admin-email",
        "Missing admin email",
        "blocker",
        "Admin email is missing.",
        "Admin triggers, sequences, and contact resolution are blocked.",
        "admin_email",
      ),
    );
  } else if (!isValidCustomerEmail(customer.admin_email)) {
    issues.push(
      issue(
        "invalid-admin-email",
        "Invalid admin email",
        "blocker",
        `Admin email "${customer.admin_email}" is not a valid email address.`,
        "Admin triggers and sequences cannot resolve a contact.",
        "admin_email",
      ),
    );
  }

  if (isMissingString(customer.invite_status)) {
    issues.push(
      issue(
        "missing-invite-status",
        "Missing invite status",
        "blocker",
        "Invite status is required.",
        "Invite-based Activity Triggers cannot evaluate this account.",
        "invite_status",
      ),
    );
  }

  if (isMissingUsageNumber(customer.usage_sessions)) {
    issues.push(
      issue(
        "missing-usage-sessions",
        "Missing usage sessions",
        "blocker",
        "Usage sessions value is missing or invalid.",
        "Usage-based triggers and tags cannot evaluate this account.",
        "usage_sessions",
      ),
    );
  }

  if (isMissingUsageNumber(customer.usage_threshold_percent)) {
    issues.push(
      issue(
        "missing-usage-threshold-percent",
        "Missing usage threshold %",
        "blocker",
        "Usage threshold percent is missing or invalid.",
        "Low/high usage triggers and tags cannot evaluate this account.",
        "usage_threshold_percent",
      ),
    );
  }

  if (isMissingString(customer.user_email)) {
    issues.push(
      issue(
        "missing-user-email",
        "Missing user email",
        "warning",
        "User email is missing.",
        "User-role sequences and contact tags may be unavailable.",
        "user_email",
      ),
    );
  } else if (!isValidCustomerEmail(customer.user_email)) {
    issues.push(
      issue(
        "invalid-user-email",
        "Invalid user email",
        "warning",
        `User email "${customer.user_email}" is not a valid email address.`,
        "User-targeted sequence steps may fail for this account.",
        "user_email",
      ),
    );
  }

  if (isMissingString(customer.owner)) {
    issues.push(
      issue(
        "missing-owner",
        "Missing CSM owner",
        "warning",
        "CSM/DAM owner is missing.",
        "Internal alerts and CSM contact resolution may not route correctly.",
        "owner",
      ),
    );
  } else if (!isValidCustomerEmail(customer.owner)) {
    issues.push(
      issue(
        "owner-not-email",
        "CSM owner is not an email",
        "warning",
        `CSM owner "${customer.owner}" is a name, not an email address.`,
        "CSM sequence steps and internal contact resolution may fail.",
        "owner",
      ),
    );
  }

  if (isMissingString(customer.renewal_date)) {
    issues.push(
      issue(
        "missing-renewal-date",
        "Missing renewal date",
        "warning",
        "Renewal date is missing.",
        "Renewal triggers, tags, and timing anchors may be unreliable.",
        "renewal_date",
      ),
    );
  }

  if (
    Number.isFinite(customer.seats_total) &&
    Number.isFinite(customer.seats_assigned) &&
    customer.seats_assigned > customer.seats_total
  ) {
    issues.push(
      issue(
        "seats-assigned-exceeds-total",
        "Seats assigned exceeds total",
        "warning",
        `${customer.seats_assigned} seats assigned but only ${customer.seats_total} licensed.`,
        "Seat assignment metrics and triggers may be misleading.",
        "seats_assigned",
      ),
    );
  }

  const expectedDays = expectedDaysSinceStart(customer.term_start_date);
  if (
    expectedDays !== null &&
    Math.abs(expectedDays - customer.days_since_start) > DAYS_SINCE_START_TOLERANCE
  ) {
    issues.push(
      issue(
        "days-since-start-mismatch",
        "Days since start mismatch",
        "warning",
        `days_since_start is ${customer.days_since_start} but term_start_date implies about ${expectedDays} days.`,
        "Scheduled trigger and sequence timing may be off.",
        "days_since_start",
      ),
    );
  }

  if (
    !customer.last_email_sent_date?.trim() &&
    customer.emails_sent_count === 0
  ) {
    issues.push(
      issue(
        "no-communication-history",
        "No communication history",
        "info",
        "No last email date and emails sent count is zero.",
        "Cooling and communication tags rely on session logs until history exists.",
        "last_email_sent_date",
      ),
    );
  }

  if (enrollments?.length) {
    const related = enrollments.filter((entry) =>
      enrollmentMatchesCustomer(entry, customer),
    );

    for (const enrollment of related) {
      if (enrollment.account_id !== customer.customer_id) {
        issues.push(
          issue(
            "stale-enrollment-account",
            "Enrollment account mismatch",
            "warning",
            `Enrollment "${enrollment.sequence_name}" references account ${enrollment.account_id}, not ${customer.customer_id}.`,
            "Sequence enrollments may be stale after customer data changes.",
            "account_id",
          ),
        );
      }

      if (!contactEmailOnCustomer(customer, enrollment.contact_email)) {
        issues.push(
          issue(
            "stale-enrollment-contact",
            "Enrollment contact mismatch",
            "warning",
            `Enrollment contact ${enrollment.contact_email} is not on this customer row.`,
            "Sequence queue rows may reference a stale contact email.",
            "contact_email",
          ),
        );
      }
    }
  }

  return issues;
}

function appendDuplicateContactEmailIssues(
  customers: Customer[],
  issuesByCustomer: Map<string, DataQualityIssue[]>,
): void {
  const emailToCustomerIds = new Map<string, string[]>();

  for (const customer of customers) {
    for (const email of customerContactEmails(customer)) {
      const existing = emailToCustomerIds.get(email) ?? [];
      if (!existing.includes(customer.customer_id)) {
        existing.push(customer.customer_id);
        emailToCustomerIds.set(email, existing);
      }
    }
  }

  for (const [email, customerIds] of emailToCustomerIds) {
    if (customerIds.length <= 1) continue;

    for (const customerId of customerIds) {
      const issues = issuesByCustomer.get(customerId) ?? [];
      if (issues.some((entry) => entry.key === `duplicate-contact-email:${email}`)) {
        continue;
      }

      issues.push(
        issue(
          `duplicate-contact-email:${email}`,
          "Duplicate contact email",
          "warning",
          `Contact email ${email} appears on ${customerIds.length} accounts (${customerIds.join(", ")}).`,
          "Cross-account cooling and contact identity may be ambiguous.",
          "admin_email",
        ),
      );
      issuesByCustomer.set(customerId, issues);
    }
  }
}

/** Per-customer issues plus cross-account duplicate ID/email checks. */
export function computeAllCustomerDataQualityIssues(
  customers: Customer[],
  options?: {
    enrollments?: SequenceEnrollment[];
  },
): Map<string, DataQualityIssue[]> {
  const issuesByCustomer = new Map<string, DataQualityIssue[]>();
  const seenCustomerIds = new Map<string, number>();

  for (const customer of customers) {
    const rowIssues = computeCustomerDataQualityIssues(customer, options);

    if (customer.customer_id.trim()) {
      const count = (seenCustomerIds.get(customer.customer_id) ?? 0) + 1;
      seenCustomerIds.set(customer.customer_id, count);
      if (count > 1) {
        rowIssues.push(
          issue(
            "duplicate-customer-id",
            "Duplicate customer ID",
            "blocker",
            `Customer ID "${customer.customer_id}" appears more than once in the current dataset.`,
            "Upload and queue identity may conflict until duplicates are resolved.",
            "customer_id",
          ),
        );
      }
    }

    issuesByCustomer.set(customer.customer_id, rowIssues);
  }

  appendDuplicateContactEmailIssues(customers, issuesByCustomer);
  return issuesByCustomer;
}

export function computeCustomerDataQualitySummary(
  customers: Customer[],
  options?: {
    enrollments?: SequenceEnrollment[];
  },
): {
  totalIssues: number;
  blockerCount: number;
  warningCount: number;
  infoCount: number;
  customersWithIssues: number;
} {
  const allIssues = computeAllCustomerDataQualityIssues(customers, options);

  let totalIssues = 0;
  let blockerCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  let customersWithIssues = 0;

  for (const issues of allIssues.values()) {
    if (issues.length === 0) continue;
    customersWithIssues += 1;
    totalIssues += issues.length;

    for (const entry of issues) {
      if (entry.severity === "blocker") blockerCount += 1;
      else if (entry.severity === "warning") warningCount += 1;
      else infoCount += 1;
    }
  }

  return {
    totalIssues,
    blockerCount,
    warningCount,
    infoCount,
    customersWithIssues,
  };
}

export type AffectedCustomerQualityIssue = {
  customer_id: string;
  customer_name: string;
  owner: string;
  message: string;
  impact: string;
};

export type AggregatedDataQualityIssue = {
  groupKey: string;
  label: string;
  severity: DataQualitySeverity;
  impact: string;
  count: number;
  affectedCustomers: AffectedCustomerQualityIssue[];
};

function normalizeAggregateIssueKey(key: string): string {
  if (key.startsWith("duplicate-contact-email:")) {
    return "duplicate-contact-email";
  }
  return key;
}

/** Group recurring data quality issues across customers, sorted by severity then count. */
export function aggregateCustomerDataQualityIssues(
  customers: Customer[],
  options?: {
    enrollments?: SequenceEnrollment[];
  },
): AggregatedDataQualityIssue[] {
  const issuesByCustomer = computeAllCustomerDataQualityIssues(customers, options);
  const groups = new Map<string, AggregatedDataQualityIssue>();

  for (const customer of customers) {
    const issues = issuesByCustomer.get(customer.customer_id) ?? [];
    for (const entry of issues) {
      const groupKey = normalizeAggregateIssueKey(entry.key);
      const affected: AffectedCustomerQualityIssue = {
        customer_id: customer.customer_id,
        customer_name: customer.customer_name,
        owner: customer.owner,
        message: entry.message,
        impact: entry.impact,
      };

      const existing = groups.get(groupKey);
      if (existing) {
        existing.count += 1;
        existing.affectedCustomers.push(affected);
      } else {
        groups.set(groupKey, {
          groupKey,
          label: entry.label,
          severity: entry.severity,
          impact: entry.impact,
          count: 1,
          affectedCustomers: [affected],
        });
      }
    }
  }

  const severityOrder: Record<DataQualitySeverity, number> = {
    blocker: 0,
    warning: 1,
    info: 2,
  };

  return [...groups.values()].sort((a, b) => {
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return b.count - a.count;
  });
}