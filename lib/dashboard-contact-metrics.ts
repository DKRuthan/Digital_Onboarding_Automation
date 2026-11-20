import { displayContactEmail } from "./action-queue-display";
import { buildContactsForDisplay, getDuplicateContactEmails } from "./customer-contacts";
import {
  aggregateCustomerDataQualityIssues,
  computeCustomerDataQualitySummary,
} from "./customer-data-quality";
import { computeContactTags, computeCustomerTags } from "./customer-tags";
import type { SequenceEnrollment } from "./email-sequence-types";
import type { ActionQueueItem, Customer, ImportedContact, SendLog } from "./types";

export interface ContactDashboardMetrics {
  totalContacts: number;
  contactsInSequence: number;
  contactsCoolingActive: number;
  contactsWithDataQualityIssues: number;
  contactActionsDueNow: number;
  unresolvedContactEmails: number;
}

export interface AccountContextMetrics {
  totalAccounts: number;
  lowUsageAccounts: number;
  renewalRiskAccounts: number;
  accountsWithDataQualityIssues: number;
}

export interface DashboardContactMetricsResult {
  contact: ContactDashboardMetrics;
  account: AccountContextMetrics;
  dataQualityWarning: string | null;
}

function contactInSequence(
  contactEmail: string,
  enrollments: SequenceEnrollment[],
): boolean {
  const normalized = contactEmail.trim().toLowerCase();
  return enrollments.some(
    (entry) =>
      entry.contact_email.trim().toLowerCase() === normalized &&
      (entry.enrollment_status === "active" ||
        entry.enrollment_status === "paused"),
  );
}

function contactHasDataQualityIssue(
  contact: ReturnType<typeof buildContactsForDisplay>["contacts"][number],
  crossAccountDuplicateEmails: Set<string>,
): boolean {
  if (!contact.is_valid_email) return true;
  if (crossAccountDuplicateEmails.has(contact.contact_email)) return true;
  return false;
}

/** Display-only contact-first dashboard metrics. Does not mutate data. */
export function computeDashboardContactMetrics(input: {
  customers: Customer[];
  importedContacts?: ImportedContact[];
  dataSource?: "demo" | "upload";
  enrollments: SequenceEnrollment[];
  sendLogs: SendLog[];
  actionQueue: ActionQueueItem[];
}): DashboardContactMetricsResult {
  const { customers, enrollments, sendLogs, actionQueue } = input;
  const { contacts: allContacts } = buildContactsForDisplay({
    customers,
    importedContacts: input.importedContacts,
    dataSource: input.dataSource,
  });
  const duplicateEmailMap = getDuplicateContactEmails(customers);
  const crossAccountDuplicateEmails = new Set(duplicateEmailMap.keys());

  const customerMap = new Map(customers.map((c) => [c.customer_id, c]));

  const contactsInSequenceSet = new Set<string>();
  let contactsCoolingActive = 0;
  let contactsWithDataQualityIssues = 0;

  for (const contact of allContacts) {
    if (contactInSequence(contact.contact_email, enrollments)) {
      contactsInSequenceSet.add(contact.contact_email);
    }

    const customer = customerMap.get(contact.customer_id);
    if (customer) {
      const tags = computeContactTags({
        customer,
        contactEmail: contact.contact_email,
        contactRole: contact.contact_role,
        enrollments,
        sendLogs,
      });
      if (tags.some((tag) => tag.key === "contact-cooling-active")) {
        contactsCoolingActive += 1;
      }
    }

    if (contactHasDataQualityIssue(contact, crossAccountDuplicateEmails)) {
      contactsWithDataQualityIssues += 1;
    }
  }

  const contactActionsDueNow = actionQueue.filter(
    (item) => item.schedule_status === "due_now",
  ).length;

  const unresolvedQueueItems = actionQueue.filter(
    (item) => displayContactEmail(item) === null,
  ).length;

  let renewalRiskAccounts = 0;
  for (const customer of customers) {
    const tags = computeCustomerTags({ customer, enrollments });
    if (tags.some((tag) => tag.key === "account-renewal-risk")) {
      renewalRiskAccounts += 1;
    }
  }

  const qualitySummary = computeCustomerDataQualitySummary(customers, {
    enrollments,
  });

  const aggregatedIssues = aggregateCustomerDataQualityIssues(customers, {
    enrollments,
  });

  let dataQualityWarning: string | null = null;
  if (aggregatedIssues.length > 0) {
    const top = aggregatedIssues[0];
    dataQualityWarning = `${top.count} account${top.count === 1 ? "" : "s"} have ${top.label.toLowerCase()}. Internal routing may need review.`;
  } else if (qualitySummary.customersWithIssues > 0) {
    dataQualityWarning = `${qualitySummary.customersWithIssues} account${qualitySummary.customersWithIssues === 1 ? "" : "s"} have data quality issues. Internal routing may need review.`;
  }

  return {
    contact: {
      totalContacts: allContacts.length,
      contactsInSequence: contactsInSequenceSet.size,
      contactsCoolingActive,
      contactsWithDataQualityIssues,
      contactActionsDueNow,
      unresolvedContactEmails: unresolvedQueueItems,
    },
    account: {
      totalAccounts: customers.length,
      lowUsageAccounts: customers.filter((c) => c.usage_threshold_percent < 30)
        .length,
      renewalRiskAccounts,
      accountsWithDataQualityIssues: qualitySummary.customersWithIssues,
    },
    dataQualityWarning,
  };
}
