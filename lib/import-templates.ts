import * as XLSX from "xlsx";

import { buildSampleCsv } from "./csv-template";
import {
  FLAT_JOURNEY_IMPORT_SHEET_NAME,
  FLAT_ROW2_COLUMNS,
  FLAT_ROW2_DISPLAY_LABELS,
} from "./import-flat-row2-schema";
import {
  ROW2_ACCOUNTS_COLUMNS,
  ROW2_CONTACTS_COLUMNS,
  ROW2_REQUIRED_ACCOUNTS_COLUMNS,
  ROW2_REQUIRED_CONTACTS_COLUMNS,
  ROW2_REQUIRED_SIGNALS_COLUMNS,
  ROW2_SIGNALS_COLUMNS,
} from "./import-row2-schema";
import { downloadTextFile } from "./session-export";

/** User-facing download template uses L-2 Row 2 system keys. */
export const TARGET_ACCOUNTS_COLUMNS = ROW2_ACCOUNTS_COLUMNS;
export const TARGET_CONTACTS_COLUMNS = ROW2_CONTACTS_COLUMNS;
export const TARGET_SIGNALS_COLUMNS = ROW2_SIGNALS_COLUMNS;

/** Legacy L-1 single-row headers — internal/tests only. */
export const LEGACY_ACCOUNTS_COLUMNS = [
  "customer_id",
  "customer_name",
  "plan",
  "stage",
  "segment",
  "use_case",
  "icp",
  "account_owner",
  "owner_dam_name",
  "owner_dam_email",
  "onboarding_start_date",
  "term_start_date",
  "renewal_date",
  "invite_status",
  "invite_sent_date",
  "invite_accepted_date",
  "usage_sessions",
  "usage_activities",
  "active_users",
  "last_usage_date",
  "usage_threshold",
  "usage_threshold_percent",
  "seats_total",
  "seats_assigned",
  "seat_assignment_percent",
  "graph_desktop_assigned",
  "graph_browser_assigned",
  "search_assigned",
  "academy_visited",
  "webinar_attended",
  "last_email_sent_date",
  "last_email_sent_type",
  "emails_sent_count",
  "notes",
  "next_recommended_action",
] as const;

export const LEGACY_CONTACTS_COLUMNS = [
  "contact_email",
  "contact_role",
  "contact_name",
  "do_not_contact",
  "customer_id",
] as const;

export const LEGACY_SIGNALS_COLUMNS = [
  "contact_email",
  "customer_id",
  "sent_at",
  "template_or_type",
  "channel",
  "status",
] as const;

export const ROW2_DISPLAY_LABELS = {
  accounts: {
    account_id: "Account ID",
    account_name: "Account Name",
    plan: "Plan",
    journey_stage: "Journey Stage",
    segment: "Segment",
    use_case: "Use Case",
    primary_icp: "Primary ICP",
    account_owner: "Account Owner",
    owner_dam_name: "Owner DAM Name",
    owner_dam_email: "Owner DAM Email",
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
    onboarding_date: "Onboarding Date",
    onboarding_age_days: "Onboarding Age Days",
    near_threshold: "Near Threshold",
    onboarding_completed: "Onboarding Completed",
    active_users_7d: "Active Users (7d)",
    total_sessions_7d: "Total Sessions (7d)",
    active_users_15d: "Active Users (15d)",
    total_sessions_15d: "Total Sessions (15d)",
    active_users_30d: "Active Users (30d)",
    total_sessions_30d: "Total Sessions (30d)",
    active_users_100d: "Active Users (100d)",
    total_sessions_100d: "Total Sessions (100d)",
    invite_status: "Invite Status",
    invite_sent_date: "Invite Sent Date",
    invite_accepted_date: "Invite Accepted Date",
    last_email_sent_date: "Last Email Sent Date",
    last_email_sent_type: "Last Email Sent Type",
    emails_sent_count: "Emails Sent Count",
    notes: "Notes",
    next_recommended_action: "Next Recommended Action",
  },
  contacts: {
    contact_email: "Contact Email",
    contact_role: "Contact Role",
    contact_name: "Contact Name",
    do_not_contact: "Do Not Contact",
    account_id: "Account ID",
    account_name: "Account Name",
    customer_type: "Customer Type",
    customer_first_name: "Customer First Name",
  },
  signals: {
    contact_email: "Contact Email",
    account_id: "Account ID",
    sent_at: "Sent At",
    template_or_type: "Template or Type",
    channel: "Channel",
    status: "Status",
  },
} as const;

