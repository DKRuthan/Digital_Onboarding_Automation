import { downloadTextFile, exportDateStamp } from "./session-export";
import type { ReportsSnapshot } from "./reports-snapshot";

const REPORTS_CSV_HEADERS = ["section", "metric", "value", "detail"] as const;

type ReportsCsvRow = [string, string, string | number, string];

function escapeCsvCell(value: string | number | undefined | null): string {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildCsv(headers: string[], rows: string[][]): string {
  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(",")),
  ];
  return lines.join("\n");
}

function pushRow(
  rows: ReportsCsvRow[],
  section: string,
  metric: string,
  value: string | number | boolean | null | undefined,
  detail = "",
): void {
  if (value === null || value === undefined) {
    rows.push([section, metric, "", detail]);
    return;
  }
  if (typeof value === "boolean") {
    rows.push([section, metric, value ? "true" : "false", detail]);
    return;
  }
  rows.push([section, metric, value, detail]);
}

function pushRecordBreakdown(
  rows: ReportsCsvRow[],
  section: string,
  metricPrefix: string,
  counts: Record<string, number>,
): void {
  for (const [key, count] of Object.entries(counts).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const normalizedKey = key.trim().replace(/\s+/g, "_").toLowerCase();
    pushRow(rows, section, `${metricPrefix}_${normalizedKey}`, count);
  }
}

