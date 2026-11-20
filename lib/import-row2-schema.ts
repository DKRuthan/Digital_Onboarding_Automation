/**
 * Phase L-2 — Row 2 system key schema and header helpers.
 * Row 1 = display labels (ignored by parser). Row 2 = canonical system keys.
 */

export const ROW2_ACCOUNTS_COLUMNS = [
  "account_id",
  "account_name",
  "plan",
  "journey_stage",
  "segment",
  "use_case",
  "primary_icp",
  "account_owner",
  "owner_dam_name",
  "owner_dam_email",
  "term_start_date",
  "activation_start_date",
  "activation_window_end_date",
  "renewal_date",
  "seats_purchased",
  "search_seats_assigned",
  "graph_browser_seats_assigned",
  "graph_desktop_seats_assigned",
  "search_active_users",
  "graph_browser_active_users",
  "graph_desktop_active_users",
  "total_active_seats",
  "total_sessions",
  "onboarding_date",
  "onboarding_age_days",
  "near_threshold",
  "onboarding_completed",
  "active_users_7d",
  "total_sessions_7d",
  "active_users_15d",
  "total_sessions_15d",
  "active_users_30d",
  "total_sessions_30d",
  "active_users_100d",
  "total_sessions_100d",
  "invite_status",
  "invite_sent_date",
  "invite_accepted_date",
  "last_email_sent_date",
  "last_email_sent_type",
  "emails_sent_count",
  "notes",
  "next_recommended_action",
] as const;

export const ROW2_CONTACTS_COLUMNS = [
  "contact_email",
  "contact_role",
  "contact_name",
  "do_not_contact",
  "account_id",
  "account_name",
  "customer_type",
  "customer_first_name",
] as const;

export const ROW2_SIGNALS_COLUMNS = [
  "contact_email",
  "account_id",
  "sent_at",
  "template_or_type",
  "channel",
  "status",
] as const;

export const ROW2_REQUIRED_ACCOUNTS_COLUMNS = [
  "account_id",
  "account_name",
] as const;

export const ROW2_REQUIRED_CONTACTS_COLUMNS = [
  "contact_email",
  "contact_role",
  "account_id",
] as const;

export const ROW2_REQUIRED_SIGNALS_COLUMNS = [
  "contact_email",
  "account_id",
  "sent_at",
  "template_or_type",
  "channel",
  "status",
] as const;

export type ImportHeaderMode = "row2" | "legacy_single_row" | "flat_row2";

export function normalizeHeaderKey(key: string): string {
  return key.trim().toLowerCase().replace(/\s+/g, "_");
}

export function normalizeHeaderRow(cells: unknown[]): string[] {
  return cells.map((cell) => normalizeHeaderKey(String(cell ?? "")));
}

export function isRow2AccountsHeaderRow(headers: string[]): boolean {
  const normalized = headers.filter(Boolean);
  return (
    normalized.includes("account_id") &&
    normalized.includes("account_name") &&
    !normalized.includes("customer_id")
  );
}

export function isLegacyAccountsHeaderRow(headers: string[]): boolean {
  const normalized = headers.filter(Boolean);
  return normalized.includes("customer_id") && normalized.includes("customer_name");
}

export function detectAccountsHeaderMode(
  matrix: unknown[][],
): ImportHeaderMode | null {
  const row0 = normalizeHeaderRow(matrix[0] ?? []);
  const row1 = normalizeHeaderRow(matrix[1] ?? []);

  if (isRow2AccountsHeaderRow(row1)) {
    return "row2";
  }

  if (isLegacyAccountsHeaderRow(row0)) {
    return "legacy_single_row";
  }

  return null;
}

export function detectContactsHeaderMode(
  matrix: unknown[][],
): ImportHeaderMode | null {
  const row0 = normalizeHeaderRow(matrix[0] ?? []);
  const row1 = normalizeHeaderRow(matrix[1] ?? []);

  if (
    row1.includes("contact_email") &&
    row1.includes("account_id") &&
    !row1.includes("customer_id")
  ) {
    return "row2";
  }

  if (row0.includes("contact_email") && row0.includes("customer_id")) {
    return "legacy_single_row";
  }

  return null;
}

export function detectSignalsHeaderMode(
  matrix: unknown[][],
): ImportHeaderMode | null {
  const row0 = normalizeHeaderRow(matrix[0] ?? []);
  const row1 = normalizeHeaderRow(matrix[1] ?? []);

  if (
    row1.includes("contact_email") &&
    row1.includes("account_id") &&
    row1.includes("sent_at")
  ) {
    return "row2";
  }

  if (row0.includes("contact_email") && row0.includes("customer_id")) {
    return "legacy_single_row";
  }

  return null;
}

export function findDuplicateHeaderKeys(headers: string[]): string[] {
  const seen = new Map<string, number>();
  const duplicates = new Set<string>();

  for (const header of headers) {
    const key = normalizeHeaderKey(header);
    if (!key) continue;
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    if (count > 1) {
      duplicates.add(key);
    }
  }

  return [...duplicates];
}

export function missingRequiredColumns(
  headers: string[],
  required: readonly string[],
): string[] {
  const present = new Set(headers.map(normalizeHeaderKey).filter(Boolean));
  return required.filter((column) => !present.has(column));
}

export function emptyRequiredHeaderCells(
  headers: string[],
  required: readonly string[],
): string[] {
  const normalized = headers.map(normalizeHeaderKey);
  return required.filter((column) => {
    const index = normalized.indexOf(column);
    return index === -1;
  });
}
