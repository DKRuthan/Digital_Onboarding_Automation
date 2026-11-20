import type {
  AutomationStatus,
  Customer,
  ImportedContact,
  InviteStatus,
  YesNo,
} from "@/lib/types";
import type { ValidationResult } from "@/lib/upload-validation";
import { normalizeContactEmail } from "@/lib/import-contact-email";
import type {
  CreateImportBatchInput,
  ImportBatchSummary,
  ImportHeaderMode,
  PersistedCustomerAccount,
  PersistedCustomerContact,
  PersistedImportBatch,
  PersistedImportIssue,
  SaveImportValidationResultInput,
} from "@/lib/import-persistence/import-persistence-types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const INVITE_STATUSES: InviteStatus[] = ["Pending", "Accepted", "Expired"];
const ISSUE_MESSAGE_MAX_LENGTH = 500;

function toIsoDate(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseInviteStatus(value: string | null | undefined): InviteStatus {
  const normalized = (value ?? "").trim();
  if (INVITE_STATUSES.includes(normalized as InviteStatus)) {
    return normalized as InviteStatus;
  }
  return "Pending";
}

function parseDateOnly(value: string | null | undefined): Date | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

function daysBetween(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY);
}

function computeDaysSinceStart(account: PersistedCustomerAccount, now: Date): number {
  const anchor =
    parseDateOnly(account.term_start_date) ??
    parseDateOnly(account.activation_start_date);
  if (!anchor) return 0;
  return Math.max(0, daysBetween(anchor, now));
}

function computeDaysToRenewal(account: PersistedCustomerAccount, now: Date): number {
  const renewal = parseDateOnly(account.renewal_date);
  if (!renewal) return 0;
  return Math.max(0, daysBetween(now, renewal));
}

function sumNullable(...values: Array<number | null | undefined>): number {
  return values.reduce<number>((acc, value) => acc + (value ?? 0), 0);
}

function seatAssignmentPercent(seatsTotal: number, seatsAssigned: number): number {
  if (seatsTotal <= 0) return 0;
  return Math.round((seatsAssigned / seatsTotal) * 100);
}

export function truncateIssueMessage(message: string): string {
  const trimmed = message.trim();
  if (trimmed.length <= ISSUE_MESSAGE_MAX_LENGTH) return trimmed;
  return `${trimmed.slice(0, ISSUE_MESSAGE_MAX_LENGTH - 1)}…`;
}

export function mapPersistedBatchToSummary(
  batch: PersistedImportBatch,
): ImportBatchSummary {
  return {
    id: batch.id,
    workspaceId: batch.workspace_id,
    status: batch.status,
    headerMode: batch.header_mode,
    sourceFilename: batch.source_filename,
    uploadedBy: batch.uploaded_by,
    validationPassed: batch.validation_passed,
    accountCount: batch.account_count,
    contactCount: batch.contact_count,
    blockerCount: batch.blocker_count,
    warningCount: batch.warning_count,
    infoCount: batch.info_count,
    isActive: batch.is_active,
    createdAt: toIsoDate(batch.created_at) ?? "",
    appliedAt: toIsoDate(batch.applied_at),
    supersededAt: toIsoDate(batch.superseded_at),
  };
}

export function mapPersistedAccountToCustomer(
  account: PersistedCustomerAccount,
  now: Date = new Date(),
): Customer {
  const seatsTotal = account.seats_purchased ?? 0;
  const seatsAssigned = sumNullable(
    account.search_seats_assigned,
    account.graph_browser_seats_assigned,
    account.graph_desktop_seats_assigned,
  );

  return {
    customer_id: account.account_id,
    customer_name: account.account_name,
    account_owner: account.account_name,
    admin_email: "",
    user_email: "",
    role: "Admin",
    plan: account.plan ?? "",
    engagement_model: "Tech Touch",
    stage: account.journey_stage ?? "",
    term_start_date: account.term_start_date ?? "",
    renewal_date: account.renewal_date ?? "",
    days_since_start: computeDaysSinceStart(account, now),
    days_to_renewal: computeDaysToRenewal(account, now),
    invite_sent_date: account.invite_sent_date ?? "",
    invite_accepted_date: account.invite_accepted_date ?? "",
    invite_status: parseInviteStatus(account.invite_status),
    seats_total: seatsTotal,
    seats_assigned: seatsAssigned,
    seat_assignment_percent: seatAssignmentPercent(seatsTotal, seatsAssigned),
    graph_desktop_assigned: account.graph_desktop_seats_assigned ?? 0,
    graph_browser_assigned: account.graph_browser_seats_assigned ?? 0,
    search_assigned: account.search_seats_assigned ?? 0,
    usage_sessions: account.total_sessions ?? 0,
    usage_activities: 0,
    active_users: account.total_active_seats ?? 0,
    last_usage_date: "",
    usage_threshold: 0,
    usage_threshold_percent: 0,
    use_case: account.use_case ?? "",
    icp: account.primary_icp ?? "",
    academy_visited: "No" as YesNo,
    webinar_attended: "No" as YesNo,
    last_email_sent: "",
    last_email_sent_date: "",
    emails_sent_count: 0,
    next_recommended_action: "",
    automation_status: "None" as AutomationStatus,
    owner: "",
    notes: account.notes ?? "",
  };
}

