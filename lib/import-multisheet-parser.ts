import * as XLSX from "xlsx";

import { normalizeContactEmail } from "./import-contact-email";
import { isRow2LikeHeaderMode } from "./import-flat-row2-schema";
import {
  detectAccountsHeaderMode,
  detectContactsHeaderMode,
  detectSignalsHeaderMode,
  type ImportHeaderMode,
} from "./import-row2-schema";

export type { ImportHeaderMode };

export type ImportedAccountRow = {
  customer_id: string;
  customer_name: string;
  plan?: string;
  stage?: string;
  segment?: string;
  use_case?: string;
  icp?: string;
  account_owner?: string;
  owner_dam_name?: string;
  owner_dam_email?: string;
  onboarding_start_date?: string;
  term_start_date?: string;
  renewal_date?: string;
  invite_status?: string;
  invite_sent_date?: string;
  invite_accepted_date?: string;
  usage_sessions?: string;
  usage_activities?: string;
  active_users?: string;
  last_usage_date?: string;
  usage_threshold?: string;
  usage_threshold_percent?: string;
  seats_total?: string;
  seats_assigned?: string;
  seat_assignment_percent?: string;
  graph_desktop_assigned?: string;
  graph_browser_assigned?: string;
  search_assigned?: string;
  academy_visited?: string;
  webinar_attended?: string;
  last_email_sent_date?: string;
  last_email_sent_type?: string;
  emails_sent_count?: string;
  notes?: string;
  next_recommended_action?: string;
};

export type ImportedContactRow = {
  contact_email: string;
  contact_role: string;
  contact_name?: string;
  do_not_contact?: string;
  customer_id: string;
};

export type ImportedSignalRow = {
  contact_email?: string;
  customer_id?: string;
  sent_at?: string;
  template_or_type?: string;
  channel?: string;
  status?: string;
};

export type ImportSheetHeaders = {
  accounts: string[];
  contacts: string[];
  signals: string[];
  displayLabels?: {
    accounts?: string[];
    contacts?: string[];
    signals?: string[];
  };
};

export type NormalizedImport = {
  format: "option_c";
  headerMode: ImportHeaderMode;
  accounts: ImportedAccountRow[];
  contacts: ImportedContactRow[];
  signals: ImportedSignalRow[];
  sheetNames: string[];
  sheetHeaders: ImportSheetHeaders;
  /** Raw Journey Import data rows — present only for flat_row2 validation. */
  flatDataRows?: Record<string, string>[];
};

export class MultisheetParserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MultisheetParserError";
  }
}

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

function normalizeRow(row: Record<string, unknown>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[normalizeHeader(key)] = cellToString(value);
  }
  return normalized;
}

function findSheetName(
  sheetNames: string[],
  target: string,
): string | undefined {
  const normalizedTarget = target.trim().toLowerCase();
  return sheetNames.find(
    (name) => name.trim().toLowerCase() === normalizedTarget,
  );
}

function readSheetMatrix(sheet: XLSX.WorkSheet | undefined): unknown[][] {
  if (!sheet) return [];

  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });
}

