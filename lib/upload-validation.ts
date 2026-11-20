import * as XLSX from "xlsx";
import type {
  AutomationStatus,
  Customer,
  InviteStatus,
  YesNo,
} from "./types";
import type { ContactsImportQualitySummary } from "./import-contacts-quality-summary";
import type { ImportedContact } from "./types";

export type { ContactsImportQualitySummary };

export const REQUIRED_COLUMNS = [
  "customer_id",
  "customer_name",
  "account_owner",
  "admin_email",
  "user_email",
  "role",
  "plan",
  "engagement_model",
  "stage",
  "term_start_date",
  "renewal_date",
  "days_since_start",
  "days_to_renewal",
  "invite_sent_date",
  "invite_accepted_date",
  "invite_status",
  "seats_total",
  "seats_assigned",
  "seat_assignment_percent",
  "graph_desktop_assigned",
  "graph_browser_assigned",
  "search_assigned",
  "usage_sessions",
  "usage_activities",
  "active_users",
  "last_usage_date",
  "usage_threshold",
  "usage_threshold_percent",
  "use_case",
  "icp",
  "academy_visited",
  "webinar_attended",
  "last_email_sent",
  "last_email_sent_date",
  "emails_sent_count",
  "next_recommended_action",
  "automation_status",
  "owner",
  "notes",
] as const;

const NUMBER_FIELDS = [
  "days_since_start",
  "days_to_renewal",
  "seats_total",
  "seats_assigned",
  "seat_assignment_percent",
  "graph_desktop_assigned",
  "graph_browser_assigned",
  "search_assigned",
  "usage_sessions",
  "usage_activities",
  "active_users",
  "usage_threshold",
  "usage_threshold_percent",
  "emails_sent_count",
] as const;

const REQUIRED_DATE_FIELDS = [
  "term_start_date",
  "renewal_date",
  "invite_sent_date",
] as const;

const OPTIONAL_DATE_FIELDS = [
  "invite_accepted_date",
  "last_usage_date",
  "last_email_sent_date",
] as const;

const EMAIL_FIELDS = ["admin_email", "user_email"] as const;

const INVITE_STATUSES: InviteStatus[] = ["Pending", "Accepted", "Expired"];
const YES_NO: YesNo[] = ["Yes", "No"];
const AUTOMATION_STATUSES: AutomationStatus[] = [
  "Ready",
  "Pending Review",
  "Sent",
  "Skipped",
  "None",
];

export interface RowError {
  row: number;
  field: string;
  issue: string;
  value: string;
}

export interface ValidationResult {
  totalRows: number;
  validRows: number;
  errorRows: number;
  missingColumns: string[];
  duplicateCustomerIds: string[];
  invalidEmails: number;
  invalidDates: number;
  invalidNumbers: number;
  rowErrors: RowError[];
  passed: boolean;
  customers: Customer[];
  /** Option C rollup warnings — advisory only, do not block apply. */
  importWarnings?: Array<{
    code: string;
    message: string;
    customer_id?: string;
    contact_email?: string;
  }>;
  /** Option C import notes (e.g. Signals sheet not imported). */
  importNotes?: string[];
  /** Parsed Contacts sheet rows ready for session apply (option_c). */
  importedContacts?: ImportedContact[];
  /** Option C sheet/rollup counts for upload preview. */
  importSummary?: {
    format: "option_a" | "option_c";
    headerMode?: "row2" | "legacy_single_row" | "flat_row2";
    accountsCount?: number;
    contactsCount?: number;
    signalsCount?: number;
    customersCount?: number;
    signalsSheetFound?: boolean;
    blockerCount?: number;
    warningCount?: number;
    duplicateContactEmailCount?: number;
    orphanContactCount?: number;
    orphanSignalCount?: number;
    contactsQuality?: ContactsImportQualitySummary;
  };
  /** Option C cross-sheet validation issues (blockers, warnings, info). */
  importIssues?: ImportIssue[];
}

