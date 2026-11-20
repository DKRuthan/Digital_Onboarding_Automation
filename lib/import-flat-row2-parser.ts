import * as XLSX from "xlsx";

import { normalizeContactEmail } from "./import-contact-email";
import {
  detectFlatRow2HeaderMode,
  FLAT_JOURNEY_IMPORT_SHEET_NAME,
  validateFlatRow2Headers,
} from "./import-flat-row2-schema";
import type {
  ImportedAccountRow,
  ImportedContactRow,
  NormalizedImport,
} from "./import-multisheet-parser";
import { MultisheetParserError } from "./import-multisheet-parser";
import { normalizeHeaderRow } from "./import-row2-schema";

export { FLAT_JOURNEY_IMPORT_SHEET_NAME };

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).trim();
}

export function findSheetName(
  sheetNames: string[],
  target: string,
): string | undefined {
  const normalizedTarget = target.trim().toLowerCase();
  return sheetNames.find(
    (name) => name.trim().toLowerCase() === normalizedTarget,
  );
}

export function readSheetMatrix(sheet: XLSX.WorkSheet | undefined): unknown[][] {
  if (!sheet) return [];

  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });
}

function normalizeDisplayRow(cells: unknown[]): string[] {
  return cells.map((cell) => String(cell ?? "").trim());
}

function rowsToObjects(
  headers: string[],
  dataRows: unknown[][],
): Record<string, string>[] {
  return dataRows
    .map((row) => {
      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        if (!header) return;
        record[header] = cellToString(row[index]);
      });
      return record;
    })
    .filter((row) => Object.values(row).some((value) => value !== ""));
}

export function parseFlatSheetDataRows(
  sheet: XLSX.WorkSheet,
): Record<string, string>[] {
  const matrix = readSheetMatrix(sheet);
  const headerRow = matrix[1];
  if (!headerRow || !Array.isArray(headerRow)) {
    throw new MultisheetParserError("Missing header row on Journey Import sheet.");
  }

  const headers = normalizeHeaderRow(headerRow);
  const dataRows = matrix.slice(2) as unknown[][];
  return rowsToObjects(headers, dataRows);
}

export function extractFlatSheetHeaders(sheet: XLSX.WorkSheet): string[] {
  const matrix = readSheetMatrix(sheet);
  if (matrix.length < 2) return [];
  const headerRow = matrix[1];
  if (!headerRow || !Array.isArray(headerRow)) return [];
  return normalizeHeaderRow(headerRow).filter(Boolean);
}

export function extractFlatDisplayLabels(
  sheet: XLSX.WorkSheet,
): string[] | undefined {
  const matrix = readSheetMatrix(sheet);
  const labelRow = matrix[0];
  if (!labelRow || !Array.isArray(labelRow)) return undefined;
  return normalizeDisplayRow(labelRow);
}

function pickString(row: Record<string, string>, key: string): string | undefined {
  const value = row[key];
  return value === "" ? undefined : value;
}

function sumNumericStrings(...values: Array<string | undefined>): string | undefined {
  let total = 0;
  let found = false;

  for (const value of values) {
    if (value === undefined || value.trim() === "") continue;
    const num = Number(value.trim());
    if (!Number.isFinite(num)) continue;
    total += num;
    found = true;
  }

  return found ? String(total) : undefined;
}

