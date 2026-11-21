import * as XLSX from "xlsx";

import {
  FLAT_JOURNEY_IMPORT_SHEET_NAME,
  FLAT_ROW2_COLUMNS,
  FLAT_ROW2_DISPLAY_LABELS,
} from "./import-flat-row2-schema";
import { row2SheetFromRows } from "./import-templates";

function buildAccountFields(index: number): Record<string, string> {
  const id = `ACCT-${String(index + 1).padStart(3, "0")}`;
  const names = [
    "Demo Customer 001",
    "Demo Customer 002",
    "Demo Customer 003",
    "Demo Customer 014",
    "Demo Customer 005",
    "Demo Customer 006",
    "Demo Customer 015",
    "Demo Customer 016",
    "Demo Customer 009",
    "Demo Customer 017",
    "Demo Customer 011",
    "Demo Customer 018",
    "Demo Customer 019",
    "Demo Customer 020",
    "Demo Customer 021",
    "Demo Customer 022",
    "Demo Customer 023",
    "Demo Customer 024",
    "Demo Customer 025",
    "Demo Customer 026",
  ];

  return {
    account_id: id,
    account_name: names[index] ?? `Account ${index + 1}`,
    plan: index % 3 === 0 ? "Enterprise" : index % 3 === 1 ? "Professional" : "Starter",
    journey_stage: index % 4 === 0 ? "Adoption" : "Onboarding",
    use_case: "Security Operations",
    primary_icp: "Enterprise Security",
    term_start_date: "2026-01-15",
    activation_start_date: "2026-01-15",
    activation_window_end_date: "2026-04-15",
    renewal_date: "2027-01-15",
    seats_purchased: String(10 + index),
    search_seats_assigned: "2",
    graph_browser_seats_assigned: "3",
    graph_desktop_seats_assigned: "2",
    search_active_users: "2",
    graph_browser_active_users: "3",
    graph_desktop_active_users: "2",
    total_active_seats: String(7 + (index % 5)),
    total_sessions: String(100 + index * 10),
    onboarding_completed: index % 5 === 0 ? "Yes" : "No",
    onboarding_date: "2026-01-15",
    onboarding_age_days: String(30 + index),
    near_threshold: index % 2 === 0 ? "Yes" : "No",
    active_users_7d: "5",
    total_sessions_7d: "20",
    active_users_15d: "6",
    total_sessions_15d: "40",
    active_users_30d: "7",
    total_sessions_30d: "80",
    active_users_100d: "7",
    total_sessions_100d: String(100 + index * 10),
    invite_status: "Accepted",
    invite_sent_date: "2026-01-10",
    invite_accepted_date: "2026-01-12",
    notes: "",
  };
}

function buildFlatRow(
  accountIndex: number,
  contact: {
    email: string;
    role: "Admin" | "User" | "CSM";
    name: string;
    do_not_contact?: string;
  },
): Record<string, string> {
  return {
    ...buildAccountFields(accountIndex),
    contact_email: contact.email,
    contact_name: contact.name,
    contact_role: contact.role,
    do_not_contact: contact.do_not_contact ?? "No",
  };
}

function appendFieldGuide(workbook: XLSX.WorkBook): void {
  const guide = [
    ["Sheet", "Row 1 Label", "Row 2 System Key", "Required", "Notes"],
    [
      "Journey Import",
      "—",
      "—",
      "—",
      "Row 1 = labels. Row 2 = system keys. Row 3+ = one account + contact per row.",
    ],
    [
      "Journey Import",
      "—",
      "—",
      "—",
      "account_id may repeat. contact_email must be globally unique. Signals are not imported.",
    ],
  ];
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(guide),
    "Field Guide",
  );
}

/** Compact flat workbook: 2 accounts, 3 contacts (Admin+User on ACCT-001, Admin on ACCT-002). */
export function buildFlatRow2WorkbookSmall(): XLSX.WorkBook {
  const rows = [
    buildFlatRow(0, {
      email: "admin@customer-001.example.com",
      role: "Admin",
      name: "Aster Demo",
    }),
    buildFlatRow(0, {
      email: "aster.demo@customer-001.example.com",
      role: "User",
      name: "Aster Demo",
    }),
    buildFlatRow(1, {
      email: "it-admin@customer-002.example.com",
      role: "Admin",
      name: "Birch Demo",
    }),
  ];
  rows[0]!.account_id = "ACCT-001";
  rows[0]!.account_name = "Demo Customer 001";
  rows[1]!.account_id = "ACCT-001";
  rows[1]!.account_name = "Demo Customer 001";
  rows[2]!.account_id = "ACCT-002";
  rows[2]!.account_name = "Demo Customer 002";

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    row2SheetFromRows(FLAT_ROW2_COLUMNS, FLAT_ROW2_DISPLAY_LABELS, rows),
    FLAT_JOURNEY_IMPORT_SHEET_NAME,
  );
  appendFieldGuide(workbook);
  return workbook;
}

/** Realistic flat workbook: 20 accounts, 45 contacts (Admin+User each + CSM on first 5). */
export function buildFlatRow2Workbook20Accounts(): XLSX.WorkBook {
  const rows: Record<string, string>[] = [];

  for (let index = 0; index < 20; index += 1) {
    const accountId = `ACCT-${String(index + 1).padStart(3, "0")}`;
    rows.push(
      buildFlatRow(index, {
        email: `admin${index + 1}@example.com`,
        role: "Admin",
        name: `Admin ${index + 1}`,
      }),
    );
    rows[rows.length - 1]!.account_id = accountId;

    rows.push(
      buildFlatRow(index, {
        email: `user${index + 1}@example.com`,
        role: "User",
        name: `User ${index + 1}`,
        do_not_contact: index % 2 === 1 ? "Yes" : "No",
      }),
    );
    rows[rows.length - 1]!.account_id = accountId;

    if (index < 5) {
      rows.push(
        buildFlatRow(index, {
          email: `csm${index + 1}@team.example.com`,
          role: "CSM",
          name: "Ash Demo",
        }),
      );
      rows[rows.length - 1]!.account_id = accountId;
    }
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    row2SheetFromRows(FLAT_ROW2_COLUMNS, FLAT_ROW2_DISPLAY_LABELS, rows),
    FLAT_JOURNEY_IMPORT_SHEET_NAME,
  );
  appendFieldGuide(workbook);
  return workbook;
}

export const FLAT_ROW2_SMALL_WORKBOOK_FILENAME = "flat-row2-import-2-accounts.xlsx";
export const FLAT_ROW2_20_ACCOUNTS_WORKBOOK_FILENAME =
  "flat-row2-import-20-accounts.xlsx";
