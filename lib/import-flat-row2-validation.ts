import {
  isValidContactEmail,
  normalizeContactEmail,
} from "./import-contact-email";
import {
  FLAT_JOURNEY_IMPORT_SHEET_NAME,
  validateFlatRow2Headers,
} from "./import-flat-row2-schema";
import type { NormalizedImport } from "./import-multisheet-parser";
import {
  findDuplicateHeaderKeys,
} from "./import-row2-schema";
import type {
  MultisheetCrossValidationResult,
  MultisheetValidationIssue,
} from "./import-multisheet-cross-validation";

const FLAT_SHEET = "Journey Import" as const;
const CONTACT_ROLES = ["Admin", "User", "CSM"] as const;
const YES_NO = ["Yes", "No"] as const;

function flatDataRowNumber(index: number): number {
  return index + 3;
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

function validateFlatHeaders(
  normalized: NormalizedImport,
  blockers: MultisheetValidationIssue[],
): void {
  const headers = normalized.sheetHeaders.accounts;

  if (headers.length === 0) {
    pushBlocker(blockers, {
      code: "SHEET_MISSING_ROW2_HEADER",
      message: `Missing Row 2 header row on ${FLAT_JOURNEY_IMPORT_SHEET_NAME} sheet.`,
      sheet: FLAT_SHEET,
    });
    return;
  }

  for (const duplicate of findDuplicateHeaderKeys(headers)) {
    pushBlocker(blockers, {
      code: "SHEET_DUPLICATE_HEADER_KEY",
      message: `Duplicate Row 2 system key "${duplicate}" on ${FLAT_JOURNEY_IMPORT_SHEET_NAME} sheet.`,
      sheet: FLAT_SHEET,
    });
  }

  const headerValidation = validateFlatRow2Headers(headers);
  for (const error of headerValidation.errors) {
    pushBlocker(blockers, {
      code: error.includes("duplicate")
        ? "SHEET_DUPLICATE_HEADER_KEY"
        : "SHEET_MISSING_REQUIRED_COLUMN",
      message: error,
      sheet: FLAT_SHEET,
    });
  }
}

function validateFlatDataRows(
  rows: Record<string, string>[],
  blockers: MultisheetValidationIssue[],
  warnings: MultisheetValidationIssue[],
): Set<string> {
  const accountIds = new Set<string>();
  const seenNormalizedEmails = new Map<string, number[]>();
  const adminByAccount = new Map<string, number>();
  const csmByAccount = new Map<string, number>();

  rows.forEach((row, index) => {
    const rowNumber = flatDataRowNumber(index);
    const accountId = row.account_id?.trim() ?? "";
    const accountName = row.account_name?.trim() ?? "";
    const contactEmail = normalizeContactEmail(row.contact_email ?? "");
    const rawRole = row.contact_role?.trim() ?? "";
    const contactRole = rawRole ? normalizeContactRole(rawRole) : "";

    if (!accountId) {
      pushBlocker(blockers, {
        code: "ACCOUNT_MISSING_CUSTOMER_ID",
        message: "account_id is required on Journey Import sheet.",
        sheet: FLAT_SHEET,
        rowNumber,
      });
    } else {
      accountIds.add(accountId);
    }

    if (!accountName) {
      pushBlocker(blockers, {
        code: "ACCOUNT_MISSING_CUSTOMER_NAME",
        message: "account_name is required on Journey Import sheet.",
        sheet: FLAT_SHEET,
        rowNumber,
        customer_id: accountId || undefined,
      });
    }

    if (!contactEmail) {
      pushBlocker(blockers, {
        code: "CONTACT_MISSING_EMAIL",
        message: "contact_email is required on Journey Import sheet.",
        sheet: FLAT_SHEET,
        rowNumber,
        customer_id: accountId || undefined,
      });
    } else if (!isValidContactEmail(contactEmail)) {
      pushBlocker(blockers, {
        code: "CONTACT_INVALID_EMAIL",
        message: "contact_email is not a valid email.",
        sheet: FLAT_SHEET,
        rowNumber,
        contact_email: contactEmail,
        customer_id: accountId || undefined,
      });
    }

    if (!rawRole) {
      pushBlocker(blockers, {
        code: "CONTACT_MISSING_ROLE",
        message: "contact_role is required on Journey Import sheet.",
        sheet: FLAT_SHEET,
        rowNumber,
        customer_id: accountId || undefined,
        contact_email: contactEmail || undefined,
      });
    } else if (!isSupportedContactRole(contactRole)) {
      pushWarning(warnings, {
        code: "CONTACT_UNSUPPORTED_ROLE",
        message: `Unsupported contact_role "${rawRole}" (expected Admin, User, or CSM).`,
        sheet: FLAT_SHEET,
        rowNumber,
        customer_id: accountId || undefined,
        contact_email: contactEmail || undefined,
      });
    }

    if (contactEmail && isValidContactEmail(contactEmail)) {
      const emailRows = seenNormalizedEmails.get(contactEmail) ?? [];
      emailRows.push(rowNumber);
      seenNormalizedEmails.set(contactEmail, emailRows);

      if (accountId && contactRole === "Admin") {
        adminByAccount.set(accountId, (adminByAccount.get(accountId) ?? 0) + 1);
      }
      if (accountId && contactRole === "CSM") {
        csmByAccount.set(accountId, (csmByAccount.get(accountId) ?? 0) + 1);
      }
    }

    const doNotContact = row.do_not_contact?.trim();
    if (doNotContact && !YES_NO.includes(doNotContact as (typeof YES_NO)[number])) {
      pushWarning(warnings, {
        code: "CONTACT_INVALID_DO_NOT_CONTACT",
        message: "do_not_contact must be Yes or No when present.",
        sheet: FLAT_SHEET,
        rowNumber,
        customer_id: accountId || undefined,
        contact_email: contactEmail || undefined,
      });
    } else if (doNotContact === "Yes") {
      pushWarning(warnings, {
        code: "CONTACT_DO_NOT_CONTACT_NOT_PERSISTED",
        message:
          "do_not_contact is Yes — value is preserved in imported contacts and shown on Contacts / Emails.",
        sheet: FLAT_SHEET,
        rowNumber,
        customer_id: accountId || undefined,
        contact_email: contactEmail || undefined,
      });
    }
  });

  for (const [email, rowNumbers] of seenNormalizedEmails) {
    if (rowNumbers.length > 1) {
      pushBlocker(blockers, {
        code: "CONTACT_DUPLICATE_EMAIL",
        message: `Duplicate contact_email "${email}" on Journey Import sheet (rows: ${rowNumbers.join(", ")}).`,
        sheet: FLAT_SHEET,
        contact_email: email,
      });
    }
  }

  for (const accountId of accountIds) {
    if ((adminByAccount.get(accountId) ?? 0) === 0) {
      pushWarning(warnings, {
        code: "ACCOUNT_MISSING_ADMIN_CONTACT",
        message:
          "No Admin contact with valid contact_email for this account. Admin is the primary customer-facing recipient in many journeys.",
        sheet: FLAT_SHEET,
        customer_id: accountId,
      });
    }

    if ((csmByAccount.get(accountId) ?? 0) === 0) {
      pushWarning(warnings, {
        code: "ACCOUNT_MISSING_CSM_CONTACT",
        message:
          "No CSM contact with valid contact_email for this account. Add a row with contact_role = CSM if internal routing is needed.",
        sheet: FLAT_SHEET,
        customer_id: accountId,
      });
    }
  }

  return accountIds;
}

function validateFlatAccountConsistency(
  rows: Record<string, string>[],
  blockers: MultisheetValidationIssue[],
  warnings: MultisheetValidationIssue[],
): void {
  type FieldTracker = {
    value: string;
    rowNumber: number;
  };

  const byAccount = new Map<
    string,
    {
      account_name?: FieldTracker;
      plan?: FieldTracker;
      journey_stage?: FieldTracker;
      term_start_date?: FieldTracker;
      renewal_date?: FieldTracker;
    }
  >();

  rows.forEach((row, index) => {
    const accountId = row.account_id?.trim() ?? "";
    if (!accountId) return;

    const rowNumber = flatDataRowNumber(index);
    let state = byAccount.get(accountId);
    if (!state) {
      state = {};
      byAccount.set(accountId, state);
    }

    const checkField = (
      field: "account_name" | "plan" | "journey_stage" | "term_start_date" | "renewal_date",
      severity: "blocker" | "warning",
      code: string,
    ) => {
      const value = row[field]?.trim() ?? "";
      if (!value) return;

      const tracker = state![field as keyof typeof state];
      if (!tracker) {
        state![field as keyof typeof state] = { value, rowNumber };
        return;
      }

      if (tracker.value === value) return;

      const issue = {
        code,
        message: `Conflicting ${field} for account_id "${accountId}": "${tracker.value}" (row ${tracker.rowNumber}) vs "${value}" (row ${rowNumber}).`,
        sheet: FLAT_SHEET,
        rowNumber,
        customer_id: accountId,
      };

      if (severity === "blocker") {
        pushBlocker(blockers, issue);
      } else {
        pushWarning(warnings, issue);
      }
    };

    checkField("account_name", "blocker", "FLAT_ACCOUNT_NAME_CONFLICT");
    checkField("plan", "warning", "FLAT_ACCOUNT_PLAN_CONFLICT");
    checkField("journey_stage", "warning", "FLAT_ACCOUNT_STAGE_CONFLICT");
    checkField("term_start_date", "warning", "FLAT_ACCOUNT_TERM_START_CONFLICT");
    checkField("renewal_date", "warning", "FLAT_ACCOUNT_RENEWAL_CONFLICT");
  });
}

/**
 * Cross-validation for flat Journey Import workbooks (headerMode flat_row2).
 */
export function validateNormalizedFlatRow2Import(
  normalized: NormalizedImport,
): MultisheetCrossValidationResult {
  const blockers: MultisheetValidationIssue[] = [];
  const warnings: MultisheetValidationIssue[] = [];
  const info: MultisheetValidationIssue[] = [];

  validateFlatHeaders(normalized, blockers);

  const rows = normalized.flatDataRows ?? [];
  validateFlatDataRows(rows, blockers, warnings);
  validateFlatAccountConsistency(rows, blockers, warnings);

  pushInfo(info, {
    code: "COMMUNICATION_HISTORY_NOT_IMPORTED",
    message:
      "Flat import does not include prior send history (last_email_sent_date, emails_sent_count). Cooling and duplicate protection use Communication Logs when available.",
    sheet: FLAT_SHEET,
  });

  return {
    passed: blockers.length === 0,
    blockers,
    warnings,
    info,
  };
}