const TEMPLATE_ACCOUNT_SAMPLE_ROWS: Record<string, string>[] = [
  {
    account_id: "ACCT-001",
    account_name: "Acme Corporation",
    plan: "Enterprise",
    journey_stage: "Onboarding",
    segment: "Enterprise Security",
    use_case: "Security Operations",
    primary_icp: "Enterprise Security",
    account_owner: "Sarah Chen",
    owner_dam_name: "Alex Rivera",
    owner_dam_email: "alex.rivera@company.com",
    term_start_date: "2026-01-15",
    activation_start_date: "2026-01-15",
    activation_window_end_date: "2026-04-15",
    renewal_date: "2027-01-15",
    seats_purchased: "50",
    search_seats_assigned: "7",
    graph_browser_seats_assigned: "15",
    graph_desktop_seats_assigned: "20",
    search_active_users: "7",
    graph_browser_active_users: "15",
    graph_desktop_active_users: "16",
    total_active_seats: "38",
    total_sessions: "320",
    onboarding_date: "2026-01-15",
    onboarding_age_days: "154",
    near_threshold: "Yes",
    onboarding_completed: "No",
    active_users_7d: "30",
    total_sessions_7d: "80",
    active_users_15d: "34",
    total_sessions_15d: "150",
    active_users_30d: "36",
    total_sessions_30d: "260",
    active_users_100d: "38",
    total_sessions_100d: "320",
    invite_status: "Accepted",
    invite_sent_date: "2026-01-10",
    invite_accepted_date: "2026-01-12",
    last_email_sent_date: "2026-06-01",
    last_email_sent_type: "Usage Summary",
    emails_sent_count: "8",
    notes: "Strong adoption, ready for expansion conversation.",
    next_recommended_action: "Schedule QBR",
  },
  {
    account_id: "ACCT-002",
    account_name: "BrightPath Analytics",
    plan: "Professional",
    journey_stage: "Onboarding",
    segment: "Mid-Market SaaS",
    use_case: "Threat Intelligence",
    primary_icp: "Mid-Market SaaS",
    account_owner: "James Wilson",
    owner_dam_name: "Morgan Lee",
    owner_dam_email: "morgan.lee@company.com",
    term_start_date: "2026-06-01",
    activation_start_date: "2026-06-01",
    activation_window_end_date: "2026-09-01",
    renewal_date: "2027-06-01",
    seats_purchased: "25",
    search_seats_assigned: "2",
    graph_browser_seats_assigned: "3",
    graph_desktop_seats_assigned: "3",
    search_active_users: "0",
    graph_browser_active_users: "0",
    graph_desktop_active_users: "0",
    total_active_seats: "0",
    total_sessions: "0",
    onboarding_date: "2026-06-01",
    onboarding_age_days: "17",
    near_threshold: "No",
    onboarding_completed: "No",
    active_users_7d: "0",
    total_sessions_7d: "0",
    active_users_15d: "0",
    total_sessions_15d: "0",
    active_users_30d: "0",
    total_sessions_30d: "0",
    active_users_100d: "0",
    total_sessions_100d: "0",
    invite_status: "Pending",
    invite_sent_date: "2026-05-28",
    invite_accepted_date: "",
    last_email_sent_date: "2026-06-01",
    last_email_sent_type: "Welcome",
    emails_sent_count: "2",
    notes: "New account, low engagement so far.",
    next_recommended_action: "Send invite reminder",
  },
];

const TEMPLATE_CONTACT_SAMPLE_ROWS: Record<string, string>[] = [
  {
    contact_email: "admin@acme.com",
    contact_role: "Admin",
    contact_name: "Sarah Chen",
    do_not_contact: "No",
    account_id: "ACCT-001",
    account_name: "Acme Corporation",
    customer_type: "Customer",
    customer_first_name: "Sarah",
  },
  {
    contact_email: "sarah.chen@acme.com",
    contact_role: "User",
    contact_name: "Sarah Chen",
    do_not_contact: "No",
    account_id: "ACCT-001",
    account_name: "Acme Corporation",
    customer_type: "Customer",
    customer_first_name: "Sarah",
  },
  {
    contact_email: "it-admin@brightpath.io",
    contact_role: "Admin",
    contact_name: "James Wilson",
    do_not_contact: "No",
    account_id: "ACCT-002",
    account_name: "BrightPath Analytics",
    customer_type: "Customer",
    customer_first_name: "James",
  },
];

