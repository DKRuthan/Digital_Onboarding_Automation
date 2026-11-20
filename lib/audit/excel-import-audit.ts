import type { ValidationResult } from "@/lib/upload-validation";

/** Count-only metadata keys for Excel import UI audit events. */
export const EXCEL_IMPORT_AUDIT_COUNT_KEYS = [
  "account_count",
  "contact_count",
  "signal_count",
  "blocker_count",
  "warning_count",
  "duplicate_contact_email_count",
  "orphan_signal_count",
  "orphan_contact_count",
] as const;

export type ExcelImportAuditCountKey =
  (typeof EXCEL_IMPORT_AUDIT_COUNT_KEYS)[number];

/**
 * Build counts-only audit metadata for data.excel_import.validate / apply.
 * Never include workbook contents, contact lists, or secrets.
 */
export function buildExcelImportAuditMetadata(
  result: ValidationResult,
): Record<ExcelImportAuditCountKey, number> {
  const summary = result.importSummary;
  return {
    account_count: summary?.accountsCount ?? result.validRows,
    contact_count:
      summary?.contactsCount ?? result.importedContacts?.length ?? 0,
    signal_count: summary?.signalsCount ?? 0,
    blocker_count: summary?.blockerCount ?? 0,
    warning_count: summary?.warningCount ?? 0,
    duplicate_contact_email_count: summary?.duplicateContactEmailCount ?? 0,
    orphan_signal_count: summary?.orphanSignalCount ?? 0,
    orphan_contact_count: summary?.orphanContactCount ?? 0,
  };
}
