import { workspaceStorage } from "./browser-workspace-storage";
import type { Customer, ImportedContact } from "./types";
import type { ValidationResult } from "./upload-validation";

export const LOCAL_ACTIVE_IMPORT_STORAGE_KEY =
  "digital-journey.active-import.v1";

export const LOCAL_ACTIVE_IMPORT_SCHEMA_VERSION = 1;

export type LocalActiveImportDataSource = "upload";

export type LocalActiveImportSummary = {
  passed: boolean;
  headerMode?: "flat_row2" | "row2" | "legacy_single_row";
  accountsCount?: number;
  contactsCount?: number;
  blockerCount?: number;
  warningCount?: number;
};

export type LocalActiveImport = {
  schemaVersion: number;
  dataSource: LocalActiveImportDataSource;
  customers: Customer[];
  importedContacts: ImportedContact[];
  appliedAt: string;
  sourceFilename?: string | null;
  validationSummary?: LocalActiveImportSummary | null;
};

export type SaveLocalActiveImportInput = {
  customers: Customer[];
  importedContacts: ImportedContact[];
  sourceFilename?: string | null;
  validationSummary?: LocalActiveImportSummary | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isCustomerShape(value: unknown): value is Customer {
  if (!isRecord(value)) return false;
  return (
    typeof value.customer_id === "string" &&
    typeof value.customer_name === "string"
  );
}

function isImportedContactShape(value: unknown): value is ImportedContact {
  if (!isRecord(value)) return false;
  return (
    typeof value.contact_email === "string" &&
    typeof value.customer_id === "string" &&
    typeof value.do_not_contact === "boolean"
  );
}

export function isLocalActiveImport(value: unknown): value is LocalActiveImport {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== LOCAL_ACTIVE_IMPORT_SCHEMA_VERSION) return false;
  if (value.dataSource !== "upload") return false;
  if (!Array.isArray(value.customers) || value.customers.length === 0) {
    return false;
  }
  if (!value.customers.every(isCustomerShape)) return false;
  if (!Array.isArray(value.importedContacts)) return false;
  if (!value.importedContacts.every(isImportedContactShape)) return false;
  if (typeof value.appliedAt !== "string") return false;
  return true;
}

export function buildLocalImportValidationSummary(
  result: ValidationResult | null | undefined,
): LocalActiveImportSummary | null {
  if (!result) return null;
  return {
    passed: result.passed,
    headerMode: result.importSummary?.headerMode,
    accountsCount:
      result.importSummary?.accountsCount ?? result.customers.length,
    contactsCount:
      result.importSummary?.contactsCount ?? result.importedContacts?.length ?? 0,
    blockerCount: result.importSummary?.blockerCount,
    warningCount: result.importSummary?.warningCount,
  };
}

export function rebuildValidationResultFromStored(
  stored: LocalActiveImport,
): ValidationResult | null {
  const summary = stored.validationSummary;
  if (!summary) return null;

  return {
    totalRows: summary.accountsCount ?? stored.customers.length,
    validRows: summary.accountsCount ?? stored.customers.length,
    errorRows: 0,
    missingColumns: [],
    duplicateCustomerIds: [],
    invalidEmails: 0,
    invalidDates: 0,
    invalidNumbers: 0,
    rowErrors: [],
    passed: summary.passed,
    customers: stored.customers,
    importedContacts: stored.importedContacts,
    importSummary: {
      format: "option_c",
      headerMode: summary.headerMode,
      accountsCount: summary.accountsCount,
      contactsCount: summary.contactsCount,
      customersCount: summary.accountsCount,
      blockerCount: summary.blockerCount,
      warningCount: summary.warningCount,
    },
  };
}

export function saveLocalActiveImport(input: SaveLocalActiveImportInput): void {
  if (typeof window === "undefined") return;

  try {
    const payload: LocalActiveImport = {
      schemaVersion: LOCAL_ACTIVE_IMPORT_SCHEMA_VERSION,
      dataSource: "upload",
      customers: input.customers,
      importedContacts: input.importedContacts,
      appliedAt: new Date().toISOString(),
      sourceFilename: input.sourceFilename ?? null,
      validationSummary: input.validationSummary ?? null,
    };

    workspaceStorage.setItem(
      LOCAL_ACTIVE_IMPORT_STORAGE_KEY,
      JSON.stringify(payload),
    );
  } catch {
    // Ignore quota / private mode errors — session state still works.
  }
}

export function loadLocalActiveImport(): LocalActiveImport | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = workspaceStorage.getItem(LOCAL_ACTIVE_IMPORT_STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!isLocalActiveImport(parsed)) return null;

    return parsed;
  } catch {
    return null;
  }
}

export function clearLocalActiveImport(): void {
  if (typeof window === "undefined") return;

  try {
    workspaceStorage.removeItem(LOCAL_ACTIVE_IMPORT_STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
}
