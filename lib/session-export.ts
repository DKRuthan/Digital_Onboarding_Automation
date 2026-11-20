import {
  computeAccountTags,
  computeContactTags,
  computeCustomerTags,
  computeJourneyTags,
  type JourneyTagSequence,
} from "./customer-tags";
import { computeCustomerDataQualityIssues } from "./customer-data-quality";
import {
  getDuplicateContactEmails,
  type DerivedContact,
} from "./customer-contacts";
import type {
  ActionQueueItem,
  Customer,
  EditableAutomationRule,
  EmailTemplate,
  ImportedContact,
  SendLog,
} from "./types";
import type { EditableEmailSequence } from "./email-sequence-definitions";
import type { SequenceEnrollment } from "./email-sequence-types";
import {
  displayContactEmail,
  displayDeliveryTarget,
  stepLabel,
  triggerSequenceLabel,
} from "./action-queue-display";
import { formatQueueSourceLabel } from "./email-sequence-queue";
import {
  displayLogContactEmail,
  displayLogDeliveryTarget,
  displayLogRole,
  displayLogSource,
  isSequenceLog,
} from "./communication-log-display";

export type CustomerExportContext = {
  enrollments: SequenceEnrollment[];
  sequences: JourneyTagSequence[];
  sendLogs: SendLog[];
};

export type ContactDataExportContext = {
  enrollments: SequenceEnrollment[];
  sendLogs: SendLog[];
  /** Full customer set for cross-account duplicate detection */
  allCustomers: Customer[];
};

export function exportDateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

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

export function downloadTextFile(
  filename: string,
  content: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function findRule(
  rules: EditableAutomationRule[],
  ruleId: string,
): EditableAutomationRule | undefined {
  return rules.find((rule) => rule.id === ruleId);
}

/** Export-only contact email: stored field first, then email-like recipient fallback. */
function exportQueueContactEmail(item: ActionQueueItem): string {
  if (item.contact_email?.trim()) {
    return item.contact_email.trim();
  }
  return displayContactEmail(item) ?? "";
}

const ACTION_QUEUE_EXPORT_HEADERS = [
  "action_id",
  "contact_email",
  "contact_email_resolved",
  "contact_role",
  "customer_name",
  "customer_id",
  "source",
  "trigger_or_sequence",
  "step",
  "schedule_status",
  "scheduled_for",
  "timing_label",
  "conflict_status",
  "conflict_reason",
  "next_eligible_at",
  "workflow_status",
  "delivery_target",
  "recipient",
  "template",
  "channel",
  "priority",
  "recommended_action",
  "owner",
  "last_email_sent_date",
  "notes",
] as const;

function buildActionQueueExportRow(
  item: ActionQueueItem,
  customer: Customer | undefined,
  rule: EditableAutomationRule | undefined,
): string[] {
  const contactEmail = exportQueueContactEmail(item);
  const deliveryTarget = displayDeliveryTarget(item);

  return [
    item.id,
    contactEmail,
    contactEmail ? "Yes" : "No",
    item.recipient_type,
    item.customer_name,
    item.customer_id,
    formatQueueSourceLabel(item.source),
    triggerSequenceLabel(item),
    stepLabel(item),
    item.schedule_status,
    item.scheduled_for,
    item.timing_label,
    item.conflict_status ?? "",
    item.conflict_reason ?? "",
    item.next_eligible_at ?? "",
    item.workflow_status,
    deliveryTarget ?? "",
    item.recipient,
    item.template,
    item.channel ?? rule?.channel ?? "",
    rule?.priority ?? "",
    item.recommended_action,
    item.owner,
    customer?.last_email_sent_date ?? "",
    customer?.notes ?? "",
  ].map(String);
}

export function buildActionQueueExportCsv(
  items: ActionQueueItem[],
  customers: Customer[],
  rules: EditableAutomationRule[],
): string {
  const customerMap = new Map(customers.map((c) => [c.customer_id, c]));

  const rows = items.map((item) =>
    buildActionQueueExportRow(
      item,
      customerMap.get(item.customer_id),
      findRule(rules, item.rule_id),
    ),
  );

  return buildCsv([...ACTION_QUEUE_EXPORT_HEADERS], rows);
}

export function exportActionQueueCsv(
  items: ActionQueueItem[],
  customers: Customer[],
  rules: EditableAutomationRule[],
): void {
  const csv = buildActionQueueExportCsv(items, customers, rules);
  downloadTextFile(
    `action-queue-export-${exportDateStamp()}.csv`,
    csv,
    "text/csv;charset=utf-8",
  );
}

/** Export-only contact email: stored field first, then email-like recipient fallback. */
function exportLogContactEmail(log: SendLog): string {
  if (log.contact_email?.trim()) {
    return log.contact_email.trim();
  }
  return displayLogContactEmail(log) ?? "";
}

const SEND_LOGS_EXPORT_HEADERS = [
  "log_id",
  "date_time",
  "contact_email",
  "contact_email_resolved",
  "contact_role",
  "customer_name",
  "customer_id",
  "source",
  "template",
  "sequence_name",
  "sequence_step_number",
  "sequence_step_name",
  "issue",
  "action",
  "status",
  "send_mode",
  "delivery_target",
  "recipient",
  "enrollment_id",
  "conflict_status",
  "conflict_reason",
  "note",
  "error",
  "delivery_status",
  "provider",
  "template_id",
  "action_queue_item_id",
  "idempotency_key",
  "created_by_mode",
  "reason",
] as const;

function buildSendLogsExportRow(
  log: SendLog,
  customerIdByName: Map<string, string>,
): string[] {
  const contactEmail = exportLogContactEmail(log);
  const deliveryTarget = displayLogDeliveryTarget(log);
  const sequence = isSequenceLog(log);

  return [
    log.id,
    log.date,
    contactEmail,
    contactEmail ? "Yes" : "No",
    displayLogRole(log) ?? "",
    log.customer_name,
    log.customer_id ?? customerIdByName.get(log.customer_name) ?? "",
    displayLogSource(log),
    log.template,
    sequence ? (log.sequence_name ?? "") : "",
    sequence && log.sequence_step_number != null
      ? log.sequence_step_number
      : "",
    sequence ? (log.sequence_step_name ?? "") : "",
    log.issue ?? "",
    log.action ?? "",
    log.status,
    log.send_mode || "",
    deliveryTarget ?? "",
    log.recipient,
    log.enrollment_id ?? "",
    log.conflict_status ?? "",
    log.conflict_reason ?? "",
    log.note,
    log.error,
    log.delivery_status ?? "",
    log.provider ?? "",
    log.template_id ?? "",
    log.action_queue_item_id ?? "",
    log.idempotency_key ?? "",
    log.created_by_mode ?? "",
    log.reason ?? "",
  ].map(String);
}

export function buildSendLogsExportCsv(
  logs: SendLog[],
  customers: Customer[] = [],
): string {
  const customerIdByName = new Map(
    customers.map((customer) => [customer.customer_name, customer.customer_id]),
  );

  const rows = logs.map((log) =>
    buildSendLogsExportRow(log, customerIdByName),
  );

  return buildCsv([...SEND_LOGS_EXPORT_HEADERS], rows);
}

export function exportSendLogsCsv(
  logs: SendLog[],
  customers: Customer[] = [],
): void {
  const csv = buildSendLogsExportCsv(logs, customers);
  downloadTextFile(
    `communication-logs-export-${exportDateStamp()}.csv`,
    csv,
    "text/csv;charset=utf-8",
  );
}

export function buildAutomationRulesExportJson(
  rules: EditableAutomationRule[],
): string {
  return JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      rule_count: rules.length,
      rules,
    },
    null,
    2,
  );
}

