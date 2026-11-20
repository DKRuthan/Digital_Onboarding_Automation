import {
  isValidContactEmail,
  normalizeContactEmail,
} from "./import-contact-email";
import type {
  ImportedAccountRow,
  ImportedContactRow,
  ImportedSignalRow,
  NormalizedImport,
} from "./import-multisheet-parser";
import {
  missingRequiredColumns,
  requiredAccountsColumns,
  requiredContactsColumns,
  requiredSignalsColumns,
} from "./import-sheet-schema";
import {
  findDuplicateHeaderKeys,
  type ImportHeaderMode,
} from "./import-row2-schema";
import { isRow2LikeHeaderMode } from "./import-flat-row2-schema";
import { validateNormalizedFlatRow2Import } from "./import-flat-row2-validation";

export type MultisheetValidationSeverity = "blocker" | "warning" | "info";

export type MultisheetValidationIssue = {
  severity: MultisheetValidationSeverity;
  code: string;
  message: string;
  sheet?: "Accounts" | "Contacts" | "Signals" | "Journey Import";
  rowNumber?: number;
  customer_id?: string;
  contact_email?: string;
};

export type MultisheetCrossValidationResult = {
  passed: boolean;
  blockers: MultisheetValidationIssue[];
  warnings: MultisheetValidationIssue[];
  info: MultisheetValidationIssue[];
};

const INVITE_STATUSES = ["Pending", "Accepted", "Expired"] as const;
const YES_NO = ["Yes", "No"] as const;
const CONTACT_ROLES = ["Admin", "User", "CSM"] as const;

const ACCOUNT_NUMERIC_FIELDS = [
  "usage_sessions",
  "usage_activities",
  "active_users",
  "usage_threshold",
  "usage_threshold_percent",
  "seats_total",
  "seats_assigned",
  "seat_assignment_percent",
  "graph_desktop_assigned",
  "graph_browser_assigned",
  "search_assigned",
  "emails_sent_count",
] as const;

const ACCOUNT_DATE_FIELDS = [
  "term_start_date",
  "renewal_date",
  "invite_sent_date",
] as const;

function normalizeEnumValue(value: string): string {
  return value.trim();
}

function normalizeContactRole(role: string): string {
  const trimmed = role.trim();
  const lower = trimmed.toLowerCase();
  if (lower === "admin") return "Admin";
  if (lower === "user") return "User";
  if (lower === "csm") return "CSM";
  return trimmed;
}

function isSupportedContactRole(role: string): boolean {
  return CONTACT_ROLES.includes(role as (typeof CONTACT_ROLES)[number]);
}

function isValidDateString(value: string): boolean {
  if (!value.trim()) return false;
  return !Number.isNaN(Date.parse(value.trim()));
}

function parseNumberLike(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const num = Number(value.trim());
  return Number.isFinite(num) ? num : null;
}

function dataRowNumber(index: number, headerMode: ImportHeaderMode): number {
  return isRow2LikeHeaderMode(headerMode) ? index + 3 : index + 2;
}

function pushBlocker(
  blockers: MultisheetValidationIssue[],
  issue: Omit<MultisheetValidationIssue, "severity">,
): void {
  blockers.push({ severity: "blocker", ...issue });
}

function pushWarning(
  warnings: MultisheetValidationIssue[],
  issue: Omit<MultisheetValidationIssue, "severity">,
): void {
  warnings.push({ severity: "warning", ...issue });
}

function pushInfo(
  info: MultisheetValidationIssue[],
  issue: Omit<MultisheetValidationIssue, "severity">,
): void {
  info.push({ severity: "info", ...issue });
}