const TEMPLATE_SIGNAL_SAMPLE_ROWS: Record<string, string>[] = [
  {
    contact_email: "it-admin@brightpath.io",
    account_id: "ACCT-002",
    sent_at: "2026-06-01T10:00:00Z",
    template_or_type: "invite-reminder",
    channel: "email",
    status: "Delivered",
  },
];

const LEGACY_ACCOUNT_SAMPLE_ROWS: Record<string, string>[] = [
  {
    customer_id: "CUST-001",
    customer_name: "Acme Corporation",
    plan: "Enterprise",
    stage: "Onboarding",
    segment: "Enterprise Security",
    use_case: "Security Operations",
    icp: "Enterprise Security",
    account_owner: "Sarah Chen",
    owner_dam_name: "Alex Rivera",
    owner_dam_email: "alex.rivera@company.com",
    onboarding_start_date: "2026-01-15",
    term_start_date: "2026-01-15",
    renewal_date: "2027-01-15",
    invite_status: "Accepted",
    invite_sent_date: "2026-01-10",
    invite_accepted_date: "2026-01-12",
    usage_sessions: "320",
    usage_activities: "1450",
    active_users: "38",
    last_usage_date: "2026-06-17",
    usage_threshold: "100",
    usage_threshold_percent: "76",
    seats_total: "50",
    seats_assigned: "42",
    seat_assignment_percent: "84",
    graph_desktop_assigned: "20",
    graph_browser_assigned: "15",
    search_assigned: "7",
    academy_visited: "Yes",
    webinar_attended: "Yes",
    last_email_sent_date: "2026-06-01",
    last_email_sent_type: "Usage Summary",
    emails_sent_count: "8",
    notes: "Strong adoption, ready for expansion conversation.",
    next_recommended_action: "Schedule QBR",
  },
  {
    customer_id: "CUST-002",
    customer_name: "BrightPath Analytics",
    plan: "Professional",
    stage: "Onboarding",
    segment: "Mid-Market SaaS",
    use_case: "Threat Intelligence",
    icp: "Mid-Market SaaS",
    account_owner: "James Wilson",
    owner_dam_name: "Morgan Lee",
    owner_dam_email: "morgan.lee@company.com",
    onboarding_start_date: "2026-06-01",
    term_start_date: "2026-06-01",
    renewal_date: "2027-06-01",
    invite_status: "Pending",
    invite_sent_date: "2026-05-28",
    invite_accepted_date: "",
    usage_sessions: "0",
    usage_activities: "0",
    active_users: "0",
    last_usage_date: "",
    usage_threshold: "50",
    usage_threshold_percent: "0",
    seats_total: "25",
    seats_assigned: "8",
    seat_assignment_percent: "32",
    graph_desktop_assigned: "3",
    graph_browser_assigned: "3",
    search_assigned: "2",
    academy_visited: "No",
    webinar_attended: "No",
    last_email_sent_date: "2026-06-01",
    last_email_sent_type: "Welcome",
    emails_sent_count: "2",
    notes: "New account, low engagement so far.",
    next_recommended_action: "Send invite reminder",
  },
];

const LEGACY_CONTACT_SAMPLE_ROWS: Record<string, string>[] = [
  {
    contact_email: "admin@acme.com",
    contact_role: "Admin",
    contact_name: "Sarah Chen",
    do_not_contact: "No",
    customer_id: "CUST-001",
  },
  {
    contact_email: "sarah.chen@acme.com",
    contact_role: "User",
    contact_name: "Sarah Chen",
    do_not_contact: "No",
    customer_id: "CUST-001",
  },
  {
    contact_email: "it-admin@brightpath.io",
    contact_role: "Admin",
    contact_name: "James Wilson",
    do_not_contact: "No",
    customer_id: "CUST-002",
  },
];