export function exportAutomationRulesJson(
  rules: EditableAutomationRule[],
): void {
  const json = buildAutomationRulesExportJson(rules);
  downloadTextFile(
    `activity-triggers-export-${exportDateStamp()}.json`,
    json,
    "application/json;charset=utf-8",
  );
}

export function buildEmailTemplatesExportJson(
  templates: EmailTemplate[],
): string {
  return JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      template_count: templates.length,
      templates,
    },
    null,
    2,
  );
}

export function exportEmailTemplatesJson(templates: EmailTemplate[]): void {
  const json = buildEmailTemplatesExportJson(templates);
  downloadTextFile(
    `email-templates-export-${exportDateStamp()}.json`,
    json,
    "application/json;charset=utf-8",
  );
}

export function buildEmailSequencesExportJson(
  sequences: EditableEmailSequence[],
): string {
  return JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      sequence_count: sequences.length,
      sequences,
    },
    null,
    2,
  );
}

export function exportEmailSequencesJson(
  sequences: EditableEmailSequence[],
): void {
  const json = buildEmailSequencesExportJson(sequences);
  downloadTextFile(
    `email-sequences-export-${exportDateStamp()}.json`,
    json,
    "application/json;charset=utf-8",
  );
}

export function buildSequenceEnrollmentsExportJson(
  enrollments: SequenceEnrollment[],
): string {
  return JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      enrollment_count: enrollments.length,
      enrollments,
    },
    null,
    2,
  );
}

export function exportSequenceEnrollmentsJson(
  enrollments: SequenceEnrollment[],
): void {
  const json = buildSequenceEnrollmentsExportJson(enrollments);
  downloadTextFile(
    `sequence-enrollments-export-${exportDateStamp()}.json`,
    json,
    "application/json;charset=utf-8",
  );
}