function validateRequiredSheetColumns(
  normalized: NormalizedImport,
  blockers: MultisheetValidationIssue[],
): void {
  const mode = normalized.headerMode;
  const checks: Array<{
    sheet: "Accounts" | "Contacts" | "Signals";
    headers: string[];
    required: readonly string[];
  }> = [
    {
      sheet: "Accounts",
      headers: normalized.sheetHeaders.accounts,
      required: requiredAccountsColumns(mode),
    },
    {
      sheet: "Contacts",
      headers: normalized.sheetHeaders.contacts,
      required: requiredContactsColumns(mode),
    },
    {
      sheet: "Signals",
      headers: normalized.sheetHeaders.signals,
      required: requiredSignalsColumns(mode),
    },
  ];

  for (const { sheet, headers, required } of checks) {
    if (isRow2LikeHeaderMode(mode) && headers.length === 0) {
      pushBlocker(blockers, {
        code: "SHEET_MISSING_ROW2_HEADER",
        message: `Missing Row 2 header row on ${sheet} sheet.`,
        sheet,
      });
      continue;
    }

    const duplicates = findDuplicateHeaderKeys(headers);
    for (const column of duplicates) {
      pushBlocker(blockers, {
        code: "SHEET_DUPLICATE_HEADER_KEY",
        message: `Duplicate Row 2 system key "${column}" on ${sheet} sheet.`,
        sheet,
      });
    }

    const missing = missingRequiredColumns(headers, required);
    for (const column of missing) {
      pushBlocker(blockers, {
        code: "SHEET_MISSING_REQUIRED_COLUMN",
        message:
          isRow2LikeHeaderMode(mode)
            ? `Missing required Row 2 system key "${column}" on ${sheet} sheet.`
            : `Missing required column "${column}" on ${sheet} sheet.`,
        sheet,
      });
    }
  }
}

function validateAccountsSheet(
  accounts: ImportedAccountRow[],
  headerMode: ImportHeaderMode,
  blockers: MultisheetValidationIssue[],
  warnings: MultisheetValidationIssue[],
): Set<string> {
  const accountIds = new Set<string>();
  const seenCustomerIds = new Map<string, number>();

  accounts.forEach((row, index) => {
    const rowNumber = dataRowNumber(index, headerMode);
    const customerId = row.customer_id?.trim() ?? "";

    if (!customerId) {
      pushBlocker(blockers, {
        code: "ACCOUNT_MISSING_CUSTOMER_ID",
        message: "customer_id is required on Accounts sheet.",
        sheet: "Accounts",
        rowNumber,
      });
    } else if (seenCustomerIds.has(customerId)) {
      pushBlocker(blockers, {
        code: "ACCOUNT_DUPLICATE_CUSTOMER_ID",
        message: `Duplicate customer_id "${customerId}" on Accounts sheet.`,
        sheet: "Accounts",
        rowNumber,
        customer_id: customerId,
      });
    } else {
      seenCustomerIds.set(customerId, rowNumber);
      accountIds.add(customerId);
    }

    if (!row.customer_name?.trim()) {
      pushBlocker(blockers, {
        code: "ACCOUNT_MISSING_CUSTOMER_NAME",
        message: "customer_name is required on Accounts sheet.",
        sheet: "Accounts",
        rowNumber,
        customer_id: customerId || undefined,
      });
    }

    for (const field of ACCOUNT_DATE_FIELDS) {
      const value = row[field];
      if (value !== undefined && value.trim() !== "" && !isValidDateString(value)) {
        pushBlocker(blockers, {
          code: "ACCOUNT_INVALID_DATE",
          message: `${field} must be a valid date when present.`,
          sheet: "Accounts",
          rowNumber,
          customer_id: customerId || undefined,
        });
      }
    }

    for (const field of ACCOUNT_NUMERIC_FIELDS) {
      const value = row[field];
      if (value !== undefined && value.trim() !== "" && parseNumberLike(value) === null) {
        pushBlocker(blockers, {
          code: "ACCOUNT_INVALID_NUMBER",
          message: `${field} must be a valid number when present.`,
          sheet: "Accounts",
          rowNumber,
          customer_id: customerId || undefined,
        });
      }
    }

    const inviteStatus = row.invite_status?.trim();
    if (
      inviteStatus &&
      !INVITE_STATUSES.includes(inviteStatus as (typeof INVITE_STATUSES)[number])
    ) {
      pushBlocker(blockers, {
        code: "ACCOUNT_INVALID_INVITE_STATUS",
        message: `invite_status must be one of: ${INVITE_STATUSES.join(", ")}.`,
        sheet: "Accounts",
        rowNumber,
        customer_id: customerId || undefined,
      });
    }

    for (const field of ["academy_visited", "webinar_attended"] as const) {
      const value = row[field]?.trim();
      if (value && !YES_NO.includes(value as (typeof YES_NO)[number])) {
        pushBlocker(blockers, {
          code: "ACCOUNT_INVALID_YES_NO",
          message: `${field} must be Yes or No when present.`,
          sheet: "Accounts",
          rowNumber,
          customer_id: customerId || undefined,
        });
      }
    }

    const ownerDamEmail = row.owner_dam_email?.trim() ?? "";
    if (!ownerDamEmail) {
      pushWarning(warnings, {
        code: "ACCOUNT_MISSING_OWNER_DAM_EMAIL",
        message: "owner_dam_email is missing.",
        sheet: "Accounts",
        rowNumber,
        customer_id: customerId || undefined,
      });
    } else if (!isValidContactEmail(ownerDamEmail)) {
      pushWarning(warnings, {
        code: "ACCOUNT_INVALID_OWNER_DAM_EMAIL",
        message: "owner_dam_email is not a valid email.",
        sheet: "Accounts",
        rowNumber,
        customer_id: customerId || undefined,
        contact_email: normalizeContactEmail(ownerDamEmail),
      });
    }

    if (!row.plan?.trim()) {
      pushWarning(warnings, {
        code: "ACCOUNT_MISSING_PLAN",
        message: "plan is missing.",
        sheet: "Accounts",
        rowNumber,
        customer_id: customerId || undefined,
      });
    }

    if (!row.stage?.trim()) {
      pushWarning(warnings, {
        code: "ACCOUNT_MISSING_STAGE",
        message: "stage is missing.",
        sheet: "Accounts",
        rowNumber,
        customer_id: customerId || undefined,
      });
    }

    const seatsTotal = parseNumberLike(row.seats_total);
    const seatsAssigned = parseNumberLike(row.seats_assigned);
    if (
      seatsTotal !== null &&
      seatsAssigned !== null &&
      seatsAssigned > seatsTotal
    ) {
      pushWarning(warnings, {
        code: "ACCOUNT_SEATS_ASSIGNED_EXCEEDS_TOTAL",
        message: "seats_assigned is greater than seats_total.",
        sheet: "Accounts",
        rowNumber,
        customer_id: customerId || undefined,
      });
    }

    const usageThresholdPercent = parseNumberLike(row.usage_threshold_percent);
    if (usageThresholdPercent !== null && usageThresholdPercent > 100) {
      pushWarning(warnings, {
        code: "ACCOUNT_USAGE_THRESHOLD_PERCENT_OVER_100",
        message: "usage_threshold_percent is greater than 100.",
        sheet: "Accounts",
        rowNumber,
        customer_id: customerId || undefined,
      });
    }

    const seatAssignmentPercent = parseNumberLike(row.seat_assignment_percent);
    if (seatAssignmentPercent !== null && seatAssignmentPercent > 100) {
      pushWarning(warnings, {
        code: "ACCOUNT_SEAT_ASSIGNMENT_PERCENT_OVER_100",
        message: "seat_assignment_percent is greater than 100.",
        sheet: "Accounts",
        rowNumber,
        customer_id: customerId || undefined,
      });
    }
  });

  return accountIds;
}