export function mapPersistedContactToImportedContact(
  contact: PersistedCustomerContact,
  accountName?: string,
): ImportedContact {
  return {
    contact_email: contact.contact_email,
    contact_role: contact.contact_role ?? "",
    contact_name: contact.contact_name ?? undefined,
    do_not_contact: contact.do_not_contact,
    customer_id: contact.account_id,
    customer_name: accountName,
    source: contact.source === "excel_import" ? "excel_import" : undefined,
  };
}

function normalizeRole(role: string): string {
  return role.trim().toLowerCase();
}

/** Derive owner/account_owner/admin/user emails from loaded contacts. */
export function enrichCustomersWithContacts(
  customers: Customer[],
  contacts: ImportedContact[],
): Customer[] {
  const contactsByAccount = new Map<string, ImportedContact[]>();
  for (const contact of contacts) {
    const existing = contactsByAccount.get(contact.customer_id) ?? [];
    existing.push(contact);
    contactsByAccount.set(contact.customer_id, existing);
  }

  return customers.map((customer) => {
    const accountContacts = contactsByAccount.get(customer.customer_id) ?? [];
    let adminEmail = customer.admin_email;
    let userEmail = customer.user_email;
    let owner = customer.owner;
    let accountOwner = customer.account_owner;

    for (const contact of accountContacts) {
      const role = normalizeRole(String(contact.contact_role ?? ""));
      if (role === "admin" && !adminEmail) {
        adminEmail = contact.contact_email;
        accountOwner =
          contact.contact_name?.trim() || customer.customer_name || accountOwner;
      } else if (role === "user" && !userEmail) {
        userEmail = contact.contact_email;
      } else if (role === "csm" && !owner) {
        owner = contact.contact_email;
      }
    }

    return {
      ...customer,
      admin_email: adminEmail,
      user_email: userEmail,
      owner,
      account_owner: accountOwner,
    };
  });
}

export function mapCustomerToAccountInsert(
  customer: Customer,
): Omit<
  PersistedCustomerAccount,
  | "id"
  | "workspace_id"
  | "import_batch_id"
  | "is_active"
  | "first_seen_at"
  | "last_seen_at"
  | "created_at"
  | "updated_at"
> {
  return {
    account_id: customer.customer_id,
    account_name: customer.customer_name,
    plan: customer.plan || null,
    journey_stage: customer.stage || null,
    use_case: customer.use_case || null,
    primary_icp: customer.icp || null,
    term_start_date: customer.term_start_date || null,
    activation_start_date: null,
    activation_window_end_date: null,
    renewal_date: customer.renewal_date || null,
    seats_purchased: customer.seats_total,
    search_seats_assigned: customer.search_assigned,
    graph_browser_seats_assigned: customer.graph_browser_assigned,
    graph_desktop_seats_assigned: customer.graph_desktop_assigned,
    search_active_users: null,
    graph_browser_active_users: null,
    graph_desktop_active_users: null,
    total_active_seats: customer.active_users,
    total_sessions: customer.usage_sessions,
    onboarding_completed: null,
    onboarding_date: null,
    onboarding_age_days: null,
    near_threshold: null,
    active_users_7d: null,
    total_sessions_7d: null,
    active_users_15d: null,
    total_sessions_15d: null,
    active_users_30d: null,
    total_sessions_30d: null,
    active_users_100d: null,
    total_sessions_100d: null,
    invite_status: customer.invite_status || null,
    invite_sent_date: customer.invite_sent_date || null,
    invite_accepted_date: customer.invite_accepted_date || null,
    notes: customer.notes || null,
  };
}

