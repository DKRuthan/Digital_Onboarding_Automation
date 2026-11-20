import { displayContactEmail } from "./action-queue-display";
import { computeWorkflowSummary } from "./action-workflow";
import { displayLogContactEmail, displayLogSource, isActualProviderSendLog, isSimulatedLedgerLog } from "./communication-log-display";
import { computeDashboardContactMetrics } from "./dashboard-contact-metrics";
import { computeContactTags, computeCustomerTags } from "./customer-tags";
import { buildContactsForDisplay } from "./customer-contacts";
import {
  computeCustomerDataQualityIssues,
  computeCustomerDataQualitySummary,
} from "./customer-data-quality";
import type { EditableEmailSequence } from "./email-sequence-definitions";
import type { SequenceEnrollment } from "./email-sequence-types";
import type { ContactsImportQualitySummary } from "./import-contacts-quality-summary";
import type {
  ActionQueueItem,
  Customer,
  EditableAutomationRule,
  ImportedContact,
  SendLog,
} from "./types";
import { isQueueConflictClear } from "./types";
import type { ValidationResult } from "./upload-validation";

export type ReportsSnapshotInput = {
  customers: Customer[];
  importedContacts?: ImportedContact[];
  dataSource?: "demo" | "upload";
  actionQueue: ActionQueueItem[];
  sendLogs: SendLog[];
  emailSequences: EditableEmailSequence[];
  enrollments: SequenceEnrollment[];
  rules: EditableAutomationRule[];
  lastValidation?: ValidationResult | null;
};

export type ExecutiveOverviewReport = {
  totalAccounts: number;
  totalContacts: number;
  contactsInSequence: number;
  contactsCoolingActive: number;
  actionsDueNow: number;
  totalCommunicationLogs: number;
  accountDataQualityWarnings: number;
  accountDataQualityBlockers: number;
};

export type ImportQualityReport = {
  available: boolean;
  lastImportFormat: "option_a" | "option_c" | null;
  accountsImported: number | null;
  contactsImported: number | null;
  signalsDetected: number | null;
  customersAfterRollup: number | null;
  importBlockers: number;
  importWarnings: number;
  importInfo: number;
  rollupWarnings: number;
  contactsQuality: ContactsImportQualitySummary | null;
  signalsNotImported: boolean;
  signalsNote: string | null;
};

export type ContactJourneyReport = {
  totalContacts: number;
  contactsByRole: {
    admin: number;
    user: number;
    csm: number;
  };
  contactsInSequence: number;
  contactsNotInSequence: number;
  contactsCoolingActive: number;
  contactsCoolingClear: number;
  unresolvedContactEmailActions: number;
  doNotContactWarnings: number | null;
};

export type ActionQueueReport = {
  totalQueueItems: number;
  byWorkflowStatus: Record<string, number>;
  needsReview: number;
  previewed: number;
  testSent: number;
  approved: number;
  skipped: number;
  blocked: number;
  dueNow: number;
  conflictBlocked: number;
  unresolvedContactEmails: number;
  bySource: {
    trigger: number;
    sequence: number;
    unknown: number;
  };
};

export type CommunicationReport = {
  totalLogs: number;
  simulatedSentCount: number;
  actualSentCount: number;
  notSentCount: number;
  failedCount: number;
  bySource: Record<string, number>;
  byStatus: Record<string, number>;
  bySendMode: Record<string, number>;
  byTemplate: Record<string, number>;
  contactResolvedLogs: number;
  unresolvedContactLogs: number;
};

export type SequenceReport = {
  totalSequences: number;
  approvedSequences: number;
  activeSequences: number;
  archivedSequences: number;
  draftSequences: number;
  totalEnrollments: number;
  enrolledContacts: number;
  enrollmentsByStatus: Record<string, number>;
  pausedEnrollments: number;
  completedEnrollments: number;
  completedSteps: number;
};

export type AccountContextReport = {
  lowUsageAccounts: number;
  renewalRiskAccounts: number;
  accountsWithDataQualityWarnings: number;
  accountsWithDataQualityBlockers: number;
  missingOwnerDamEmailAccounts: number;
  planBreakdown: Record<string, number>;
  stageBreakdown: Record<string, number>;
};