type ContactValidationMaps = {
  knownContactEmails: Set<string>;
  contactEmailToCustomerId: Map<string, string>;
};

function validateContactsSheet(
  contacts: ImportedContactRow[],
  accountIds: Set<string>,
  headerMode: ImportHeaderMode,
  blockers: MultisheetValidationIssue[],
  warnings: MultisheetValidationIssue[],
): ContactValidationMaps {
  const seenNormalizedEmails = new Map<string, number[]>();
  const contactsByAccount = new Map<string, number>();
  const adminByAccount = new Map<string, number>();
  const userByAccount = new Map<string, number>();
  const csmByAccount = new Map<string, number>();
  const knownContactEmails = new Set<string>();
  const contactEmailToCustomerId = new Map<string, string>();

  contacts.forEach((row, index) => {
    const rowNumber = dataRowNumber(index, headerMode);
    const contactEmail = normalizeContactEmail(row.contact_email);
    const rawRole = normalizeEnumValue(row.contact_role ?? "");
    const contactRole = rawRole ? normalizeContactRole(rawRole) : "";
    const customerId = row.customer_id?.trim() ?? "";

    if (!contactEmail) {
      pushBlocker(blockers, {
        code: "CONTACT_MISSING_EMAIL",
        message: "contact_email is required on Contacts sheet.",
        sheet: "Contacts",
        rowNumber,
      });
    } else if (!isValidContactEmail(contactEmail)) {
      pushBlocker(blockers, {
        code: "CONTACT_INVALID_EMAIL",
        message: "contact_email is not a valid email.",
        sheet: "Contacts",
        rowNumber,
        contact_email: contactEmail,
      });
    }

    if (!rawRole) {
      pushBlocker(blockers, {
        code: "CONTACT_MISSING_ROLE",
        message: "contact_role is required on Contacts sheet.",
        sheet: "Contacts",
        rowNumber,
        customer_id: customerId || undefined,
        contact_email: contactEmail || undefined,
      });
    } else if (!isSupportedContactRole(contactRole)) {
      pushWarning(warnings, {
        code: "CONTACT_UNSUPPORTED_ROLE",
        message: `Unsupported contact_role "${rawRole}" (expected Admin, User, or CSM).`,
        sheet: "Contacts",
        rowNumber,
        customer_id: customerId || undefined,
        contact_email: contactEmail || undefined,
      });
    }

    if (!customerId) {
      pushBlocker(blockers, {
        code: "CONTACT_MISSING_CUSTOMER_ID",
        message: "customer_id is required on Contacts sheet.",
        sheet: "Contacts",
        rowNumber,
        contact_email: contactEmail || undefined,
      });
    } else if (accountIds.size > 0 && !accountIds.has(customerId)) {
      pushBlocker(blockers, {
        code: "CONTACT_ORPHAN_CUSTOMER_ID",
        message: `customer_id "${customerId}" was not found on Accounts sheet.`,
        sheet: "Contacts",
        rowNumber,
        customer_id: customerId,
        contact_email: contactEmail || undefined,
      });
    }

    if (!row.contact_name?.trim()) {
      pushWarning(warnings, {
        code: "CONTACT_MISSING_NAME",
        message: "contact_name is missing.",
        sheet: "Contacts",
        rowNumber,
        customer_id: customerId || undefined,
        contact_email: contactEmail || undefined,
      });
    }

    if (contactEmail && isValidContactEmail(contactEmail)) {
      const rows = seenNormalizedEmails.get(contactEmail) ?? [];
      rows.push(rowNumber);
      seenNormalizedEmails.set(contactEmail, rows);
    }

    if (contactEmail && customerId && isValidContactEmail(contactEmail)) {
      knownContactEmails.add(contactEmail);
      contactEmailToCustomerId.set(contactEmail, customerId);
      contactsByAccount.set(
        customerId,
        (contactsByAccount.get(customerId) ?? 0) + 1,
      );

      if (contactRole === "Admin") {
        adminByAccount.set(
          customerId,
          (adminByAccount.get(customerId) ?? 0) + 1,
        );
      } else if (contactRole === "User") {
        userByAccount.set(
          customerId,
          (userByAccount.get(customerId) ?? 0) + 1,
        );
      } else if (contactRole === "CSM") {
        csmByAccount.set(customerId, (csmByAccount.get(customerId) ?? 0) + 1);
      }
    }

    const doNotContact = row.do_not_contact?.trim();
    if (doNotContact && !YES_NO.includes(doNotContact as (typeof YES_NO)[number])) {
      pushWarning(warnings, {
        code: "CONTACT_INVALID_DO_NOT_CONTACT",
        message: "do_not_contact must be Yes or No when present.",
        sheet: "Contacts",
        rowNumber,
        customer_id: customerId || undefined,
        contact_email: contactEmail || undefined,
      });
    } else if (doNotContact === "Yes") {
      pushWarning(warnings, {
        code: "CONTACT_DO_NOT_CONTACT_NOT_PERSISTED",
        message:
          "do_not_contact is Yes — value is preserved in imported contacts and shown on Contacts / Emails.",
        sheet: "Contacts",
        rowNumber,
        customer_id: customerId || undefined,
        contact_email: contactEmail || undefined,
      });
    }
  });

  for (const [email, rowNumbers] of seenNormalizedEmails) {
    if (rowNumbers.length > 1) {
      pushBlocker(blockers, {
        code: "CONTACT_DUPLICATE_EMAIL",
        message: `Duplicate contact_email "${email}" on Contacts sheet (rows: ${rowNumbers.join(", ")}).`,
        sheet: "Contacts",
        contact_email: email,
      });
    }
  }

  for (const customerId of accountIds) {
    if ((contactsByAccount.get(customerId) ?? 0) === 0) {
      pushWarning(warnings, {
        code: "CONTACT_ACCOUNT_NO_CONTACTS",
        message: "Account has no contacts on Contacts sheet.",
        sheet: "Contacts",
        customer_id: customerId,
      });
    } else if ((adminByAccount.get(customerId) ?? 0) === 0) {
      pushWarning(warnings, {
        code: "CONTACT_MISSING_ADMIN",
        message: "Account has no Admin contact.",
        sheet: "Contacts",
        customer_id: customerId,
      });
    }
  }

  for (const [customerId, count] of adminByAccount) {
    if (count > 1) {
      pushWarning(warnings, {
        code: "CONTACT_MULTIPLE_ADMIN",
        message:
          "Multiple Admin contacts under one customer_id; first wins in MVP rollup.",
        sheet: "Contacts",
        customer_id: customerId,
      });
    }
  }

  for (const [customerId, count] of userByAccount) {
    if (count > 1) {
      pushWarning(warnings, {
        code: "CONTACT_MULTIPLE_USER",
        message:
          "Multiple User contacts under one customer_id; first wins in MVP rollup.",
        sheet: "Contacts",
        customer_id: customerId,
      });
    }
  }

  for (const [customerId, count] of csmByAccount) {
    if (count > 1) {
      pushWarning(warnings, {
        code: "CONTACT_MULTIPLE_CSM",
        message:
          "Multiple CSM contacts under one customer_id; first valid email wins in MVP rollup.",
        sheet: "Contacts",
        customer_id: customerId,
      });
    }
  }

  return { knownContactEmails, contactEmailToCustomerId };
}

