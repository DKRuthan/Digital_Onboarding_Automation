import * as XLSX from "xlsx";

import { buildImportedContactsFromNormalized } from "./imported-contacts";
import { buildContactsImportQualitySummary } from "./import-contacts-quality-summary";
import { validateNormalizedMultisheetImport } from "./import-multisheet-cross-validation";
import type { MultisheetValidationIssue } from "./import-multisheet-cross-validation";
import { rollupNormalizedImportToCustomers } from "./import-customer-rollup";
import {
  MultisheetParserError,
} from "./import-multisheet-parser";
import { parseImportWorkbook } from "./import-workbook-router";
import type { ImportIssue, RowError, ValidationResult } from "./upload-validation";

function emptyFailedResult(message: string): ValidationResult {
  return {
    totalRows: 0,
    validRows: 0,
    errorRows: 1,
    missingColumns: [],
    duplicateCustomerIds: [],
    invalidEmails: 0,
    invalidDates: 0,
    invalidNumbers: 0,
    rowErrors: [
      {
        row: 0,
        field: "workbook",
        issue: message,
        value: "",
      },
    ],
    passed: false,
    customers: [],
  };
}

function hasSignalsSheet(sheetNames: string[]): boolean {
  return sheetNames.some(
    (name) => name.trim().toLowerCase() === "signals",
  );
}

function buildImportSummary(
  normalized: {
    headerMode?: import("./import-row2-schema").ImportHeaderMode;
    accounts: unknown[];
    contacts: import("./import-multisheet-parser").ImportedContactRow[];
    signals: unknown[];
    sheetNames: string[];
  },
  customersCount: number,
  importIssues: ImportIssue[],
) {
  const blockers = importIssues.filter((issue) => issue.severity === "blocker");
  const warnings = importIssues.filter((issue) => issue.severity === "warning");

  return {
    format: "option_c" as const,
    headerMode: normalized.headerMode,
    accountsCount: normalized.accounts.length,
    contactsCount: normalized.contacts.length,
    signalsCount: normalized.signals.length,
    customersCount,
    signalsSheetFound: hasSignalsSheet(normalized.sheetNames),
    blockerCount: blockers.length,
    warningCount: warnings.length,
    duplicateContactEmailCount: blockers.filter(
      (issue) => issue.code === "CONTACT_DUPLICATE_EMAIL",
    ).length,
    orphanContactCount: blockers.filter(
      (issue) => issue.code === "CONTACT_ORPHAN_CUSTOMER_ID",
    ).length,
    orphanSignalCount:
      blockers.filter((issue) => issue.code === "SIGNAL_UNKNOWN_CONTACT_EMAIL")
        .length +
      blockers.filter((issue) => issue.code === "SIGNAL_UNKNOWN_CUSTOMER_ID")
        .length +
      blockers.filter((issue) => issue.code === "SIGNAL_CONTACT_CUSTOMER_MISMATCH")
        .length,
    contactsQuality: buildContactsImportQualitySummary(
      normalized.contacts,
      importIssues,
    ),
  };
}

function toImportIssue(issue: MultisheetValidationIssue): ImportIssue {
  return {
    severity: issue.severity,
    code: issue.code,
    message: issue.message,
    sheet: issue.sheet,
    rowNumber: issue.rowNumber,
    customer_id: issue.customer_id,
    contact_email: issue.contact_email,
  };
}

function blockerToRowError(issue: MultisheetValidationIssue): RowError {
  const location = [
    issue.sheet,
    issue.rowNumber ? `row ${issue.rowNumber}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    row: issue.rowNumber ?? 0,
    field: issue.sheet ?? "cross-sheet",
    issue: `[${issue.code}] ${issue.message}${location ? ` (${location})` : ""}`,
    value: issue.customer_id ?? issue.contact_email ?? "",
  };
}

function buildImportNotes(
  normalized: {
    headerMode?: import("./import-row2-schema").ImportHeaderMode;
    signals: unknown[];
    sheetNames: string[];
  },
): string[] {
  const notes: string[] = [];

  if (normalized.headerMode === "flat_row2") {
    notes.push(
      "Flat import does not include prior send history. Cooling and duplicate protection use Communication Logs when available.",
    );
    return notes;
  }

  if (hasSignalsSheet(normalized.sheetNames) && normalized.signals.length > 0) {
    notes.push("Signals sheet detected but not imported yet.");
  }

  return notes;
}

/**
 * Parse, cross-validate, and roll up a target multi-sheet workbook into ValidationResult.
 * Cross-sheet blockers prevent apply; rollup and cross-sheet warnings are advisory.
 */
export function validateTargetMultisheetWorkbook(
  workbook: XLSX.WorkBook,
  options?: { now?: Date },
): ValidationResult {
  let normalized;

  try {
    normalized = parseImportWorkbook(workbook);
  } catch (error) {
    const message =
      error instanceof MultisheetParserError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Failed to parse import workbook.";
    return emptyFailedResult(message);
  }

  const crossValidation = validateNormalizedMultisheetImport(normalized);
  const { customers, warnings: rollupWarnings } = rollupNormalizedImportToCustomers(
    normalized,
    options,
  );

  const importIssues: ImportIssue[] = [
    ...crossValidation.blockers,
    ...crossValidation.warnings,
    ...crossValidation.info,
  ].map(toImportIssue);

  const importNotes = buildImportNotes(normalized);
  const hasBlockers = crossValidation.blockers.length > 0;

  if (hasBlockers) {
    return {
      totalRows: normalized.accounts.length,
      validRows: 0,
      errorRows: crossValidation.blockers.length,
      missingColumns: [],
      duplicateCustomerIds: [],
      invalidEmails: 0,
      invalidDates: 0,
      invalidNumbers: 0,
      rowErrors: crossValidation.blockers.map(blockerToRowError),
      passed: false,
      customers: [],
      importWarnings: rollupWarnings,
      importNotes,
      importIssues,
      importSummary: buildImportSummary(normalized, 0, importIssues),
    };
  }

  if (customers.length === 0) {
    return {
      totalRows: normalized.accounts.length,
      validRows: 0,
      errorRows: normalized.accounts.length,
      missingColumns: [],
      duplicateCustomerIds: [],
      invalidEmails: 0,
      invalidDates: 0,
      invalidNumbers: 0,
      rowErrors: [
        {
          row: 0,
          field: "accounts",
          issue: "No customers could be rolled up from the workbook.",
          value: "",
        },
      ],
      passed: false,
      customers: [],
      importWarnings: rollupWarnings,
      importNotes,
      importIssues,
      importSummary: buildImportSummary(normalized, 0, importIssues),
    };
  }

  return {
    totalRows: normalized.accounts.length,
    validRows: customers.length,
    errorRows: 0,
    missingColumns: [],
    duplicateCustomerIds: [],
    invalidEmails: 0,
    invalidDates: 0,
    invalidNumbers: 0,
    rowErrors: [],
    passed: true,
    customers,
    importedContacts: buildImportedContactsFromNormalized(normalized),
    importWarnings: rollupWarnings,
    importNotes,
    importIssues,
    importSummary: buildImportSummary(normalized, customers.length, importIssues),
  };
}

export async function validateTargetMultisheetFile(
  file: File,
  options?: { now?: Date },
): Promise<ValidationResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  return validateTargetMultisheetWorkbook(workbook, options);
}