export type ReportsSnapshot = {
  generatedAt: string;
  executiveOverview: ExecutiveOverviewReport;
  importQuality: ImportQualityReport;
  contactJourney: ContactJourneyReport;
  actionQueue: ActionQueueReport;
  communication: CommunicationReport;
  sequences: SequenceReport;
  accountContext: AccountContextReport;
  dataGaps: string[];
};

const REPORT_DATA_GAPS = [
  "Signals are detected but not imported into Communication Logs yet.",
  "Customer rollup maps first Admin/User per account; all Contacts sheet rows live in importedContacts session state.",
  "Import metadata is session-only.",
  "Communication Logs are session/demo based.",
  "Sequence progression is manual/localStorage based.",
  "Customer SendGrid delivery analytics are not available because customer sends are disabled.",
  "Trigger fire history is not stored.",
  "No persistent database/reporting history yet.",
] as const;

function countByKey<T>(
  items: T[],
  keyFn: (item: T) => string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = keyFn(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
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

function buildExecutiveOverview(input: ReportsSnapshotInput): ExecutiveOverviewReport {
  const dashboard = computeDashboardContactMetrics({
    customers: input.customers,
    importedContacts: input.importedContacts,
    dataSource: input.dataSource,
    enrollments: input.enrollments,
    sendLogs: input.sendLogs,
    actionQueue: input.actionQueue,
  });

  const quality = computeCustomerDataQualitySummary(input.customers, {
    enrollments: input.enrollments,
  });

  return {
    totalAccounts: dashboard.account.totalAccounts,
    totalContacts: dashboard.contact.totalContacts,
    contactsInSequence: dashboard.contact.contactsInSequence,
    contactsCoolingActive: dashboard.contact.contactsCoolingActive,
    actionsDueNow: dashboard.contact.contactActionsDueNow,
    totalCommunicationLogs: input.sendLogs.length,
    accountDataQualityWarnings: quality.warningCount,
    accountDataQualityBlockers: quality.blockerCount,
  };
}

function buildImportQuality(
  lastValidation: ValidationResult | null | undefined,
): ImportQualityReport {
  if (!lastValidation?.importSummary) {
    return {
      available: false,
      lastImportFormat: null,
      accountsImported: null,
      contactsImported: null,
      signalsDetected: null,
      customersAfterRollup: null,
      importBlockers: 0,
      importWarnings: 0,
      importInfo: 0,
      rollupWarnings: 0,
      contactsQuality: null,
      signalsNotImported: false,
      signalsNote: null,
    };
  }

  const summary = lastValidation.importSummary;
  const issues = lastValidation.importIssues ?? [];
  const blockers = issues.filter((issue) => issue.severity === "blocker");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  const info = issues.filter((issue) => issue.severity === "info");

  const signalsCount = summary.signalsCount ?? 0;
  const signalsSheetFound = summary.signalsSheetFound ?? false;
  const signalsNotImported = signalsSheetFound && signalsCount > 0;

  const signalsNote =
    lastValidation.importNotes?.find((note) =>
      note.toLowerCase().includes("signals"),
    ) ??
    (signalsNotImported ? "Signals sheet detected but not imported yet." : null);

  return {
    available: true,
    lastImportFormat:
      summary.format === "option_a" || summary.format === "option_c"
        ? summary.format
        : null,
    accountsImported: summary.accountsCount ?? null,
    contactsImported: summary.contactsCount ?? null,
    signalsDetected: signalsSheetFound ? signalsCount : null,
    customersAfterRollup: summary.customersCount ?? null,
    importBlockers: blockers.length,
    importWarnings: warnings.length,
    importInfo: info.length,
    rollupWarnings: lastValidation.importWarnings?.length ?? 0,
    contactsQuality: summary.contactsQuality ?? null,
    signalsNotImported,
    signalsNote,
  };
}

function buildContactJourney(input: ReportsSnapshotInput): ContactJourneyReport {
  const { contacts: allContacts } = buildContactsForDisplay({
    customers: input.customers,
    importedContacts: input.importedContacts,
    dataSource: input.dataSource,
  });
  const customerMap = new Map(input.customers.map((c) => [c.customer_id, c]));

  let admin = 0;
  let user = 0;
  let csm = 0;
  let contactsCoolingActive = 0;
  let contactsInSequence = 0;

  for (const contact of allContacts) {
    const role = String(contact.contact_role).toLowerCase();
    if (role === "admin") admin += 1;
    else if (role === "user") user += 1;
    else if (role === "csm") csm += 1;

    if (contactInSequence(contact.contact_email, input.enrollments)) {
      contactsInSequence += 1;
    }

    const customer = customerMap.get(contact.customer_id);
    if (customer) {
      const tags = computeContactTags({
        customer,
        contactEmail: contact.contact_email,
        contactRole: contact.contact_role,
        enrollments: input.enrollments,
        sendLogs: input.sendLogs,
      });
      if (tags.some((tag) => tag.key === "contact-cooling-active")) {
        contactsCoolingActive += 1;
      }
    }
  }

  const unresolvedContactEmailActions = input.actionQueue.filter(
    (item) => displayContactEmail(item) === null,
  ).length;

  const contactsQuality = input.lastValidation?.importSummary?.contactsQuality;

  return {
    totalContacts: allContacts.length,
    contactsByRole: { admin, user, csm },
    contactsInSequence,
    contactsNotInSequence: allContacts.length - contactsInSequence,
    contactsCoolingActive,
    contactsCoolingClear: allContacts.length - contactsCoolingActive,
    unresolvedContactEmailActions,
    doNotContactWarnings: contactsQuality?.doNotContactContacts ?? null,
  };
}

function buildActionQueueReport(actionQueue: ActionQueueItem[]): ActionQueueReport {
  const workflow = computeWorkflowSummary(actionQueue);

  const byWorkflowStatus = countByKey(actionQueue, (item) => item.workflow_status);

  let trigger = 0;
  let sequence = 0;
  let unknown = 0;

  for (const item of actionQueue) {
    if (item.source === "rule") trigger += 1;
    else if (item.source === "sequence_enrollment") sequence += 1;
    else unknown += 1;
  }

  return {
    totalQueueItems: actionQueue.length,
    byWorkflowStatus,
    needsReview: workflow.needsReview,
    previewed: byWorkflowStatus["Previewed"] ?? 0,
    testSent: workflow.testSent,
    approved: workflow.approved,
    skipped: workflow.skipped,
    blocked: workflow.blocked,
    dueNow: actionQueue.filter((item) => item.schedule_status === "due_now").length,
    conflictBlocked: actionQueue.filter(
      (item) => !isQueueConflictClear(item.conflict_status),
    ).length,
    unresolvedContactEmails: actionQueue.filter(
      (item) => displayContactEmail(item) === null,
    ).length,
    bySource: { trigger, sequence, unknown },
  };
}

function buildCommunicationReport(sendLogs: SendLog[]): CommunicationReport {
  let contactResolvedLogs = 0;
  let simulatedSentCount = 0;
  let actualSentCount = 0;
  let notSentCount = 0;
  let failedCount = 0;

  for (const log of sendLogs) {
    if (displayLogContactEmail(log)) contactResolvedLogs += 1;
    if (isSimulatedLedgerLog(log)) simulatedSentCount += 1;
    if (isActualProviderSendLog(log)) actualSentCount += 1;
    if (
      log.delivery_status === "Not Sent" ||
      log.provider === "none" ||
      isSimulatedLedgerLog(log)
    ) {
      notSentCount += 1;
    }
    if (
      log.status === "Failed" ||
      log.status === "Bounced" ||
      log.status === "Internal Send Failed"
    ) {
      failedCount += 1;
    }
  }

  return {
    totalLogs: sendLogs.length,
    simulatedSentCount,
    actualSentCount,
    notSentCount,
    failedCount,
    bySource: countByKey(sendLogs, (log) => displayLogSource(log)),
    byStatus: countByKey(sendLogs, (log) => log.status),
    bySendMode: countByKey(sendLogs, (log) => log.send_mode?.trim() || "unknown"),
    byTemplate: countByKey(sendLogs, (log) => log.template?.trim() || "unknown"),
    contactResolvedLogs,
    unresolvedContactLogs: sendLogs.length - contactResolvedLogs,
  };
}

function buildSequenceReport(
  emailSequences: EditableEmailSequence[],
  enrollments: SequenceEnrollment[],
): SequenceReport {
  const approvedSequences = emailSequences.filter(
    (seq) => seq.status === "approved",
  ).length;
  const archivedSequences = emailSequences.filter(
    (seq) => seq.status === "archived",
  ).length;
  const draftSequences = emailSequences.filter(
    (seq) => seq.status === "draft",
  ).length;

  const enrolledContactSet = new Set(
    enrollments.map((entry) => entry.contact_email.trim().toLowerCase()),
  );

  let completedSteps = 0;
  for (const enrollment of enrollments) {
    completedSteps += enrollment.completed_steps?.length ?? 0;
  }

  return {
    totalSequences: emailSequences.length,
    approvedSequences,
    activeSequences: approvedSequences,
    archivedSequences,
    draftSequences,
    totalEnrollments: enrollments.length,
    enrolledContacts: enrolledContactSet.size,
    enrollmentsByStatus: countByKey(enrollments, (entry) => entry.enrollment_status),
    pausedEnrollments: enrollments.filter(
      (entry) => entry.enrollment_status === "paused",
    ).length,
    completedEnrollments: enrollments.filter(
      (entry) => entry.enrollment_status === "completed",
    ).length,
    completedSteps,
  };
}

function accountHasDataQualityWarnings(customer: Customer): boolean {
  const issues = computeCustomerDataQualityIssues(customer);
  return issues.some((entry) => entry.severity === "warning");
}

function accountHasDataQualityBlockers(customer: Customer): boolean {
  const issues = computeCustomerDataQualityIssues(customer);
  return issues.some((entry) => entry.severity === "blocker");
}

function accountMissingOwnerDamEmail(customer: Customer): boolean {
  const issues = computeCustomerDataQualityIssues(customer);
  return issues.some(
    (entry) =>
      entry.key === "owner-not-email" || entry.key === "missing-owner",
  );
}

function buildAccountContext(customers: Customer[]): AccountContextReport {
  let renewalRiskAccounts = 0;
  let accountsWithDataQualityWarnings = 0;
  let accountsWithDataQualityBlockers = 0;
  let missingOwnerDamEmailAccounts = 0;

  for (const customer of customers) {
    const tags = computeCustomerTags({ customer });
    if (tags.some((tag) => tag.key === "account-renewal-risk")) {
      renewalRiskAccounts += 1;
    }
    if (accountHasDataQualityWarnings(customer)) {
      accountsWithDataQualityWarnings += 1;
    }
    if (accountHasDataQualityBlockers(customer)) {
      accountsWithDataQualityBlockers += 1;
    }
    if (accountMissingOwnerDamEmail(customer)) {
      missingOwnerDamEmailAccounts += 1;
    }
  }

  return {
    lowUsageAccounts: customers.filter((c) => c.usage_threshold_percent < 30)
      .length,
    renewalRiskAccounts,
    accountsWithDataQualityWarnings,
    accountsWithDataQualityBlockers,
    missingOwnerDamEmailAccounts,
    planBreakdown: countByKey(customers, (c) => c.plan?.trim() || "Unknown"),
    stageBreakdown: countByKey(customers, (c) => c.stage?.trim() || "Unknown"),
  };
}

/**
 * Build a read-only reports snapshot from current session/demo data.
 * Does not mutate input arrays or persist anything.
 */
export function buildReportsSnapshot(input: ReportsSnapshotInput): ReportsSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    executiveOverview: buildExecutiveOverview(input),
    importQuality: buildImportQuality(input.lastValidation),
    contactJourney: buildContactJourney(input),
    actionQueue: buildActionQueueReport(input.actionQueue),
    communication: buildCommunicationReport(input.sendLogs),
    sequences: buildSequenceReport(input.emailSequences, input.enrollments),
    accountContext: buildAccountContext(input.customers),
    dataGaps: [...REPORT_DATA_GAPS],
  };
}

export { REPORT_DATA_GAPS };
