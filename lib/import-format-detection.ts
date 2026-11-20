import * as XLSX from "xlsx";

import {
  detectFlatRow2HeaderMode,
  flatRow2HeaderKeysPresent,
  FLAT_JOURNEY_IMPORT_SHEET_NAME,
  validateFlatRow2Headers,
} from "./import-flat-row2-schema";
import {
  detectAccountsHeaderMode,
  detectContactsHeaderMode,
  detectSignalsHeaderMode,
  findDuplicateHeaderKeys,
  missingRequiredColumns,
  normalizeHeaderRow,
  ROW2_REQUIRED_ACCOUNTS_COLUMNS,
  ROW2_REQUIRED_CONTACTS_COLUMNS,
  ROW2_REQUIRED_SIGNALS_COLUMNS,
} from "./import-row2-schema";
import {
  TARGET_ACCOUNTS_COLUMNS,
  TARGET_CONTACTS_COLUMNS,
} from "./import-templates";
import { REQUIRED_COLUMNS } from "./upload-validation";

export type ImportFormat = "option_a" | "option_c" | "invalid";

export type ImportFormatResult = {
  format: ImportFormat;
  label: string;
  message: string;
  sheetNames: string[];
  reasons: string[];
  headerMode?: "row2" | "legacy_single_row" | "flat_row2";
};

const ACCOUNTS_STYLE_SIGNALS = [
  "customer_id",
  "customer_name",
  "plan",
  "stage",
] as const;

function normalizeHeader(key: string): string {
  return key.trim().toLowerCase().replace(/\s+/g, "_");
}

function normalizeHeaders(headers: string[]): string[] {
  return headers.map(normalizeHeader).filter(Boolean);
}

function normalizeSheetName(name: string): string {
  return name.trim().toLowerCase();
}

function hasSheet(sheetNames: string[], target: string): boolean {
  const normalized = target.toLowerCase();
  return sheetNames.some((name) => normalizeSheetName(name) === normalized);
}

function headerSet(headers: string[]): Set<string> {
  return new Set(normalizeHeaders(headers));
}

function hasAllRequiredColumns(headers: string[]): boolean {
  const present = headerSet(headers);
  return REQUIRED_COLUMNS.every((column) => present.has(column));
}

function isAccountsStyle(headers: string[]): boolean {
  const present = headerSet(headers);
  return ACCOUNTS_STYLE_SIGNALS.every((column) => present.has(column));
}

function fileExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function readSheetMatrix(sheet: XLSX.WorkSheet | undefined): unknown[][] {
  if (!sheet) return [];

  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });
}

function extractAccountsHeaders(matrix: unknown[][]): {
  headerMode: "row2" | "legacy_single_row" | "flat_row2" | null;
  headers: string[];
} {
  const mode = detectAccountsHeaderMode(matrix);
  if (!mode) {
    return { headerMode: null, headers: [] };
  }

  const headerRowIndex = mode === "row2" ? 1 : 0;
  const headers = normalizeHeaderRow(matrix[headerRowIndex] ?? []);
  return { headerMode: mode, headers };
}

function validateRow2WorkbookHeaders(input: {
  accountsHeaders: string[];
  contactsHeaders: string[];
  signalsHeaders: string[];
}): string[] {
  const reasons: string[] = [];
  const sheets: Array<{
    name: string;
    headers: string[];
    required: readonly string[];
  }> = [
    {
      name: "Accounts",
      headers: input.accountsHeaders,
      required: ROW2_REQUIRED_ACCOUNTS_COLUMNS,
    },
    {
      name: "Contacts",
      headers: input.contactsHeaders,
      required: ROW2_REQUIRED_CONTACTS_COLUMNS,
    },
    {
      name: "Signals",
      headers: input.signalsHeaders,
      required: ROW2_REQUIRED_SIGNALS_COLUMNS,
    },
  ];

  for (const { name, headers, required } of sheets) {
    if (headers.length === 0) {
      reasons.push(`${name} sheet is missing Row 2 system keys`);
      continue;
    }

    for (const duplicate of findDuplicateHeaderKeys(headers)) {
      reasons.push(`${name} sheet has duplicate Row 2 system key: ${duplicate}`);
    }

    for (const missing of missingRequiredColumns(headers, required)) {
      reasons.push(`${name} sheet is missing required Row 2 system key: ${missing}`);
    }
  }

  return reasons;
}

function validateFlatWorkbookHeaders(headers: string[]): string[] {
  return validateFlatRow2Headers(headers).errors;
}