export function mapFlatRowToAccount(row: Record<string, string>): ImportedAccountRow {
  const seatsAssigned =
    sumNumericStrings(
      row.search_seats_assigned,
      row.graph_browser_seats_assigned,
      row.graph_desktop_seats_assigned,
    ) ?? pickString(row, "seats_assigned");

  return {
    customer_id: row.account_id ?? "",
    customer_name: row.account_name ?? "",
    plan: pickString(row, "plan"),
    stage: pickString(row, "journey_stage"),
    use_case: pickString(row, "use_case"),
    icp: pickString(row, "primary_icp"),
    onboarding_start_date:
      pickString(row, "activation_start_date") ?? pickString(row, "onboarding_date"),
    term_start_date: pickString(row, "term_start_date"),
    renewal_date: pickString(row, "renewal_date"),
    invite_status: pickString(row, "invite_status"),
    invite_sent_date: pickString(row, "invite_sent_date"),
    invite_accepted_date: pickString(row, "invite_accepted_date"),
    usage_sessions: pickString(row, "total_sessions"),
    active_users: pickString(row, "total_active_seats"),
    seats_total: pickString(row, "seats_purchased"),
    seats_assigned: seatsAssigned,
    graph_desktop_assigned: pickString(row, "graph_desktop_seats_assigned"),
    graph_browser_assigned: pickString(row, "graph_browser_seats_assigned"),
    search_assigned: pickString(row, "search_seats_assigned"),
    notes: pickString(row, "notes"),
  };
}

export function mapFlatRowToContact(row: Record<string, string>): ImportedContactRow {
  const rawEmail = row.contact_email ?? "";
  return {
    contact_email: rawEmail ? normalizeContactEmail(rawEmail) : "",
    contact_role: row.contact_role ?? "",
    contact_name: pickString(row, "contact_name"),
    do_not_contact: pickString(row, "do_not_contact"),
    customer_id: row.account_id ?? "",
  };
}

/**
 * Parse a flat L-4 Journey Import workbook into the existing NormalizedImport shape.
 * Accounts are deduplicated by account_id (first row wins). One contact per data row.
 * Signals are always empty for flat import in L-4B.
 */
export function parseFlatRow2Workbook(workbook: XLSX.WorkBook): NormalizedImport {
  const sheetNames = workbook.SheetNames;
  const journeySheetName = findSheetName(sheetNames, FLAT_JOURNEY_IMPORT_SHEET_NAME);

  if (!journeySheetName) {
    throw new MultisheetParserError(
      "Journey Import sheet is required for flat Row 2 import.",
    );
  }

  const journeySheet = workbook.Sheets[journeySheetName];
  const matrix = readSheetMatrix(journeySheet);

  if (matrix.length < 2) {
    throw new MultisheetParserError(
      "Missing Row 2 header row on Journey Import sheet.",
    );
  }

  const headerMode = detectFlatRow2HeaderMode(matrix);
  if (headerMode !== "flat_row2") {
    throw new MultisheetParserError(
      "Journey Import sheet does not contain flat Row 2 system keys (account_id, account_name, contact_email, contact_role).",
    );
  }

  const headers = extractFlatSheetHeaders(journeySheet);
  const headerValidation = validateFlatRow2Headers(headers);
  if (!headerValidation.valid) {
    throw new MultisheetParserError(
      headerValidation.errors[0] ?? "Invalid flat Row 2 headers.",
    );
  }

  const dataRows = parseFlatSheetDataRows(journeySheet);
  const accountsById = new Map<string, ImportedAccountRow>();
  const contacts: ImportedContactRow[] = [];

  for (const row of dataRows) {
    const accountId = row.account_id?.trim() ?? "";
    const contactEmail = row.contact_email?.trim() ?? "";

    if (!accountId && !contactEmail) {
      continue;
    }

    if (contactEmail) {
      contacts.push(mapFlatRowToContact(row));
    }

    if (!accountId) {
      continue;
    }

    if (!accountsById.has(accountId)) {
      accountsById.set(accountId, mapFlatRowToAccount(row));
    }
  }

  return {
    format: "option_c",
    headerMode: "flat_row2",
    accounts: [...accountsById.values()],
    contacts,
    signals: [],
    sheetNames,
    flatDataRows: dataRows,
    sheetHeaders: {
      accounts: headers,
      contacts: headers,
      signals: [],
      displayLabels: {
        accounts: extractFlatDisplayLabels(journeySheet),
        contacts: extractFlatDisplayLabels(journeySheet),
        signals: undefined,
      },
    },
  };
}

/** Used by multi-sheet parser for row2-like header indexing. */
export { isRow2LikeHeaderMode } from "./import-flat-row2-schema";