const LEGACY_SIGNAL_SAMPLE_ROWS: Record<string, string>[] = [
  {
    contact_email: "it-admin@brightpath.io",
    customer_id: "CUST-002",
    sent_at: "2026-06-01T10:00:00Z",
    template_or_type: "invite-reminder",
    channel: "email",
    status: "Delivered",
  },
];

function displayRow(
  columns: readonly string[],
  labels: Record<string, string>,
): string[] {
  return columns.map((key) => labels[key] ?? key);
}

export function row2SheetFromRows(
  columns: readonly string[],
  labels: Record<string, string>,
  rows: Record<string, string>[],
): XLSX.WorkSheet {
  const data = [
    displayRow(columns, labels),
    [...columns],
    ...rows.map((row) => columns.map((column) => row[column] ?? "")),
  ];
  return XLSX.utils.aoa_to_sheet(data);
}

function legacySheetFromRows(
  headers: readonly string[],
  rows: Record<string, string>[],
): XLSX.WorkSheet {
  const data = [
    [...headers],
    ...rows.map((row) => headers.map((header) => row[header] ?? "")),
  ];
  return XLSX.utils.aoa_to_sheet(data);
}

function buildFieldGuideSheet(): XLSX.WorkSheet {
  const requiredAccounts = new Set(ROW2_REQUIRED_ACCOUNTS_COLUMNS);
  const requiredContacts = new Set(ROW2_REQUIRED_CONTACTS_COLUMNS);
  const requiredSignals = new Set(ROW2_REQUIRED_SIGNALS_COLUMNS);

  const fieldRows: string[][] = [
    ["Sheet", "Row 1 Label", "Row 2 System Key", "Required", "Notes"],
    [
      "Workbook",
      "—",
      "—",
      "—",
      "Row 1 = human-friendly labels (editable). Row 2 = system keys (do not rename). Row 3+ = data.",
    ],
    [
      "Workbook",
      "—",
      "—",
      "—",
      "contact_email is the source of truth for people. Duplicate contact_email values in Contacts are blockers.",
    ],
    [
      "Workbook",
      "—",
      "—",
      "—",
      "Signals may repeat contact_email. Signals do not create contacts. No emails are sent on import.",
    ],
  ];

  for (const key of ROW2_ACCOUNTS_COLUMNS) {
    fieldRows.push([
      "Accounts",
      ROW2_DISPLAY_LABELS.accounts[key as keyof typeof ROW2_DISPLAY_LABELS.accounts],
      key,
      requiredAccounts.has(key as (typeof ROW2_REQUIRED_ACCOUNTS_COLUMNS)[number])
        ? "Yes"
        : "No",
      key === "account_id"
        ? "Maps internally to customer_id in the app session."
        : "",
    ]);
  }

  for (const key of ROW2_CONTACTS_COLUMNS) {
    fieldRows.push([
      "Contacts",
      ROW2_DISPLAY_LABELS.contacts[key as keyof typeof ROW2_DISPLAY_LABELS.contacts],
      key,
      requiredContacts.has(key as (typeof ROW2_REQUIRED_CONTACTS_COLUMNS)[number])
        ? "Yes"
        : "No",
      key === "account_id"
        ? "Must match an account_id on the Accounts sheet."
        : "",
    ]);
  }

  for (const key of ROW2_SIGNALS_COLUMNS) {
    fieldRows.push([
      "Signals",
      ROW2_DISPLAY_LABELS.signals[key as keyof typeof ROW2_DISPLAY_LABELS.signals],
      key,
      requiredSignals.has(key as (typeof ROW2_REQUIRED_SIGNALS_COLUMNS)[number])
        ? "Yes"
        : "No",
      key === "contact_email"
        ? "Must exist on Contacts sheet. Repeated values are allowed."
        : "",
    ]);
  }

  return XLSX.utils.aoa_to_sheet(fieldRows);
}

