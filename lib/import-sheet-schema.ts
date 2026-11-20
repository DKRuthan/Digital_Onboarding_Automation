import type { ImportHeaderMode } from "./import-row2-schema";
import {
  ROW2_REQUIRED_ACCOUNTS_COLUMNS,
  ROW2_REQUIRED_CONTACTS_COLUMNS,
  ROW2_REQUIRED_SIGNALS_COLUMNS,
} from "./import-row2-schema";

export const REQUIRED_ACCOUNTS_COLUMNS = [
  "customer_id",
  "customer_name",
] as const;

export const REQUIRED_CONTACTS_COLUMNS = [
  "contact_email",
  "contact_role",
  "customer_id",
] as const;

export const REQUIRED_SIGNALS_COLUMNS = [
  "contact_email",
  "customer_id",
  "sent_at",
  "template_or_type",
  "channel",
  "status",
] as const;

export type ImportSheetName = "Accounts" | "Contacts" | "Signals";

function normalizeHeader(key: string): string {
  return key.trim().toLowerCase().replace(/\s+/g, "_");
}

export function normalizeSheetHeaders(headers: string[]): string[] {
  return headers.map(normalizeHeader).filter(Boolean);
}

export function missingRequiredColumns(
  headers: string[],
  required: readonly string[],
): string[] {
  const present = new Set(normalizeSheetHeaders(headers));
  return required.filter((column) => !present.has(column));
}

export function requiredAccountsColumns(
  mode: ImportHeaderMode,
): readonly string[] {
  return mode === "row2"
    ? ROW2_REQUIRED_ACCOUNTS_COLUMNS
    : REQUIRED_ACCOUNTS_COLUMNS;
}

export function requiredContactsColumns(
  mode: ImportHeaderMode,
): readonly string[] {
  return mode === "row2"
    ? ROW2_REQUIRED_CONTACTS_COLUMNS
    : REQUIRED_CONTACTS_COLUMNS;
}

export function requiredSignalsColumns(
  mode: ImportHeaderMode,
): readonly string[] {
  return mode === "row2"
    ? ROW2_REQUIRED_SIGNALS_COLUMNS
    : REQUIRED_SIGNALS_COLUMNS;
}