function normalizeHeaderRow(cells: unknown[]): string[] {
  return cells.map((cell) => normalizeHeader(String(cell ?? "")));
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

function detectWorkbookHeaderMode(
  accountsMatrix: unknown[][],
  contactsMatrix: unknown[][],
  signalsMatrix: unknown[][],
): ImportHeaderMode {
  const accountsMode = detectAccountsHeaderMode(accountsMatrix);
  const contactsMode = detectContactsHeaderMode(contactsMatrix);
  const signalsMode = detectSignalsHeaderMode(signalsMatrix);

  const modes = [accountsMode, contactsMode, signalsMode].filter(
    (mode): mode is ImportHeaderMode => mode !== null,
  );

  if (modes.length === 0) {
    throw new MultisheetParserError(
      "Could not detect header row. Row 2 must contain system keys (account_id, account_name) or use legacy single-row headers.",
    );
  }

  const uniqueModes = new Set(modes);
  if (uniqueModes.size > 1) {
    throw new MultisheetParserError(
      "Mixed header layouts detected across sheets. Use Row 2 system keys consistently on Accounts, Contacts, and Signals.",
    );
  }

  return modes[0]!;
}

function extractSheetHeaders(
  sheet: XLSX.WorkSheet | undefined,
  mode: ImportHeaderMode,
): string[] {
  const matrix = readSheetMatrix(sheet);
  if (matrix.length === 0) return [];

  const headerRowIndex = isRow2LikeHeaderMode(mode) ? 1 : 0;
  const headerRow = matrix[headerRowIndex];
  if (!headerRow || !Array.isArray(headerRow)) return [];

  return normalizeHeaderRow(headerRow).filter(Boolean);
}

function extractDisplayLabels(
  sheet: XLSX.WorkSheet | undefined,
  mode: ImportHeaderMode,
): string[] | undefined {
  if (!isRow2LikeHeaderMode(mode)) return undefined;

  const matrix = readSheetMatrix(sheet);
  const labelRow = matrix[0];
  if (!labelRow || !Array.isArray(labelRow)) return undefined;

  return normalizeDisplayRow(labelRow);
}

function parseSheetRows(
  sheet: XLSX.WorkSheet | undefined,
  mode: ImportHeaderMode,
  sheetName: string,
): Record<string, string>[] {
  if (!sheet) return [];

  const matrix = readSheetMatrix(sheet);
  const headerRowIndex = isRow2LikeHeaderMode(mode) ? 1 : 0;
  const dataStartIndex = isRow2LikeHeaderMode(mode) ? 2 : 1;

  if (isRow2LikeHeaderMode(mode) && matrix.length < 2) {
    throw new MultisheetParserError(
      `Missing Row 2 header row on ${sheetName} sheet.`,
    );
  }

  const headerRow = matrix[headerRowIndex];
  if (!headerRow || !Array.isArray(headerRow)) {
    throw new MultisheetParserError(
      `Missing header row on ${sheetName} sheet.`,
    );
  }

  const headers = normalizeHeaderRow(headerRow);
  const dataRows = matrix.slice(dataStartIndex) as unknown[][];

  if (mode === "legacy_single_row") {
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: false,
    });
    return json
      .map(normalizeRow)
      .filter((row) => Object.values(row).some((value) => value !== ""));
  }

  return rowsToObjects(headers, dataRows);
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

function toAccountRow(
  row: Record<string, string>,
  mode: ImportHeaderMode,
): ImportedAccountRow {
  if (isRow2LikeHeaderMode(mode)) {
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
      segment: pickString(row, "segment"),
      use_case: pickString(row, "use_case"),
      icp: pickString(row, "primary_icp"),
      account_owner: pickString(row, "account_owner"),
      owner_dam_name: pickString(row, "owner_dam_name"),
      owner_dam_email: pickString(row, "owner_dam_email"),
      onboarding_start_date:
        pickString(row, "activation_start_date") ??
        pickString(row, "onboarding_date"),
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
      last_email_sent_date: pickString(row, "last_email_sent_date"),
      last_email_sent_type: pickString(row, "last_email_sent_type"),
      emails_sent_count: pickString(row, "emails_sent_count"),
      notes: pickString(row, "notes"),
      next_recommended_action: pickString(row, "next_recommended_action"),
    };
  }

  return {
    customer_id: row.customer_id ?? "",
    customer_name: row.customer_name ?? "",
    plan: pickString(row, "plan"),
    stage: pickString(row, "stage"),
    segment: pickString(row, "segment"),
    use_case: pickString(row, "use_case"),
    icp: pickString(row, "icp"),
    account_owner: pickString(row, "account_owner"),
    owner_dam_name: pickString(row, "owner_dam_name"),
    owner_dam_email: pickString(row, "owner_dam_email"),
    onboarding_start_date: pickString(row, "onboarding_start_date"),
    term_start_date: pickString(row, "term_start_date"),
    renewal_date: pickString(row, "renewal_date"),
    invite_status: pickString(row, "invite_status"),
    invite_sent_date: pickString(row, "invite_sent_date"),
    invite_accepted_date: pickString(row, "invite_accepted_date"),
    usage_sessions: pickString(row, "usage_sessions"),
    usage_activities: pickString(row, "usage_activities"),
    active_users: pickString(row, "active_users"),
    last_usage_date: pickString(row, "last_usage_date"),
    usage_threshold: pickString(row, "usage_threshold"),
    usage_threshold_percent: pickString(row, "usage_threshold_percent"),
    seats_total: pickString(row, "seats_total"),
    seats_assigned: pickString(row, "seats_assigned"),
    seat_assignment_percent: pickString(row, "seat_assignment_percent"),
    graph_desktop_assigned: pickString(row, "graph_desktop_assigned"),
    graph_browser_assigned: pickString(row, "graph_browser_assigned"),
    search_assigned: pickString(row, "search_assigned"),
    academy_visited: pickString(row, "academy_visited"),
    webinar_attended: pickString(row, "webinar_attended"),
    last_email_sent_date: pickString(row, "last_email_sent_date"),
    last_email_sent_type: pickString(row, "last_email_sent_type"),
    emails_sent_count: pickString(row, "emails_sent_count"),
    notes: pickString(row, "notes"),
    next_recommended_action: pickString(row, "next_recommended_action"),
  };
}