const FLAT_ACCOUNT_SAMPLE_BASE: Record<string, string>[] = [
  {
    account_id: "ACCT-001",
    account_name: "Acme Corporation",
    plan: "Enterprise",
    journey_stage: "Onboarding",
    use_case: "Security Operations",
    primary_icp: "Enterprise Security",
    term_start_date: "2026-01-15",
    activation_start_date: "2026-01-15",
    activation_window_end_date: "2026-04-15",
    renewal_date: "2027-01-15",
    seats_purchased: "50",
    search_seats_assigned: "7",
    graph_browser_seats_assigned: "15",
    graph_desktop_seats_assigned: "20",
    search_active_users: "7",
    graph_browser_active_users: "15",
    graph_desktop_active_users: "16",
    total_active_seats: "38",
    total_sessions: "320",
    onboarding_completed: "No",
    onboarding_date: "2026-01-15",
    onboarding_age_days: "154",
    near_threshold: "Yes",
    active_users_7d: "30",
    total_sessions_7d: "80",
    active_users_15d: "34",
    total_sessions_15d: "150",
    active_users_30d: "36",
    total_sessions_30d: "260",
    active_users_100d: "38",
    total_sessions_100d: "320",
    invite_status: "Accepted",
    invite_sent_date: "2026-01-10",
    invite_accepted_date: "2026-01-12",
    notes: "Strong adoption, ready for expansion conversation.",
  },
  {
    account_id: "ACCT-002",
    account_name: "BrightPath Analytics",
    plan: "Professional",
    journey_stage: "Onboarding",
    use_case: "Threat Intelligence",
    primary_icp: "Mid-Market SaaS",
    term_start_date: "2026-06-01",
    activation_start_date: "2026-06-01",
    activation_window_end_date: "2026-09-01",
    renewal_date: "2027-06-01",
    seats_purchased: "25",
    search_seats_assigned: "2",
    graph_browser_seats_assigned: "3",
    graph_desktop_seats_assigned: "3",
    search_active_users: "0",
    graph_browser_active_users: "0",
    graph_desktop_active_users: "0",
    total_active_seats: "0",
    total_sessions: "0",
    onboarding_completed: "No",
    onboarding_date: "2026-06-01",
    onboarding_age_days: "17",
    near_threshold: "No",
    active_users_7d: "0",
    total_sessions_7d: "0",
    active_users_15d: "0",
    total_sessions_15d: "0",
    active_users_30d: "0",
    total_sessions_30d: "0",
    active_users_100d: "0",
    total_sessions_100d: "0",
    invite_status: "Pending",
    invite_sent_date: "2026-05-28",
    invite_accepted_date: "",
    notes: "New account, low engagement so far.",
  },
];

function buildFlatTemplateSampleRows(): Record<string, string>[] {
  const acct1 = FLAT_ACCOUNT_SAMPLE_BASE[0]!;
  const acct2 = FLAT_ACCOUNT_SAMPLE_BASE[1]!;

  const rows: Record<string, string>[] = [
    {
      ...acct1,
      contact_email: "admin@acme.com",
      contact_name: "Sarah Chen",
      contact_role: "Admin",
      do_not_contact: "No",
    },
    {
      ...acct1,
      contact_email: "sarah.chen@acme.com",
      contact_name: "Sarah Chen",
      contact_role: "User",
      do_not_contact: "No",
    },
    {
      ...acct1,
      contact_email: "alex.rivera@company.com",
      contact_name: "Alex Rivera",
      contact_role: "CSM",
      do_not_contact: "No",
    },
    {
      ...acct1,
      contact_email: "finance@acme.com",
      contact_name: "Finance Admin",
      contact_role: "Admin",
      do_not_contact: "No",
    },
    {
      ...acct2,
      contact_email: "it-admin@brightpath.io",
      contact_name: "James Wilson",
      contact_role: "Admin",
      do_not_contact: "No",
    },
    {
      ...acct2,
      contact_email: "user@brightpath.io",
      contact_name: "Jamie Lee",
      contact_role: "User",
      do_not_contact: "Yes",
    },
    {
      ...acct2,
      contact_email: "morgan.lee@company.com",
      contact_name: "Morgan Lee",
      contact_role: "CSM",
      do_not_contact: "No",
    },
  ];

  return rows;
}

