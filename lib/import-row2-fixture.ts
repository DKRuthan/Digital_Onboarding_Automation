import * as XLSX from "xlsx";

import {
  ROW2_ACCOUNTS_COLUMNS,
  ROW2_CONTACTS_COLUMNS,
  ROW2_SIGNALS_COLUMNS,
} from "./import-row2-schema";
import {
  ROW2_DISPLAY_LABELS,
  row2SheetFromRows,
} from "./import-templates";

export const ROW2_SYSTEM_IMPORT_TEMPLATE_FILENAME =
  "row2-system-import-template-20-accounts.xlsx";

function buildAccountRow(index: number): Record<string, string> {
  const id = `ACCT-${String(index + 1).padStart(3, "0")}`;
  return {
    account_id: id,
    account_name: `Account ${index + 1}`,
    plan: index % 2 === 0 ? "Enterprise" : "Professional",
    journey_stage: "Onboarding",
    segment: "Enterprise Security",
    use_case: "Security Operations",
    primary_icp: "Enterprise Security",
    account_owner: `Owner ${index + 1}`,
    owner_dam_name: "Ash Demo",
    owner_dam_email: "ash.demo@team.example.com",
    term_start_date: "2026-01-15",
    activation_start_date: "2026-01-15",
    activation_window_end_date: "2026-04-15",
    renewal_date: "2027-01-15",
    seats_purchased: "10",
    search_seats_assigned: "2",
    graph_browser_seats_assigned: "3",
    graph_desktop_seats_assigned: "2",
    search_active_users: "2",
    graph_browser_active_users: "3",
    graph_desktop_active_users: "2",
    total_active_seats: "7",
    total_sessions: "100",
    onboarding_date: "2026-01-15",
    onboarding_age_days: "30",
    near_threshold: "No",
    onboarding_completed: "No",
    active_users_7d: "5",
    total_sessions_7d: "20",
    active_users_15d: "6",
    total_sessions_15d: "40",
    active_users_30d: "7",
    total_sessions_30d: "80",
    active_users_100d: "7",
    total_sessions_100d: "100",
    invite_status: "Accepted",
    invite_sent_date: "2026-01-10",
    invite_accepted_date: "2026-01-12",
    last_email_sent_date: "2026-06-01",
    last_email_sent_type: "Welcome",
    emails_sent_count: "2",
    notes: "",
    next_recommended_action: "Review usage",
  };
}

function buildContactRow(
  accountIndex: number,
  role: "Admin" | "User",
): Record<string, string> {
  const accountId = `ACCT-${String(accountIndex + 1).padStart(3, "0")}`;
  const slug = role.toLowerCase();
  return {
    contact_email: `${slug}${accountIndex + 1}@example.com`,
    contact_role: role,
    contact_name: `${role} ${accountIndex + 1}`,
    do_not_contact: "No",
    account_id: accountId,
    account_name: `Account ${accountIndex + 1}`,
    customer_type: "Customer",
    customer_first_name: `${role}${accountIndex + 1}`,
  };
}

/** Row 2 header workbook with 20 accounts, 40 contacts (2 per account), 20 signals. */
export function buildRow2SystemImportWorkbook20Accounts(): XLSX.WorkBook {
  const accountRows = Array.from({ length: 20 }, (_, index) => buildAccountRow(index));
  const contactRows = accountRows.flatMap((_, index) => [
    buildContactRow(index, "Admin"),
    buildContactRow(index, "User"),
  ]);
  const signalRows = contactRows
    .filter((contact) => contact.contact_role === "Admin")
    .map((contact) => ({
      contact_email: contact.contact_email,
      account_id: contact.account_id,
      sent_at: "2026-06-01T10:00:00Z",
      template_or_type: "invite-reminder",
      channel: "email",
      status: "Delivered",
    }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    row2SheetFromRows(
      ROW2_ACCOUNTS_COLUMNS,
      ROW2_DISPLAY_LABELS.accounts,
      accountRows,
    ),
    "Accounts",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    row2SheetFromRows(
      ROW2_CONTACTS_COLUMNS,
      ROW2_DISPLAY_LABELS.contacts,
      contactRows,
    ),
    "Contacts",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    row2SheetFromRows(
      ROW2_SIGNALS_COLUMNS,
      ROW2_DISPLAY_LABELS.signals,
      signalRows,
    ),
    "Signals",
  );
  return workbook;
}

/** Compact Row 2 workbook (2 accounts) for unit tests — mirrors download template sample data. */
export function buildRow2MultisheetWorkbook(): XLSX.WorkBook {
  const accountRows = [
    buildAccountRow(0),
    { ...buildAccountRow(1), account_id: "ACCT-002", account_name: "Demo Customer 002" },
  ];
  accountRows[0]!.account_id = "ACCT-001";
  accountRows[0]!.account_name = "Demo Customer 001";

  const contactRows = [
    {
      ...buildContactRow(0, "Admin"),
      contact_email: "admin@customer-001.example.com",
      contact_name: "Aster Demo",
      account_id: "ACCT-001",
      account_name: "Demo Customer 001",
    },
    {
      ...buildContactRow(0, "User"),
      contact_email: "aster.demo@customer-001.example.com",
      contact_name: "Aster Demo",
      account_id: "ACCT-001",
      account_name: "Demo Customer 001",
    },
    {
      ...buildContactRow(1, "Admin"),
      contact_email: "it-admin@customer-002.example.com",
      contact_name: "Birch Demo",
      account_id: "ACCT-002",
      account_name: "Demo Customer 002",
    },
  ];

  const signalRows = [
    {
      contact_email: "it-admin@customer-002.example.com",
      account_id: "ACCT-002",
      sent_at: "2026-06-01T10:00:00Z",
      template_or_type: "invite-reminder",
      channel: "email",
      status: "Delivered",
    },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    row2SheetFromRows(
      ROW2_ACCOUNTS_COLUMNS,
      ROW2_DISPLAY_LABELS.accounts,
      accountRows,
    ),
    "Accounts",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    row2SheetFromRows(
      ROW2_CONTACTS_COLUMNS,
      ROW2_DISPLAY_LABELS.contacts,
      contactRows,
    ),
    "Contacts",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    row2SheetFromRows(
      ROW2_SIGNALS_COLUMNS,
      ROW2_DISPLAY_LABELS.signals,
      signalRows,
    ),
    "Signals",
  );
  return workbook;
}