export function detectImportFormatFromWorkbook(input: {
  fileName: string;
  sheetNames: string[];
  firstSheetHeaders?: string[];
  accountsHeaders?: string[];
  contactsHeaders?: string[];
  signalsHeaders?: string[];
  journeyImportHeaders?: string[];
  headerMode?: "row2" | "legacy_single_row" | "flat_row2";
}): ImportFormatResult {
  const {
    fileName,
    sheetNames,
    firstSheetHeaders = [],
    accountsHeaders = [],
    contactsHeaders = [],
    signalsHeaders = [],
    journeyImportHeaders = [],
    headerMode,
  } = input;
  const ext = fileExtension(fileName);
  const reasons: string[] = [];

  if (ext === "csv") {
    return {
      format: "option_a",
      label: "Legacy CSV",
      message:
        "CSV is a legacy format. Download the Excel Import Template and upload a .xlsx workbook.",
      sheetNames,
      reasons: ["File extension is .csv"],
    };
  }

  if (ext !== "xlsx") {
    return {
      format: "invalid",
      label: "Unrecognized import format",
      message:
        "Upload an Excel workbook (.xlsx) with Accounts, Contacts, and Signals sheets.",
      sheetNames,
      reasons: [`Unsupported extension: .${ext || "unknown"}`],
    };
  }

  const hasJourneyImportSheet = hasSheet(sheetNames, FLAT_JOURNEY_IMPORT_SHEET_NAME);

  if (hasJourneyImportSheet && flatRow2HeaderKeysPresent(journeyImportHeaders)) {
    reasons.push("Workbook includes Journey Import sheet with flat Row 2 keys");

    const flatIssues = validateFlatWorkbookHeaders(journeyImportHeaders);
    if (flatIssues.length > 0) {
      reasons.push(...flatIssues);
      return {
        format: "invalid",
        label: "Invalid flat Row 2 workbook",
        message:
          "Row 2 system keys are missing or invalid on Journey Import. Use the flat import template when available.",
        sheetNames,
        reasons,
        headerMode: "flat_row2",
      };
    }

    reasons.push("Flat Row 2 system keys detected on Journey Import sheet");
    return {
      format: "option_c",
      label: "Flat Row 2 workbook",
      message:
        "Flat Row 2 workbook detected. Row 1 labels are ignored; the app reads Row 2 system keys. Click Validate Data to continue.",
      sheetNames,
      reasons,
      headerMode: "flat_row2",
    };
  }

  const hasAccountsSheet = hasSheet(sheetNames, "Accounts");
  const hasContactsSheet = hasSheet(sheetNames, "Contacts");
  const hasSignalsSheet = hasSheet(sheetNames, "Signals");

  if (hasAccountsSheet && hasContactsSheet && hasSignalsSheet) {
    reasons.push("Workbook includes Accounts, Contacts, and Signals sheets");

    if (headerMode === "row2") {
      const row2Issues = validateRow2WorkbookHeaders({
        accountsHeaders,
        contactsHeaders,
        signalsHeaders,
      });

      if (row2Issues.length > 0) {
        reasons.push(...row2Issues);
        return {
          format: "invalid",
          label: "Invalid Row 2 header workbook",
          message:
            "Row 2 system keys are missing or invalid on one or more sheets. Download the Excel Import Template.",
          sheetNames,
          reasons,
          headerMode,
        };
      }

      reasons.push("Row 2 system keys detected on all required sheets");
      return {
        format: "option_c",
        label: "Row 2 Excel workbook",
        message:
          "Row 2 Excel workbook detected. Row 1 labels are ignored; the app reads Row 2 system keys. Click Validate Data to continue.",
        sheetNames,
        reasons,
        headerMode,
      };
    }

    if (headerMode === "legacy_single_row") {
      reasons.push("Legacy single-row headers detected on Accounts sheet");
      return {
        format: "option_c",
        label: "Legacy single-row workbook",
        message:
          "Legacy single-row workbook detected. Download the Excel Import Template for the recommended Row 2 layout.",
        sheetNames,
        reasons,
        headerMode,
      };
    }

    if (TARGET_CONTACTS_COLUMNS.length > 0) {
      reasons.push(
        `Contacts sheet expects columns such as ${TARGET_CONTACTS_COLUMNS.slice(0, 2).join(", ")}`,
      );
    }
    return {
      format: "option_c",
      label: "Excel workbook",
      message:
        "Excel workbook detected (Accounts, Contacts, and Signals). Click Validate Data to continue.",
      sheetNames,
      reasons,
      headerMode,
    };
  }

  if (hasAccountsSheet && hasContactsSheet && !hasSignalsSheet) {
    reasons.push("Accounts and Contacts sheets found");
    reasons.push("Signals sheet is missing");
    return {
      format: "invalid",
      label: "Incomplete Excel workbook",
      message:
        "Signals sheet is required. Download the Excel Import Template.",
      sheetNames,
      reasons,
    };
  }

  if (hasAllRequiredColumns(firstSheetHeaders)) {
    reasons.push(`First sheet includes all ${REQUIRED_COLUMNS.length} required columns`);
    return {
      format: "option_a",
      label: "Legacy single-sheet workbook",
      message:
        "Legacy single-sheet layout detected. Download the Excel Import Template for the recommended format.",
      sheetNames,
      reasons,
    };
  }

  if (isAccountsStyle(firstSheetHeaders) && !hasContactsSheet) {
    reasons.push("First sheet looks like Accounts data");
    reasons.push("Contacts sheet is missing");
    if (TARGET_ACCOUNTS_COLUMNS.length > 0) {
      reasons.push(
        `Expected a Contacts sheet alongside Accounts (${TARGET_ACCOUNTS_COLUMNS.length} account columns in target template)`,
      );
    }
    return {
      format: "invalid",
      label: "Incomplete Excel workbook",
      message:
        "Accounts sheet found, but Contacts sheet is missing. Use the Excel Import Template.",
      sheetNames,
      reasons,
    };
  }

  reasons.push("First sheet does not match the Excel Import Template layout");
  if (sheetNames.length > 0) {
    reasons.push(`Sheets found: ${sheetNames.join(", ")}`);
  }

  return {
    format: "invalid",
    label: "Unrecognized import format",
    message:
      "Upload an Excel workbook (.xlsx) with Accounts, Contacts, and Signals sheets.",
    sheetNames,
    reasons,
  };
}