function toContactRow(
  row: Record<string, string>,
  mode: ImportHeaderMode,
): ImportedContactRow {
  const rawEmail = row.contact_email ?? "";
  const customerId =
    isRow2LikeHeaderMode(mode)
      ? (row.account_id ?? "")
      : (row.customer_id ?? "");

  return {
    contact_email: rawEmail ? normalizeContactEmail(rawEmail) : "",
    contact_role: row.contact_role ?? "",
    contact_name: pickString(row, "contact_name"),
    do_not_contact: pickString(row, "do_not_contact"),
    customer_id: customerId,
  };
}

function toSignalRow(
  row: Record<string, string>,
  mode: ImportHeaderMode,
): ImportedSignalRow {
  const rawEmail = row.contact_email ?? "";
  const customerId =
    isRow2LikeHeaderMode(mode)
      ? pickString(row, "account_id")
      : pickString(row, "customer_id");

  return {
    contact_email: rawEmail ? normalizeContactEmail(rawEmail) : undefined,
    customer_id: customerId,
    sent_at: pickString(row, "sent_at"),
    template_or_type: pickString(row, "template_or_type"),
    channel: pickString(row, "channel"),
    status: pickString(row, "status"),
  };
}

/**
 * Parse a target multi-sheet workbook (Accounts + Contacts + Signals).
 * Row 2 system keys are preferred; legacy single-row headers remain supported.
 */
export function parseTargetMultisheetWorkbook(
  workbook: XLSX.WorkBook,
): NormalizedImport {
  const sheetNames = workbook.SheetNames;
  const accountsSheetName = findSheetName(sheetNames, "Accounts");
  const contactsSheetName = findSheetName(sheetNames, "Contacts");
  const signalsSheetName = findSheetName(sheetNames, "Signals");

  if (!accountsSheetName) {
    throw new MultisheetParserError("Accounts sheet is required.");
  }

  if (!contactsSheetName) {
    throw new MultisheetParserError("Contacts sheet is required.");
  }

  if (!signalsSheetName) {
    throw new MultisheetParserError("Signals sheet is required.");
  }

  const accountsSheet = workbook.Sheets[accountsSheetName];
  const contactsSheet = workbook.Sheets[contactsSheetName];
  const signalsSheet = workbook.Sheets[signalsSheetName];

  const accountsMatrix = readSheetMatrix(accountsSheet);
  const contactsMatrix = readSheetMatrix(contactsSheet);
  const signalsMatrix = readSheetMatrix(signalsSheet);

  const headerMode = detectWorkbookHeaderMode(
    accountsMatrix,
    contactsMatrix,
    signalsMatrix,
  );

  const accountRows = parseSheetRows(accountsSheet, headerMode, "Accounts");
  const contactRows = parseSheetRows(contactsSheet, headerMode, "Contacts");
  const signalRows = parseSheetRows(signalsSheet, headerMode, "Signals");

  return {
    format: "option_c",
    headerMode,
    accounts: accountRows.map((row) => toAccountRow(row, headerMode)),
    contacts: contactRows.map((row) => toContactRow(row, headerMode)),
    signals: signalRows.map((row) => toSignalRow(row, headerMode)),
    sheetNames,
    sheetHeaders: {
      accounts: extractSheetHeaders(accountsSheet, headerMode),
      contacts: extractSheetHeaders(contactsSheet, headerMode),
      signals: extractSheetHeaders(signalsSheet, headerMode),
      displayLabels: {
        accounts: extractDisplayLabels(accountsSheet, headerMode),
        contacts: extractDisplayLabels(contactsSheet, headerMode),
        signals: extractDisplayLabels(signalsSheet, headerMode),
      },
    },
  };
}