export function buildReportsSnapshotCsv(snapshot: ReportsSnapshot): string {
  const rows: ReportsCsvRow[] = [];

  pushRow(rows, "Snapshot", "generated_at", snapshot.generatedAt);

  const exec = snapshot.executiveOverview;
  pushRow(rows, "Executive Overview", "total_accounts", exec.totalAccounts);
  pushRow(rows, "Executive Overview", "total_contacts", exec.totalContacts);
  pushRow(rows, "Executive Overview", "contacts_in_sequence", exec.contactsInSequence);
  pushRow(
    rows,
    "Executive Overview",
    "contacts_cooling_active",
    exec.contactsCoolingActive,
  );
  pushRow(rows, "Executive Overview", "actions_due_now", exec.actionsDueNow);
  pushRow(
    rows,
    "Executive Overview",
    "total_communication_logs",
    exec.totalCommunicationLogs,
  );
  pushRow(
    rows,
    "Executive Overview",
    "account_data_quality_warnings",
    exec.accountDataQualityWarnings,
  );
  pushRow(
    rows,
    "Executive Overview",
    "account_data_quality_blockers",
    exec.accountDataQualityBlockers,
  );

  const importQuality = snapshot.importQuality;
  pushRow(rows, "Import Quality", "available", importQuality.available);
  pushRow(rows, "Import Quality", "last_import_format", importQuality.lastImportFormat);
  pushRow(rows, "Import Quality", "accounts_imported", importQuality.accountsImported);
  pushRow(rows, "Import Quality", "contacts_imported", importQuality.contactsImported);
  pushRow(rows, "Import Quality", "signals_detected", importQuality.signalsDetected);
  pushRow(
    rows,
    "Import Quality",
    "customers_after_rollup",
    importQuality.customersAfterRollup,
  );
  pushRow(rows, "Import Quality", "import_blockers", importQuality.importBlockers);
  pushRow(rows, "Import Quality", "import_warnings", importQuality.importWarnings);
  pushRow(rows, "Import Quality", "import_info", importQuality.importInfo);
  pushRow(rows, "Import Quality", "rollup_warnings", importQuality.rollupWarnings);
  pushRow(rows, "Import Quality", "signals_not_imported", importQuality.signalsNotImported);
  pushRow(rows, "Import Quality", "signals_note", importQuality.signalsNote);

  const contactsQuality = importQuality.contactsQuality;
  if (contactsQuality) {
    pushRow(rows, "Import Quality", "contacts_quality_total", contactsQuality.totalContacts);
    pushRow(rows, "Import Quality", "contacts_quality_admin", contactsQuality.adminContacts);
    pushRow(rows, "Import Quality", "contacts_quality_user", contactsQuality.userContacts);
    pushRow(rows, "Import Quality", "contacts_quality_csm", contactsQuality.csmContacts);
    pushRow(
      rows,
      "Import Quality",
      "contacts_quality_do_not_contact",
      contactsQuality.doNotContactContacts,
    );
    pushRow(
      rows,
      "Import Quality",
      "contacts_quality_accounts_missing_admin",
      contactsQuality.accountsMissingAdmin,
    );
    pushRow(
      rows,
      "Import Quality",
      "contacts_quality_duplicate_rows",
      contactsQuality.duplicateContactRows,
    );
    pushRow(
      rows,
      "Import Quality",
      "contacts_quality_orphan_contacts",
      contactsQuality.orphanContacts,
    );
    pushRow(
      rows,
      "Import Quality",
      "contacts_quality_emails_across_accounts",
      contactsQuality.emailsAcrossAccounts,
    );
    pushRow(
      rows,
      "Import Quality",
      "contacts_quality_extra_admin_not_persisted",
      contactsQuality.extraAdminNotPersisted,
    );
    pushRow(
      rows,
      "Import Quality",
      "contacts_quality_extra_user_not_persisted",
      contactsQuality.extraUserNotPersisted,
    );
    pushRow(
      rows,
      "Import Quality",
      "contacts_quality_extra_csm_not_persisted",
      contactsQuality.extraCsmNotPersisted,
    );
  }

  const journey = snapshot.contactJourney;
  pushRow(rows, "Contact Journey", "total_contacts", journey.totalContacts);
  pushRow(rows, "Contact Journey", "admin_contacts", journey.contactsByRole.admin);
  pushRow(rows, "Contact Journey", "user_contacts", journey.contactsByRole.user);
  pushRow(rows, "Contact Journey", "csm_contacts", journey.contactsByRole.csm);
  pushRow(rows, "Contact Journey", "contacts_in_sequence", journey.contactsInSequence);
  pushRow(
    rows,
    "Contact Journey",
    "contacts_not_in_sequence",
    journey.contactsNotInSequence,
  );
  pushRow(rows, "Contact Journey", "cooling_active", journey.contactsCoolingActive);
  pushRow(rows, "Contact Journey", "cooling_clear", journey.contactsCoolingClear);
  pushRow(
    rows,
    "Contact Journey",
    "unresolved_contact_email_actions",
    journey.unresolvedContactEmailActions,
  );
  if (journey.doNotContactWarnings != null) {
    pushRow(
      rows,
      "Contact Journey",
      "do_not_contact_warnings",
      journey.doNotContactWarnings,
    );
  }

  const queue = snapshot.actionQueue;
  pushRow(rows, "Action Queue", "total_queue_items", queue.totalQueueItems);
  pushRow(rows, "Action Queue", "needs_review", queue.needsReview);
  pushRow(rows, "Action Queue", "previewed", queue.previewed);
  pushRow(rows, "Action Queue", "test_sent", queue.testSent);
  pushRow(rows, "Action Queue", "approved", queue.approved);
  pushRow(rows, "Action Queue", "skipped", queue.skipped);
  pushRow(rows, "Action Queue", "blocked", queue.blocked);
  pushRow(rows, "Action Queue", "due_now", queue.dueNow);
  pushRow(rows, "Action Queue", "conflict_blocked", queue.conflictBlocked);
  pushRow(
    rows,
    "Action Queue",
    "unresolved_contact_emails",
    queue.unresolvedContactEmails,
  );
  pushRecordBreakdown(rows, "Action Queue", "workflow_status", queue.byWorkflowStatus);
  pushRow(rows, "Action Queue", "by_source_trigger", queue.bySource.trigger);
  pushRow(rows, "Action Queue", "by_source_sequence", queue.bySource.sequence);
  pushRow(rows, "Action Queue", "by_source_unknown", queue.bySource.unknown);

  const communication = snapshot.communication;
  pushRow(rows, "Communication", "total_logs", communication.totalLogs);
  pushRow(
    rows,
    "Communication",
    "simulated_sent_count",
    communication.simulatedSentCount,
  );
  pushRow(
    rows,
    "Communication",
    "actual_sent_count",
    communication.actualSentCount,
  );
  pushRow(rows, "Communication", "not_sent_count", communication.notSentCount);
  pushRow(rows, "Communication", "failed_count", communication.failedCount);
  pushRow(
    rows,
    "Communication",
    "contact_resolved_logs",
    communication.contactResolvedLogs,
  );
  pushRow(
    rows,
    "Communication",
    "unresolved_contact_logs",
    communication.unresolvedContactLogs,
  );
  pushRecordBreakdown(rows, "Communication", "by_source", communication.bySource);
  pushRecordBreakdown(rows, "Communication", "by_status", communication.byStatus);
  pushRecordBreakdown(rows, "Communication", "by_send_mode", communication.bySendMode);
  pushRecordBreakdown(rows, "Communication", "by_template", communication.byTemplate);

  const sequences = snapshot.sequences;
  pushRow(rows, "Sequences", "total_sequences", sequences.totalSequences);
  pushRow(rows, "Sequences", "approved_sequences", sequences.approvedSequences);
  pushRow(rows, "Sequences", "active_sequences", sequences.activeSequences);
  pushRow(rows, "Sequences", "archived_sequences", sequences.archivedSequences);
  pushRow(rows, "Sequences", "draft_sequences", sequences.draftSequences);
  pushRow(rows, "Sequences", "total_enrollments", sequences.totalEnrollments);
  pushRow(rows, "Sequences", "enrolled_contacts", sequences.enrolledContacts);
  pushRow(rows, "Sequences", "paused_enrollments", sequences.pausedEnrollments);
  pushRow(rows, "Sequences", "completed_enrollments", sequences.completedEnrollments);
  pushRow(rows, "Sequences", "completed_steps", sequences.completedSteps);
  pushRecordBreakdown(
    rows,
    "Sequences",
    "enrollment_status",
    sequences.enrollmentsByStatus,
  );

  const account = snapshot.accountContext;
  pushRow(rows, "Account Context", "low_usage_accounts", account.lowUsageAccounts);
  pushRow(rows, "Account Context", "renewal_risk_accounts", account.renewalRiskAccounts);
  pushRow(
    rows,
    "Account Context",
    "accounts_with_data_quality_warnings",
    account.accountsWithDataQualityWarnings,
  );
  pushRow(
    rows,
    "Account Context",
    "accounts_with_data_quality_blockers",
    account.accountsWithDataQualityBlockers,
  );
  pushRow(
    rows,
    "Account Context",
    "missing_owner_dam_email_accounts",
    account.missingOwnerDamEmailAccounts,
  );
  pushRecordBreakdown(rows, "Account Context", "plan", account.planBreakdown);
  pushRecordBreakdown(rows, "Account Context", "stage", account.stageBreakdown);

  pushRow(rows, "Data Gaps", "gap_count", snapshot.dataGaps.length);
  for (const gap of snapshot.dataGaps) {
    pushRow(rows, "Data Gaps", "gap", gap);
  }

  return buildCsv(
    [...REPORTS_CSV_HEADERS],
    rows.map(([section, metric, value, detail]) => [
      section,
      metric,
      String(value),
      detail,
    ]),
  );
}

export function exportReportsSnapshotCsv(snapshot: ReportsSnapshot): void {
  const csv = buildReportsSnapshotCsv(snapshot);
  downloadTextFile(
    `reports-export-${exportDateStamp()}.csv`,
    csv,
    "text/csv;charset=utf-8",
  );
}