function extractFirstRowHeaders(sheet: XLSX.WorkSheet | undefined): string[] {
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json<(string | number | boolean)[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });

  const headerRow = rows[0];
  if (!headerRow || !Array.isArray(headerRow)) return [];

  return headerRow.map((cell) => String(cell ?? "").trim()).filter(Boolean);
}

function findSheetName(sheetNames: string[], target: string): string | undefined {
  const normalized = target.toLowerCase();
  return sheetNames.find((name) => normalizeSheetName(name) === normalized);
}

export async function readWorkbookMetadata(
  file: File,
): Promise<{
  sheetNames: string[];
  firstSheetHeaders: string[];
  accountsHeaders: string[];
  contactsHeaders: string[];
  signalsHeaders: string[];
  journeyImportHeaders: string[];
  headerMode?: "row2" | "legacy_single_row" | "flat_row2";
}> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetNames = workbook.SheetNames;
  const firstSheetName = sheetNames[0];
  const firstSheetHeaders = extractFirstRowHeaders(
    firstSheetName ? workbook.Sheets[firstSheetName] : undefined,
  );

  const accountsSheetName = findSheetName(sheetNames, "Accounts");
  const contactsSheetName = findSheetName(sheetNames, "Contacts");
  const signalsSheetName = findSheetName(sheetNames, "Signals");

  const accountsMatrix = readSheetMatrix(
    accountsSheetName ? workbook.Sheets[accountsSheetName] : undefined,
  );
  const contactsMatrix = readSheetMatrix(
    contactsSheetName ? workbook.Sheets[contactsSheetName] : undefined,
  );
  const signalsMatrix = readSheetMatrix(
    signalsSheetName ? workbook.Sheets[signalsSheetName] : undefined,
  );

  const journeyImportSheetName = findSheetName(
    sheetNames,
    FLAT_JOURNEY_IMPORT_SHEET_NAME,
  );
  const journeyImportMatrix = readSheetMatrix(
    journeyImportSheetName ? workbook.Sheets[journeyImportSheetName] : undefined,
  );
  const journeyImportHeaderRowIndex =
    detectFlatRow2HeaderMode(journeyImportMatrix) === "flat_row2" ? 1 : 0;

  const accounts = extractAccountsHeaders(accountsMatrix);
  const contactsHeaderRowIndex =
    detectContactsHeaderMode(contactsMatrix) === "row2" ? 1 : 0;
  const signalsHeaderRowIndex =
    detectSignalsHeaderMode(signalsMatrix) === "row2" ? 1 : 0;

  const journeyImportHeaders = normalizeHeaderRow(
    journeyImportMatrix[journeyImportHeaderRowIndex] ?? [],
  );

  const flatMode = detectFlatRow2HeaderMode(journeyImportMatrix);

  return {
    sheetNames,
    firstSheetHeaders,
    accountsHeaders: accounts.headers,
    contactsHeaders: normalizeHeaderRow(
      contactsMatrix[contactsHeaderRowIndex] ?? [],
    ),
    signalsHeaders: normalizeHeaderRow(
      signalsMatrix[signalsHeaderRowIndex] ?? [],
    ),
    journeyImportHeaders,
    headerMode: flatMode ?? accounts.headerMode ?? undefined,
  };
}

export async function detectImportFormatFromFile(
  file: File,
): Promise<ImportFormatResult> {
  const metadata = await readWorkbookMetadata(file);
  return detectImportFormatFromWorkbook({
    fileName: file.name,
    sheetNames: metadata.sheetNames,
    firstSheetHeaders: metadata.firstSheetHeaders,
    accountsHeaders: metadata.accountsHeaders,
    contactsHeaders: metadata.contactsHeaders,
    signalsHeaders: metadata.signalsHeaders,
    journeyImportHeaders: metadata.journeyImportHeaders,
    headerMode: metadata.headerMode,
  });
}