const CUSTOMER_DATA_EXPORT_HEADERS = [
  "customer_id",
  "customer_name",
  "plan",
  "stage",
  "owner",
  "account_owner",
  "admin_email",
  "user_email",
  "invite_status",
  "days_since_start",
  "days_to_renewal",
  "usage_sessions",
  "usage_threshold_percent",
  "seat_assignment_percent",
  "academy_visited",
  "webinar_attended",
  "renewal_date",
  "last_email_sent_date",
  "emails_sent_count",
  "tags",
  "account_tags",
  "journey_tags",
  "data_quality_status",
  "data_quality_blockers_count",
  "data_quality_warnings_count",
  "data_quality_info_count",
  "data_quality_issues",
  "in_sequence",
  "cooling_active",
] as const;

function joinSemicolon(values: string[]): string {
  return values.filter(Boolean).join("; ");
}

function customerExportInSequence(
  customerId: string,
  enrollments: SequenceEnrollment[],
): boolean {
  return enrollments.some(
    (entry) =>
      entry.account_id === customerId &&
      (entry.enrollment_status === "active" ||
        entry.enrollment_status === "paused"),
  );
}

function customerExportCoolingActive(
  customer: Customer,
  context: CustomerExportContext,
): boolean {
  const contacts: Array<{ email: string; role: "Admin" | "User" }> = [];

  if (customer.admin_email?.trim()) {
    contacts.push({ email: customer.admin_email, role: "Admin" });
  }
  if (customer.user_email?.trim()) {
    contacts.push({ email: customer.user_email, role: "User" });
  }

  return contacts.some((contact) =>
    computeContactTags({
      customer,
      contactEmail: contact.email,
      contactRole: contact.role,
      enrollments: context.enrollments,
      sendLogs: context.sendLogs,
    }).some((tag) => tag.key === "contact-cooling-active"),
  );
}

function dataQualityStatus(
  issues: ReturnType<typeof computeCustomerDataQualityIssues>,
): string {
  if (issues.length === 0) return "Clean";
  if (issues.some((issue) => issue.severity === "blocker")) return "Has blockers";
  if (issues.some((issue) => issue.severity === "warning")) return "Has warnings";
  return "Has info";
}

function buildCustomerDataExportRow(
  customer: Customer,
  context: CustomerExportContext,
): string[] {
  const accountTags = computeAccountTags(customer);
  const journeyTags = computeJourneyTags({
    customer,
    enrollments: context.enrollments,
    sequences: context.sequences,
  });
  const tags = computeCustomerTags({
    customer,
    enrollments: context.enrollments,
    sequences: context.sequences,
    sendLogs: context.sendLogs,
  });
  const issues = computeCustomerDataQualityIssues(customer, {
    enrollments: context.enrollments,
  });

  const blockersCount = issues.filter((issue) => issue.severity === "blocker").length;
  const warningsCount = issues.filter((issue) => issue.severity === "warning").length;
  const infoCount = issues.filter((issue) => issue.severity === "info").length;

  return [
    customer.customer_id,
    customer.customer_name,
    customer.plan,
    customer.stage,
    customer.owner,
    customer.account_owner,
    customer.admin_email,
    customer.user_email,
    customer.invite_status,
    customer.days_since_start,
    customer.days_to_renewal,
    customer.usage_sessions,
    customer.usage_threshold_percent,
    customer.seat_assignment_percent,
    customer.academy_visited,
    customer.webinar_attended,
    customer.renewal_date,
    customer.last_email_sent_date,
    customer.emails_sent_count,
    joinSemicolon(tags.map((tag) => tag.label)),
    joinSemicolon(accountTags.map((tag) => tag.label)),
    joinSemicolon(journeyTags.map((tag) => tag.label)),
    dataQualityStatus(issues),
    blockersCount,
    warningsCount,
    infoCount,
    joinSemicolon(issues.map((issue) => issue.label)),
    customerExportInSequence(customer.customer_id, context.enrollments)
      ? "Yes"
      : "No",
    customerExportCoolingActive(customer, context) ? "Yes" : "No",
  ].map(String);
}

export function buildCustomerDataExportCsv(
  customers: Customer[],
  context: CustomerExportContext,
): string {
  const rows = customers.map((customer) =>
    buildCustomerDataExportRow(customer, context),
  );
  return buildCsv([...CUSTOMER_DATA_EXPORT_HEADERS], rows);
}

export function exportCustomerDataCsv(
  customers: Customer[],
  context: CustomerExportContext,
): void {
  const csv = buildCustomerDataExportCsv(customers, context);
  downloadTextFile(
    `customer-data-export-${exportDateStamp()}.csv`,
    csv,
    "text/csv;charset=utf-8",
  );
}

const SAME_ADMIN_USER_CONTACT_TAG = "Same email for Admin and User";

