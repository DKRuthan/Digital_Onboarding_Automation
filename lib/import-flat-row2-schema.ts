/**
 * Phase L-4 — Flat single-sheet Row 2 import schema.
 * Journey Import sheet: Row 1 labels, Row 2 system keys, Row 3+ data (one row = account + contact).
 */

import {
  findDuplicateHeaderKeys,
  missingRequiredColumns,
  normalizeHeaderKey,
  normalizeHeaderRow,
  type ImportHeaderMode,
} from "./import-row2-schema";

export const FLAT_JOURNEY_IMPORT_SHEET_NAME = "Journey Import";

/** Canonical L-4 flat system keys (Row 2). */
export const FLAT_ROW2_COLUMNS = [
  "account_id",
  "account_name",
  "plan",
  "journey_stage",
  "use_case",
  "primary_icp",
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
  "onboarding_completed",
  "onboarding_date",
  "onboarding_age_days",
  "near_threshold",
  "active_users_7d",
  "total_sessions_7d",
  "active_users_15d",
  "total_sessions_15d",
  "active_users_30d",
  "total_sessions_30d",
  "active_users_100d",
  "total_sessions_100d",
  "contact_email",
  "contact_name",
  "contact_role",
  "do_not_contact",
  "invite_status",
  "invite_sent_date",
  "invite_accepted_date",
  "notes",
] as const;

export const FLAT_ROW2_REQUIRED_COLUMNS = [...FLAT_ROW2_COLUMNS] as const;

export const FLAT_ROW2_ACCOUNT_KEYS = [
  "account_id",
  "account_name",
  "plan",
  "journey_stage",
  "use_case",
  "primary_icp",
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
  "onboarding_completed",
  "onboarding_date",
  "onboarding_age_days",
  "near_threshold",
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
  "notes",
] as const;

export const FLAT_ROW2_CONTACT_KEYS = [
  "contact_email",
  "contact_name",
  "contact_role",
  "do_not_contact",
  "account_id",
] as const;

export const FLAT_ROW2_DISPLAY_LABELS: Record<
  (typeof FLAT_ROW2_COLUMNS)[number],
  string
> = {
  account_id: "Account ID",
  account_name: "Account Name",
  plan: "Plan",
  journey_stage: "Journey Stage",
  use_case: "Use Case",
  primary_icp: "Primary ICP",
  term_start_date: "Term Start Date",
  activation_start_date: "Activation Start Date",
  activation_window_end_date: "Activation Window End Date",
  renewal_date: "Renewal Date",
  seats_purchased: "Seats Purchased",
  search_seats_assigned: "Search Seats Assigned",
  graph_browser_seats_assigned: "Graph Browser Seats Assigned",
  graph_desktop_seats_assigned: "Graph Desktop Seats Assigned",
  search_active_users: "Search Active Users",
  graph_browser_active_users: "Graph Browser Active Users",
  graph_desktop_active_users: "Graph Desktop Active Users",
  total_active_seats: "Total Active Seats",
  total_sessions: "Total Sessions",
  onboarding_completed: "Onboarding Completed",
  onboarding_date: "Onboarding Date",
  onboarding_age_days: "Onboarding Age Days",
  near_threshold: "Near Threshold",
  active_users_7d: "Active Users (7d)",
  total_sessions_7d: "Total Sessions (7d)",
  active_users_15d: "Active Users (15d)",
  total_sessions_15d: "Total Sessions (15d)",
  active_users_30d: "Active Users (30d)",
  total_sessions_30d: "Total Sessions (30d)",
  active_users_100d: "Active Users (100d)",
  total_sessions_100d: "Total Sessions (100d)",
  contact_email: "Contact Email",
  contact_name: "Contact Name",
  contact_role: "Contact Role",
  do_not_contact: "Do Not Contact",
  invite_status: "Invite Status",
  invite_sent_date: "Invite Sent Date",
  invite_accepted_date: "Invite Accepted Date",
  notes: "Notes",
};

export function isRow2LikeHeaderMode(
  mode: ImportHeaderMode,
): mode is "row2" | "flat_row2" {
  return mode === "row2" || mode === "flat_row2";
}

export function isFlatRow2HeaderRow(headers: string[]): boolean {
  const normalized = headers.filter(Boolean);
  return (
    normalized.includes("account_id") &&
    normalized.includes("account_name") &&
    normalized.includes("contact_email") &&
    normalized.includes("contact_role") &&
    !normalized.includes("customer_id") &&
    !normalized.includes("sent_at")
  );
}

export function detectFlatRow2HeaderMode(
  matrix: unknown[][],
): ImportHeaderMode | null {
  const row1 = normalizeHeaderRow(matrix[1] ?? []);
  if (isFlatRow2HeaderRow(row1)) {
    return "flat_row2";
  }
  return null;
}

export type FlatRow2HeaderValidationResult = {
  valid: boolean;
  errors: string[];
};

/** Validate Row 2 system keys on Journey Import (parser / format detection). */
export function validateFlatRow2Headers(headers: string[]): FlatRow2HeaderValidationResult {
  const errors: string[] = [];

  if (headers.length === 0) {
    errors.push("Journey Import sheet is missing Row 2 system keys.");
    return { valid: false, errors };
  }

  for (const duplicate of findDuplicateHeaderKeys(headers)) {
    errors.push(`Journey Import sheet has duplicate Row 2 system key: ${duplicate}`);
  }

  for (const missing of missingRequiredColumns(headers, FLAT_ROW2_REQUIRED_COLUMNS)) {
    errors.push(`Journey Import sheet is missing required Row 2 system key: ${missing}`);
  }

  return { valid: errors.length === 0, errors };
}

export function flatRow2HeaderKeysPresent(headers: string[]): boolean {
  const present = new Set(headers.map(normalizeHeaderKey).filter(Boolean));
  const minimum = ["account_id", "account_name", "contact_email", "contact_role"] as const;
  return minimum.every((key) => present.has(key));
}