export function mapImportedContactToInsert(
  contact: ImportedContact,
): InsertCustomerContactShape {
  return {
    account_id: contact.customer_id,
    contact_email: normalizeContactEmail(contact.contact_email),
    contact_name: contact.contact_name ?? null,
    contact_role: String(contact.contact_role ?? ""),
    do_not_contact: contact.do_not_contact,
    source: "excel_import",
  };
}

type InsertCustomerContactShape = {
  account_id: string;
  contact_email: string;
  contact_name: string | null;
  contact_role: string;
  do_not_contact: boolean;
  source: "excel_import";
};

export function resolveHeaderMode(result: ValidationResult): ImportHeaderMode {
  const mode = result.importSummary?.headerMode;
  if (mode === "flat_row2" || mode === "row2" || mode === "legacy_single_row") {
    return mode;
  }
  return result.importSummary?.format === "option_c" ? "row2" : "legacy_single_row";
}

export function buildCreateBatchInputFromValidation(
  input: {
    workspaceId: string;
    validationResult: ValidationResult;
    sourceFilename?: string;
    uploadedBy?: string | null;
    status?: "applied" | "validated" | "failed";
    isActive?: boolean;
  },
): CreateImportBatchInput {
  const { validationResult } = input;
  const summary = validationResult.importSummary;
  return {
    workspaceId: input.workspaceId,
    status: input.status ?? (validationResult.passed ? "validated" : "failed"),
    headerMode: resolveHeaderMode(validationResult),
    sourceFilename: input.sourceFilename ?? null,
    uploadedBy: input.uploadedBy ?? null,
    validationPassed: validationResult.passed,
    accountCount: summary?.accountsCount ?? validationResult.customers.length,
    contactCount:
      summary?.contactsCount ?? validationResult.importedContacts?.length ?? 0,
    blockerCount: summary?.blockerCount ?? 0,
    warningCount: summary?.warningCount ?? 0,
    infoCount:
      validationResult.importIssues?.filter((issue) => issue.severity === "info")
        .length ?? 0,
    isActive: input.isActive ?? false,
    appliedAt: input.status === "applied",
  };
}

export function buildValidationResultInput(
  workspaceId: string,
  importBatchId: string,
  validationResult: ValidationResult,
): SaveImportValidationResultInput {
  const summary = validationResult.importSummary;
  const headerMode = resolveHeaderMode(validationResult);
  const formatLabel =
    headerMode === "flat_row2"
      ? "Flat Row 2 workbook"
      : headerMode === "row2"
        ? "Multi-sheet Row 2 workbook"
        : "Legacy single-row workbook";

  return {
    workspaceId,
    importBatchId,
    passed: validationResult.passed,
    headerMode,
    formatLabel,
    accountCount: summary?.accountsCount ?? validationResult.customers.length,
    contactCount:
      summary?.contactsCount ?? validationResult.importedContacts?.length ?? 0,
    signalCount: summary?.signalsCount ?? 0,
    blockerCount: summary?.blockerCount ?? 0,
    warningCount: summary?.warningCount ?? 0,
    infoCount:
      validationResult.importIssues?.filter((issue) => issue.severity === "info")
        .length ?? 0,
    duplicateContactEmailCount: summary?.duplicateContactEmailCount ?? 0,
    orphanContactCount: summary?.orphanContactCount ?? 0,
    orphanSignalCount: summary?.orphanSignalCount ?? 0,
  };
}

export function mapValidationIssuesToPersisted(
  validationResult: ValidationResult,
): PersistedImportIssue[] {
  const issues = validationResult.importIssues ?? [];
  return issues.map((issue) => ({
    severity: issue.severity,
    code: issue.code,
    message: truncateIssueMessage(issue.message),
    sheet_name: issue.sheet ?? null,
    row_number: issue.rowNumber ?? null,
    account_id: issue.customer_id ?? null,
    contact_email: issue.contact_email
      ? normalizeContactEmail(issue.contact_email)
      : null,
  }));
}