const CONTACT_DATA_EXPORT_HEADERS = [
  "contact_email",
  "contact_role",
  "is_internal",
  "customer_name",
  "customer_id",
  "account_owner",
  "owner",
  "plan",
  "stage",
  "tags",
  "sequence_status",
  "cooling_status",
  "data_quality_status",
  "quality_issue_keys",
  "contact_source",
  "is_valid_email",
] as const;

function contactExportInSequence(
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

function contactExportQualityIssueKeys(
  contact: DerivedContact,
  crossAccountDuplicateEmails: Set<string>,
): string[] {
  const keys: string[] = [];
  if (!contact.is_valid_email) keys.push("invalid-contact-email");
  if (contact.tags?.includes(SAME_ADMIN_USER_CONTACT_TAG)) {
    keys.push("same-admin-user-email");
  }
  if (crossAccountDuplicateEmails.has(contact.contact_email)) {
    keys.push("duplicate-contact-email");
  }
  return keys;
}

function contactExportDataQualityStatus(contact: DerivedContact): string {
  if (!contact.is_valid_email) return "Invalid email";
  if (contact.tags?.includes(SAME_ADMIN_USER_CONTACT_TAG)) {
    return SAME_ADMIN_USER_CONTACT_TAG;
  }
  return "Valid";
}

function buildContactDataExportRow(
  contact: DerivedContact,
  customer: Customer | undefined,
  context: ContactDataExportContext,
  crossAccountDuplicateEmails: Set<string>,
): string[] {
  const tags = customer
    ? computeContactTags({
        customer,
        contactEmail: contact.contact_email,
        contactRole: contact.contact_role,
        enrollments: context.enrollments,
        sendLogs: context.sendLogs,
      })
    : [];

  const coolingActive = tags.some((tag) => tag.key === "contact-cooling-active");
  const inSequence = contactExportInSequence(
    contact.contact_email,
    context.enrollments,
  );
  const qualityIssueKeys = contactExportQualityIssueKeys(
    contact,
    crossAccountDuplicateEmails,
  );

  return [
    contact.contact_email,
    contact.contact_role,
    contact.is_internal ? "Yes" : "No",
    contact.customer_name,
    contact.customer_id,
    contact.account_owner ?? "",
    contact.owner ?? "",
    contact.plan ?? "",
    contact.stage ?? "",
    joinSemicolon(tags.map((tag) => tag.label)),
    inSequence ? "In Sequence" : "Not in Sequence",
    coolingActive ? "Cooling Active" : "Clear",
    contactExportDataQualityStatus(contact),
    joinSemicolon(qualityIssueKeys),
    contact.contact_source,
    contact.is_valid_email ? "Yes" : "No",
  ].map(String);
}

export function buildContactDataExportCsv(
  contacts: DerivedContact[],
  context: ContactDataExportContext,
): string {
  const customerMap = new Map(
    context.allCustomers.map((customer) => [customer.customer_id, customer]),
  );
  const crossAccountDuplicateEmails = new Set(
    getDuplicateContactEmails(context.allCustomers).keys(),
  );

  const rows = contacts.map((contact) =>
    buildContactDataExportRow(
      contact,
      customerMap.get(contact.customer_id),
      context,
      crossAccountDuplicateEmails,
    ),
  );

  return buildCsv([...CONTACT_DATA_EXPORT_HEADERS], rows);
}

export function exportContactDataCsv(
  contacts: DerivedContact[],
  context: ContactDataExportContext,
): void {
  const csv = buildContactDataExportCsv(contacts, context);
  downloadTextFile(
    `contact-data-export-${exportDateStamp()}.csv`,
    csv,
    "text/csv;charset=utf-8",
  );
}

const IMPORTED_CONTACT_EXPORT_HEADERS = [
  "contact_email",
  "contact_role",
  "contact_name",
  "do_not_contact",
  "customer_id",
  "customer_name",
  "source",
] as const;

function buildImportedContactExportRow(contact: ImportedContact): string[] {
  return [
    contact.contact_email,
    contact.contact_role,
    contact.contact_name ?? "",
    contact.do_not_contact ? "Yes" : "No",
    contact.customer_id,
    contact.customer_name ?? "",
    contact.source ?? "",
  ];
}

export function buildImportedContactsExportCsv(
  contacts: ImportedContact[],
): string {
  const rows = contacts.map(buildImportedContactExportRow);
  return buildCsv([...IMPORTED_CONTACT_EXPORT_HEADERS], rows);
}

export function exportImportedContactsCsv(contacts: ImportedContact[]): void {
  const csv = buildImportedContactsExportCsv(contacts);
  downloadTextFile(
    `imported-contacts-export-${exportDateStamp()}.csv`,
    csv,
    "text/csv;charset=utf-8",
  );
}