export type ImportIssue = {
  severity: "blocker" | "warning" | "info";
  code: string;
  message: string;
  sheet?: string;
  rowNumber?: number;
  customer_id?: string;
  contact_email?: string;
};

export type RawRow = Record<string, string>;

function normalizeHeader(key: string): string {
  return key.trim().toLowerCase().replace(/\s+/g, "_");
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).trim();
}

function normalizeRow(row: Record<string, unknown>): RawRow {
  const normalized: RawRow = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[normalizeHeader(key)] = cellToString(value);
  }
  return normalized;
}

export async function parseUploadFile(file: File): Promise<RawRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });

  return json
    .map(normalizeRow)
    .filter((row) =>
      Object.values(row).some((value) => value !== ""),
    );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value);
}

function isValidDate(value: string, allowEmpty: boolean): boolean {
  if (!value) return allowEmpty;
  const parsed = Date.parse(value);
  return !Number.isNaN(parsed);
}

function parseNumber(value: string): number | null {
  if (value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function addError(
  errors: RowError[],
  row: number,
  field: string,
  issue: string,
  value: string,
) {
  errors.push({ row, field, issue, value });
}

export function validateCustomerRows(rows: RawRow[]): ValidationResult {
  const rowErrors: RowError[] = [];
  const duplicateCustomerIds: string[] = [];
  const seenIds = new Map<string, number>();

  let invalidEmails = 0;
  let invalidDates = 0;
  let invalidNumbers = 0;

  const presentColumns = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) presentColumns.add(key);
  }

  const missingColumns = REQUIRED_COLUMNS.filter(
    (col) => !presentColumns.has(col),
  );

  if (missingColumns.length > 0) {
    return {
      totalRows: rows.length,
      validRows: 0,
      errorRows: rows.length,
      missingColumns,
      duplicateCustomerIds: [],
      invalidEmails: 0,
      invalidDates: 0,
      invalidNumbers: 0,
      rowErrors: [],
      passed: false,
      customers: [],
    };
  }

  const customers: Customer[] = [];
  const rowsWithErrors = new Set<number>();

  rows.forEach((row, index) => {
    const rowNum = index + 2;
    let rowHasError = false;

    const customerId = row.customer_id ?? "";
    if (!customerId) {
      addError(rowErrors, rowNum, "customer_id", "Required field is empty", "");
      rowHasError = true;
    } else if (seenIds.has(customerId)) {
      if (!duplicateCustomerIds.includes(customerId)) {
        duplicateCustomerIds.push(customerId);
      }
      addError(
        rowErrors,
        rowNum,
        "customer_id",
        "Duplicate customer ID",
        customerId,
      );
      rowHasError = true;
    } else {
      seenIds.set(customerId, rowNum);
    }

    for (const field of REQUIRED_COLUMNS) {
      if (field === "customer_id") continue;
      const value = row[field] ?? "";

      if (
        field !== "invite_accepted_date" &&
        field !== "last_usage_date" &&
        field !== "last_email_sent_date" &&
        field !== "notes" &&
        field !== "next_recommended_action" &&
        value === ""
      ) {
        addError(rowErrors, rowNum, field, "Required field is empty", value);
        rowHasError = true;
      }
    }

    for (const field of EMAIL_FIELDS) {
      const value = row[field] ?? "";
      if (value && !isValidEmail(value)) {
        addError(rowErrors, rowNum, field, "Invalid email format", value);
        invalidEmails++;
        rowHasError = true;
      }
    }

    for (const field of REQUIRED_DATE_FIELDS) {
      const value = row[field] ?? "";
      if (!isValidDate(value, false)) {
        addError(rowErrors, rowNum, field, "Invalid date", value);
        invalidDates++;
        rowHasError = true;
      }
    }

    for (const field of OPTIONAL_DATE_FIELDS) {
      const value = row[field] ?? "";
      if (!isValidDate(value, true)) {
        addError(rowErrors, rowNum, field, "Invalid date", value);
        invalidDates++;
        rowHasError = true;
      }
    }

    for (const field of NUMBER_FIELDS) {
      const value = row[field] ?? "";
      if (parseNumber(value) === null) {
        addError(rowErrors, rowNum, field, "Invalid number", value);
        invalidNumbers++;
        rowHasError = true;
      }
    }

    const inviteStatus = row.invite_status ?? "";
    if (inviteStatus && !INVITE_STATUSES.includes(inviteStatus as InviteStatus)) {
      addError(
        rowErrors,
        rowNum,
        "invite_status",
        `Must be one of: ${INVITE_STATUSES.join(", ")}`,
        inviteStatus,
      );
      rowHasError = true;
    }

    for (const field of ["academy_visited", "webinar_attended"] as const) {
      const value = row[field] ?? "";
      if (value && !YES_NO.includes(value as YesNo)) {
        addError(
          rowErrors,
          rowNum,
          field,
          `Must be Yes or No`,
          value,
        );
        rowHasError = true;
      }
    }

    const automationStatus = row.automation_status ?? "";
    if (
      automationStatus &&
      !AUTOMATION_STATUSES.includes(automationStatus as AutomationStatus)
    ) {
      addError(
        rowErrors,
        rowNum,
        "automation_status",
        `Must be one of: ${AUTOMATION_STATUSES.join(", ")}`,
        automationStatus,
      );
      rowHasError = true;
    }

    if (rowHasError) {
      rowsWithErrors.add(rowNum);
      return;
    }

    customers.push({
      customer_id: row.customer_id,
      customer_name: row.customer_name,
      account_owner: row.account_owner,
      admin_email: row.admin_email,
      user_email: row.user_email,
      role: row.role,
      plan: row.plan,
      engagement_model: row.engagement_model,
      stage: row.stage,
      term_start_date: row.term_start_date,
      renewal_date: row.renewal_date,
      days_since_start: parseNumber(row.days_since_start)!,
      days_to_renewal: parseNumber(row.days_to_renewal)!,
      invite_sent_date: row.invite_sent_date,
      invite_accepted_date: row.invite_accepted_date,
      invite_status: row.invite_status as InviteStatus,
      seats_total: parseNumber(row.seats_total)!,
      seats_assigned: parseNumber(row.seats_assigned)!,
      seat_assignment_percent: parseNumber(row.seat_assignment_percent)!,
      graph_desktop_assigned: parseNumber(row.graph_desktop_assigned)!,
      graph_browser_assigned: parseNumber(row.graph_browser_assigned)!,
      search_assigned: parseNumber(row.search_assigned)!,
      usage_sessions: parseNumber(row.usage_sessions)!,
      usage_activities: parseNumber(row.usage_activities)!,
      active_users: parseNumber(row.active_users)!,
      last_usage_date: row.last_usage_date,
      usage_threshold: parseNumber(row.usage_threshold)!,
      usage_threshold_percent: parseNumber(row.usage_threshold_percent)!,
      use_case: row.use_case,
      icp: row.icp,
      academy_visited: row.academy_visited as YesNo,
      webinar_attended: row.webinar_attended as YesNo,
      last_email_sent: row.last_email_sent,
      last_email_sent_date: row.last_email_sent_date,
      emails_sent_count: parseNumber(row.emails_sent_count)!,
      next_recommended_action: row.next_recommended_action,
      automation_status: row.automation_status as AutomationStatus,
      owner: row.owner,
      notes: row.notes,
    });
  });

  const passed =
    rowErrors.length === 0 &&
    missingColumns.length === 0 &&
    duplicateCustomerIds.length === 0 &&
    rows.length > 0;

  return {
    totalRows: rows.length,
    validRows: passed ? customers.length : 0,
    errorRows: rowsWithErrors.size,
    missingColumns,
    duplicateCustomerIds,
    invalidEmails,
    invalidDates,
    invalidNumbers,
    rowErrors,
    passed,
    customers: passed ? customers : [],
  };
}