function buildFlatFieldGuideSheet(): XLSX.WorkSheet {
  const fieldRows: string[][] = [
    ["Sheet", "Row 1 Label", "Row 2 System Key", "Required", "Notes"],
    [
      "Workbook",
      "—",
      "—",
      "—",
      "Journey Import is the main import sheet. Row 1 = readable labels (editable). Row 2 = system keys (do not rename). Row 3+ = data.",
    ],
    [
      "Workbook",
      "—",
      "—",
      "—",
      "One row = one account + one contact/user. account_id may repeat. contact_email must be globally unique.",
    ],
    [
      "Workbook",
      "—",
      "—",
      "—",
      "CSM contact row recommended for internal routing. Admin contact row recommended for customer-facing journeys.",
    ],
    [
      "Workbook",
      "—",
      "—",
      "—",
      "Prior send history is not imported. No emails are sent during import. Communication Logs are not created during import.",
    ],
  ];

  for (const key of FLAT_ROW2_COLUMNS) {
    fieldRows.push([
      FLAT_JOURNEY_IMPORT_SHEET_NAME,
      FLAT_ROW2_DISPLAY_LABELS[key],
      key,
      "Yes",
      key === "account_id"
        ? "Maps internally to customer_id in the app session."
        : key === "use_case"
          ? "Singular use_case field (not use_cases)."
          : key === "contact_email"
            ? "Globally unique across all rows."
            : "",
    ]);
  }

  return XLSX.utils.aoa_to_sheet(fieldRows);
}

/** Phase L-4D — user-facing flat Row 2 workbook (Journey Import + Field Guide). */
export function buildFlatImportWorkbook(): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    row2SheetFromRows(
      FLAT_ROW2_COLUMNS,
      FLAT_ROW2_DISPLAY_LABELS,
      buildFlatTemplateSampleRows(),
    ),
    FLAT_JOURNEY_IMPORT_SHEET_NAME,
  );
  XLSX.utils.book_append_sheet(workbook, buildFlatFieldGuideSheet(), "Field Guide");

  return workbook;
}

/** Phase L-2B — internal Row 2 multi-sheet workbook (Accounts + Contacts + Signals + Field Guide). */
export function buildTargetMultisheetWorkbook(): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    row2SheetFromRows(
      TARGET_ACCOUNTS_COLUMNS,
      ROW2_DISPLAY_LABELS.accounts,
      TEMPLATE_ACCOUNT_SAMPLE_ROWS,
    ),
    "Accounts",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    row2SheetFromRows(
      TARGET_CONTACTS_COLUMNS,
      ROW2_DISPLAY_LABELS.contacts,
      TEMPLATE_CONTACT_SAMPLE_ROWS,
    ),
    "Contacts",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    row2SheetFromRows(
      TARGET_SIGNALS_COLUMNS,
      ROW2_DISPLAY_LABELS.signals,
      TEMPLATE_SIGNAL_SAMPLE_ROWS,
    ),
    "Signals",
  );
  XLSX.utils.book_append_sheet(workbook, buildFieldGuideSheet(), "Field Guide");

  return workbook;
}

/** Legacy L-1 single-row header workbook — internal fallback tests only. */
export function buildLegacyMultisheetWorkbook(): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    legacySheetFromRows(LEGACY_ACCOUNTS_COLUMNS, LEGACY_ACCOUNT_SAMPLE_ROWS),
    "Accounts",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    legacySheetFromRows(LEGACY_CONTACTS_COLUMNS, LEGACY_CONTACT_SAMPLE_ROWS),
    "Contacts",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    legacySheetFromRows(LEGACY_SIGNALS_COLUMNS, LEGACY_SIGNAL_SAMPLE_ROWS),
    "Signals",
  );

  return workbook;
}

function downloadBinaryFile(
  filename: string,
  bytes: ArrayBuffer,
  mimeType: string,
): void {
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export const EXCEL_IMPORT_TEMPLATE_FILENAME = "excel-import-template.xlsx";

/** Phase L-4D — single Customer Data import template (flat Journey Import Row 2). */
export function downloadExcelImportTemplate(): void {
  const workbook = buildFlatImportWorkbook();
  const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  downloadBinaryFile(
    EXCEL_IMPORT_TEMPLATE_FILENAME,
    bytes,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
}

/** @deprecated Legacy CSV — not exposed in UI (Phase L-1B.1). Kept for internal/tests. */
export function downloadCurrentUploadTemplate(): void {
  downloadTextFile(
    "current-upload-template.csv",
    buildSampleCsv(),
    "text/csv;charset=utf-8",
  );
}

/** @deprecated Use downloadExcelImportTemplate. */
export function downloadTargetMultisheetTemplate(): void {
  downloadExcelImportTemplate();
}