function validateSignalsSheet(
  signals: ImportedSignalRow[],
  accountIds: Set<string>,
  contactMaps: ContactValidationMaps,
  headerMode: ImportHeaderMode,
  blockers: MultisheetValidationIssue[],
  warnings: MultisheetValidationIssue[],
  info: MultisheetValidationIssue[],
): void {
  if (signals.length > 0) {
    pushInfo(info, {
      code: "SIGNALS_NOT_IMPORTED",
      message: "Signals are validated and previewed only — not imported yet.",
      sheet: "Signals",
    });
  }

  const { knownContactEmails, contactEmailToCustomerId } = contactMaps;

  signals.forEach((row, index) => {
    const rowNumber = dataRowNumber(index, headerMode);
    const customerId = row.customer_id?.trim() ?? "";
    const contactEmail = normalizeContactEmail(row.contact_email ?? "");

    if (customerId && accountIds.size > 0 && !accountIds.has(customerId)) {
      pushBlocker(blockers, {
        code: "SIGNAL_UNKNOWN_CUSTOMER_ID",
        message: `Signal customer_id "${customerId}" was not found on Accounts sheet.`,
        sheet: "Signals",
        rowNumber,
        customer_id: customerId,
        contact_email: contactEmail || undefined,
      });
    }

    if (contactEmail) {
      if (!knownContactEmails.has(contactEmail)) {
        pushBlocker(blockers, {
          code: "SIGNAL_UNKNOWN_CONTACT_EMAIL",
          message: `Signal contact_email "${contactEmail}" was not found on Contacts sheet.`,
          sheet: "Signals",
          rowNumber,
          customer_id: customerId || undefined,
          contact_email: contactEmail,
        });
      } else if (
        customerId &&
        contactEmailToCustomerId.get(contactEmail) !== customerId
      ) {
        pushBlocker(blockers, {
          code: "SIGNAL_CONTACT_CUSTOMER_MISMATCH",
          message: `Signal contact_email "${contactEmail}" does not belong to customer_id "${customerId}".`,
          sheet: "Signals",
          rowNumber,
          customer_id: customerId,
          contact_email: contactEmail,
        });
      }
    }

    const sentAt = row.sent_at?.trim();
    if (sentAt && !isValidDateString(sentAt)) {
      pushWarning(warnings, {
        code: "SIGNAL_INVALID_SENT_AT",
        message: "sent_at must be a valid date/time when present.",
        sheet: "Signals",
        rowNumber,
        customer_id: customerId || undefined,
        contact_email: contactEmail || undefined,
      });
    }
  });
}

/**
 * Cross-sheet validation for a parsed target multi-sheet import.
 */
export function validateNormalizedMultisheetImport(
  normalized: NormalizedImport,
): MultisheetCrossValidationResult {
  if (normalized.headerMode === "flat_row2") {
    return validateNormalizedFlatRow2Import(normalized);
  }

  const blockers: MultisheetValidationIssue[] = [];
  const warnings: MultisheetValidationIssue[] = [];
  const info: MultisheetValidationIssue[] = [];

  validateRequiredSheetColumns(normalized, blockers);

  const accountIds = validateAccountsSheet(
    normalized.accounts,
    normalized.headerMode,
    blockers,
    warnings,
  );

  const contactMaps = validateContactsSheet(
    normalized.contacts,
    accountIds,
    normalized.headerMode,
    blockers,
    warnings,
  );

  validateSignalsSheet(
    normalized.signals,
    accountIds,
    contactMaps,
    normalized.headerMode,
    blockers,
    warnings,
    info,
  );

  return {
    passed: blockers.length === 0,
    blockers,
    warnings,
    info,
  };
}
