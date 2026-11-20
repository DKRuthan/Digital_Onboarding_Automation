/**
 * Phase L-2F — stable verification checkpoint for Row 2 Excel Import.
 * Run: npx tsx scripts/verify-l-2f-stable.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";

import {
  EXCEL_IMPORT_AUDIT_COUNT_KEYS,
  buildExcelImportAuditMetadata,
} from "../lib/audit/excel-import-audit";
import { getUiAuditPermission } from "../lib/audit/ui-audit-events";
import {
  buildContactsForDisplay,
  displayContactToImportedExport,
} from "../lib/customer-contacts";
import { computeDashboardContactMetrics } from "../lib/dashboard-contact-metrics";
import {
  buildImportedContactsFromNormalized,
  replaceImportedContacts,
} from "../lib/imported-contacts";
import { validateNormalizedMultisheetImport } from "../lib/import-multisheet-cross-validation";
import {
  MultisheetParserError,
  parseTargetMultisheetWorkbook,
} from "../lib/import-multisheet-parser";
import type { NormalizedImport } from "../lib/import-multisheet-parser";
import {
  ROW2_ACCOUNTS_COLUMNS,
  ROW2_CONTACTS_COLUMNS,
  ROW2_SIGNALS_COLUMNS,
} from "../lib/import-row2-schema";
import {
  EXCEL_IMPORT_TEMPLATE_FILENAME,
  TARGET_ACCOUNTS_COLUMNS,
  buildFlatImportWorkbook,
  buildTargetMultisheetWorkbook,
  row2SheetFromRows,
  ROW2_DISPLAY_LABELS,
} from "../lib/import-templates";
import { validateTargetMultisheetWorkbook } from "../lib/import-multisheet-validation";
import { buildReportsSnapshot } from "../lib/reports-snapshot";
import { buildImportedContactsExportCsv } from "../lib/session-export";
import { customers as demoCustomers, sendLogs as demoSendLogs } from "../lib/mock-data";

const ROOT = join(import.meta.dirname ?? __dirname, "..");

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

function readRepo(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function hasCode(issues: { code: string }[], code: string): boolean {
  return issues.some((issue) => issue.code === code);
}

function sheetMatrix(sheet: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
  });
}

function buildRow2DupEmailWorkbook(): XLSX.WorkBook {
  const accounts = [
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
      next_recommended_action: "",
    },
  ];

  const contacts = [
    {
      contact_email: "Admin@Acme.com",
      contact_role: "Admin",
      contact_name: "Admin One",
      do_not_contact: "No",
      account_id: "ACCT-001",
      account_name: "Acme Corporation",
      customer_type: "Customer",
      customer_first_name: "Admin",
    },
    {
      contact_email: "  admin@acme.com ",
      contact_role: "User",
      contact_name: "Admin Two",
      do_not_contact: "No",
      account_id: "ACCT-001",
      account_name: "Acme Corporation",
      customer_type: "Customer",
      customer_first_name: "Admin",
    },
  ];

  const signals = [
    {
      contact_email: "admin@acme.com",
      account_id: "ACCT-001",
      sent_at: "2026-06-01T10:00:00Z",
      template_or_type: "welcome",
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
      accounts,
    ),
    "Accounts",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    row2SheetFromRows(
      ROW2_CONTACTS_COLUMNS,
      ROW2_DISPLAY_LABELS.contacts,
      contacts,
    ),
    "Contacts",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    row2SheetFromRows(
      ROW2_SIGNALS_COLUMNS,
      ROW2_DISPLAY_LABELS.signals,
      signals,
    ),
    "Signals",
  );
  return workbook;
}

function buildMixedLayoutWorkbook(): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    row2SheetFromRows(
      ROW2_ACCOUNTS_COLUMNS,
      ROW2_DISPLAY_LABELS.accounts,
      [{ account_id: "ACCT-001", account_name: "Acme" }],
    ),
    "Accounts",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["contact_email", "contact_role", "customer_id"],
      ["admin@acme.com", "Admin", "CUST-001"],
    ]),
    "Contacts",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    row2SheetFromRows(
      ROW2_SIGNALS_COLUMNS,
      ROW2_DISPLAY_LABELS.signals,
      [
        {
          contact_email: "admin@acme.com",
          account_id: "ACCT-001",
          sent_at: "2026-06-01",
          template_or_type: "welcome",
          channel: "email",
          status: "Delivered",
        },
      ],
    ),
    "Signals",
  );
  return workbook;
}

function main(): void {
  console.log("L-2F stable verification (Row 2 Excel Import)\n");

  console.log("1. Download template structure (public flat template)...");
  const flatWorkbook = buildFlatImportWorkbook();
  const flatSheetNames = flatWorkbook.SheetNames;
  assert(
    EXCEL_IMPORT_TEMPLATE_FILENAME === "excel-import-template.xlsx",
    "filename must be excel-import-template.xlsx",
  );
  assert(
    flatSheetNames.includes("Journey Import"),
    "public template must include Journey Import sheet",
  );
  assert(flatSheetNames.includes("Field Guide"), "Field Guide sheet required");
  assert(!flatSheetNames.includes("Signals"), "public template must not expose Signals sheet");

  const journeyMatrix = sheetMatrix(flatWorkbook.Sheets["Journey Import"]!);
  assert(
    String(journeyMatrix[0]?.[0] ?? "").includes("Account"),
    "Row 1 must contain readable labels",
  );
  assert(journeyMatrix[1]?.[0] === "account_id", "Row 2 must contain system keys");
  assert(journeyMatrix[2]?.[0] === "ACCT-001", "Row 3 must start sample data");
  console.log("  OK: public flat template (Journey Import + Field Guide)");

  console.log("1b. Internal L-2 multi-sheet template (fallback)...");
  const workbook = buildTargetMultisheetWorkbook();
  const sheetNames = workbook.SheetNames;
  assert(sheetNames.includes("Accounts"), "L-2 internal template requires Accounts sheet");
  assert(sheetNames.includes("Contacts"), "L-2 internal template requires Contacts sheet");
  assert(sheetNames.includes("Signals"), "L-2 internal template requires Signals sheet");
  assert(
    TARGET_ACCOUNTS_COLUMNS[0] === "account_id",
    "TARGET_ACCOUNTS_COLUMNS must use account_id",
  );

  const accountsMatrix = sheetMatrix(workbook.Sheets.Accounts!);
  assert(
    String(accountsMatrix[0]?.[0] ?? "").includes("Account"),
    "Row 1 must contain readable labels",
  );
  assert(accountsMatrix[1]?.[0] === "account_id", "Row 2 must contain system keys");
  assert(accountsMatrix[2]?.[0] === "ACCT-001", "Row 3 must start sample data");

  const contactsMatrix = sheetMatrix(workbook.Sheets.Contacts!);
  const contactsRow2 = (contactsMatrix[1] as string[]) ?? [];
  for (const key of ["contact_email", "contact_role", "account_id"] as const) {
    assert(contactsRow2.includes(key), `Contacts Row 2 must include ${key}`);
  }

  const signalsMatrix = sheetMatrix(workbook.Sheets.Signals!);
  const signalsRow2 = (signalsMatrix[1] as string[]) ?? [];
  for (const key of ROW2_SIGNALS_COLUMNS) {
    assert(signalsRow2.includes(key), `Signals Row 2 must include ${key}`);
  }
  console.log("  OK: Row 1 labels + Row 2 keys + Row 3 data + Field Guide");

  console.log("2. Parser ignores Field Guide and Row 1 labels...");
  const parsed = parseTargetMultisheetWorkbook(workbook);
  assert(parsed.headerMode === "row2", "template must parse as row2");
  assert(
    parsed.accounts.length === 2,
    `expected 2 account rows, got ${parsed.accounts.length}`,
  );
  assert(
    parsed.contacts.length === 3,
    `expected 3 contact rows, got ${parsed.contacts.length}`,
  );
  assert(
    parsed.signals.length === 1,
    `expected 1 signal row, got ${parsed.signals.length}`,
  );
  assert(
    workbook.SheetNames.includes("Field Guide") &&
      parsed.accounts.length === 2,
    "Field Guide in workbook but not parsed as extra account rows",
  );
  assert(
    parsed.accounts[0]?.customer_name === "Acme Corporation",
    "Row 1 labels must not be used as data",
  );
  for (const key of ROW2_ACCOUNTS_COLUMNS) {
    assert(
      parsed.sheetHeaders.accounts.includes(key),
      `parser must read Row 2 key ${key}`,
    );
  }
  console.log("  OK: Field Guide ignored; Row 2 keys used; data from Row 3");

  console.log("3. account_id and field mappings...");
  const acmeAccount = parsed.accounts.find((a) => a.customer_id === "ACCT-001");
  assert(Boolean(acmeAccount), "ACCT-001 account must exist");
  assert(acmeAccount!.customer_name === "Acme Corporation", "account_name mapping");
  assert(acmeAccount!.stage === "Onboarding", "journey_stage -> stage");
  assert(acmeAccount!.icp === "Enterprise Security", "primary_icp -> icp");
  assert(acmeAccount!.seats_total === "50", "seats_purchased -> seats_total");
  assert(acmeAccount!.usage_sessions === "320", "total_sessions -> usage_sessions");
  assert(acmeAccount!.active_users === "38", "total_active_seats -> active_users");

  const accountIds = new Set(parsed.accounts.map((a) => a.customer_id));
  for (const contact of parsed.contacts) {
    assert(
      accountIds.has(contact.customer_id),
      `contact account_id ${contact.customer_id} must reference Accounts`,
    );
  }
  for (const signal of parsed.signals) {
    assert(
      Boolean(signal.customer_id && accountIds.has(signal.customer_id)),
      `signal account_id ${signal.customer_id} must reference Accounts`,
    );
  }
  console.log("  OK: account_id mappings and cross-sheet references");

  console.log("4. Validate / apply payload...");
  const valid = validateTargetMultisheetWorkbook(workbook);
  assert(valid.passed === true, "template must pass validation");
  assert(valid.customers.length === 2, "expected 2 customers");
  assert(
    valid.importedContacts?.length === 3,
    `expected 3 importedContacts, got ${valid.importedContacts?.length}`,
  );
  assert(
    valid.importedContacts?.length === valid.importSummary?.contactsCount,
    "importedContacts count must match Contacts sheet",
  );
  const imported = buildImportedContactsFromNormalized(parsed);
  assert(
    imported.length === parsed.contacts.length,
    "Signals must not create contacts",
  );
  console.log(
    `  OK: passed=${valid.passed}, customers=${valid.customers.length}, contacts=${valid.importedContacts?.length}`,
  );

  console.log("5. Re-upload replace semantics...");
  const contacts1 = valid.importedContacts ?? [];
  const contacts2 = buildImportedContactsFromNormalized(
    parseTargetMultisheetWorkbook(workbook),
  );
  const replaced = replaceImportedContacts(contacts1, contacts2);
  assert(replaced.length === contacts1.length, "re-upload must not double contacts");
  console.log("  OK: re-upload replace semantics");

  console.log("6. Modified Row 2 workbook replaces contacts...");
  const modifiedWorkbook = buildTargetMultisheetWorkbook();
  const modifiedContactsSheet = modifiedWorkbook.Sheets.Contacts!;
  const modifiedMatrix = sheetMatrix(modifiedContactsSheet);
  modifiedMatrix.splice(2);
  modifiedMatrix.push([
    "admin@acme.com",
    "Admin",
    "Sarah Chen",
    "No",
    "ACCT-001",
    "Acme Corporation",
    "Customer",
    "Sarah",
  ]);
  modifiedMatrix.push([
    "newperson@acme.com",
    "User",
    "New Person",
    "Yes",
    "ACCT-001",
    "Acme Corporation",
    "Customer",
    "New",
  ]);
  modifiedWorkbook.Sheets.Contacts = XLSX.utils.aoa_to_sheet(
    modifiedMatrix as string[][],
  );
  const modifiedParsed = parseTargetMultisheetWorkbook(modifiedWorkbook);
  const modifiedContacts = buildImportedContactsFromNormalized(modifiedParsed);
  const afterReplace = replaceImportedContacts(contacts1, modifiedContacts);
  assert(afterReplace.length === 2, "modified workbook has 2 contacts");
  assert(
    !afterReplace.some((c) => c.contact_email === "sarah.chen@acme.com"),
    "removed contact must not remain",
  );
  assert(
    afterReplace.some((c) => c.contact_email === "newperson@acme.com"),
    "new contact must appear",
  );
  console.log("  OK: modified Row 2 workbook replaces session contacts");

  console.log("7. Row 2 header blockers...");
  const missingHeaderWorkbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    missingHeaderWorkbook,
    XLSX.utils.aoa_to_sheet([
      ["Account ID", "Account Name"],
      ["", ""],
      ["ACCT-001", "Acme"],
    ]),
    "Accounts",
  );
  XLSX.utils.book_append_sheet(
    missingHeaderWorkbook,
    row2SheetFromRows(
      ROW2_CONTACTS_COLUMNS,
      ROW2_DISPLAY_LABELS.contacts,
      [
        {
          contact_email: "admin@acme.com",
          contact_role: "Admin",
          account_id: "ACCT-001",
        },
      ],
    ),
    "Contacts",
  );
  XLSX.utils.book_append_sheet(
    missingHeaderWorkbook,
    row2SheetFromRows(
      ROW2_SIGNALS_COLUMNS,
      ROW2_DISPLAY_LABELS.signals,
      [],
    ),
    "Signals",
  );
  let mixedOrMissingError = false;
  try {
    parseTargetMultisheetWorkbook(missingHeaderWorkbook);
  } catch {
    mixedOrMissingError = true;
  }
  if (!mixedOrMissingError) {
    const missingParsed = parseTargetMultisheetWorkbook(missingHeaderWorkbook);
    const missingValidation = validateNormalizedMultisheetImport(missingParsed);
    assert(missingValidation.passed === false, "missing Row 2 must block");
    assert(
      hasCode(missingValidation.blockers, "SHEET_MISSING_REQUIRED_COLUMN") ||
        hasCode(missingValidation.blockers, "SHEET_MISSING_ROW2_HEADER"),
      "missing Row 2 header blocker expected",
    );
  }
  console.log("  OK: missing Row 2 header blocked");

  const dupKeyWorkbook = buildTargetMultisheetWorkbook();
  const dupAccountsSheet = dupKeyWorkbook.Sheets.Accounts!;
  const dupMatrix = sheetMatrix(dupAccountsSheet);
  (dupMatrix[1] as string[])[1] = "account_id";
  dupKeyWorkbook.Sheets.Accounts = XLSX.utils.aoa_to_sheet(dupMatrix as string[][]);
  const dupKeyParsed = parseTargetMultisheetWorkbook(dupKeyWorkbook);
  const dupKeyValidation = validateNormalizedMultisheetImport(dupKeyParsed);
  assert(dupKeyValidation.passed === false, "duplicate Row 2 key must block");
  assert(
    hasCode(dupKeyValidation.blockers, "SHEET_DUPLICATE_HEADER_KEY"),
    "duplicate Row 2 key blocker expected",
  );
  console.log("  OK: duplicate Row 2 key blocked");

  const missingKeyWorkbook = buildTargetMultisheetWorkbook();
  const mkMatrix = sheetMatrix(missingKeyWorkbook.Sheets.Accounts!);
  const mkHeaders = (mkMatrix[1] as string[]).filter((k) => k !== "account_name");
  const mkData = mkMatrix.slice(2).map((row) => {
    const cells = row as string[];
    return [cells[0], ...cells.slice(2)];
  });
  missingKeyWorkbook.Sheets.Accounts = XLSX.utils.aoa_to_sheet([
    mkMatrix[0],
    mkHeaders,
    ...mkData,
  ] as string[][]);
  const missingKeyParsed = parseTargetMultisheetWorkbook(missingKeyWorkbook);
  const missingKeyValidation = validateNormalizedMultisheetImport(missingKeyParsed);
  assert(missingKeyValidation.passed === false, "missing required Row 2 key must block");
  assert(
    hasCode(missingKeyValidation.blockers, "SHEET_MISSING_REQUIRED_COLUMN"),
    "missing required Row 2 key blocker expected",
  );
  console.log("  OK: missing required Row 2 key blocked");

  let mixedRejected = false;
  try {
    parseTargetMultisheetWorkbook(buildMixedLayoutWorkbook());
  } catch (error) {
    mixedRejected = error instanceof MultisheetParserError;
  }
  assert(mixedRejected, "mixed header layout must be rejected");
  console.log("  OK: mixed layout rejected");

  console.log("8. Duplicate contact_email blocker...");
  const dupEmailResult = validateTargetMultisheetWorkbook(buildRow2DupEmailWorkbook());
  assert(dupEmailResult.passed === false, "duplicate email must block apply");
  assert(
    hasCode(dupEmailResult.importIssues ?? [], "CONTACT_DUPLICATE_EMAIL"),
    "CONTACT_DUPLICATE_EMAIL blocker expected",
  );
  console.log("  OK: duplicate normalized contact_email blocked");

  console.log("9. Missing Signals sheet...");
  const noSignals = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    noSignals,
    row2SheetFromRows(
      ROW2_ACCOUNTS_COLUMNS,
      ROW2_DISPLAY_LABELS.accounts,
      [{ account_id: "ACCT-001", account_name: "Acme" }],
    ),
    "Accounts",
  );
  XLSX.utils.book_append_sheet(
    noSignals,
    row2SheetFromRows(
      ROW2_CONTACTS_COLUMNS,
      ROW2_DISPLAY_LABELS.contacts,
      [
        {
          contact_email: "admin@acme.com",
          contact_role: "Admin",
          account_id: "ACCT-001",
        },
      ],
    ),
    "Contacts",
  );
  let signalsMissing = false;
  try {
    parseTargetMultisheetWorkbook(noSignals);
  } catch (error) {
    signalsMissing = error instanceof MultisheetParserError;
  }
  assert(signalsMissing, "missing Signals sheet must fail parse");
  console.log("  OK: missing Signals sheet rejected");

  console.log("10. Orphan Signals blockers...");
  const orphanImport: NormalizedImport = {
    format: "option_c",
    headerMode: "row2",
    sheetNames: ["Accounts", "Contacts", "Signals"],
    accounts: parsed.accounts.slice(0, 1),
    contacts: parsed.contacts.filter((c) => c.customer_id === "ACCT-001").slice(0, 1),
    signals: [
      {
        contact_email: "missing@acme.com",
        customer_id: "ACCT-001",
        sent_at: "2026-06-01T10:00:00Z",
        template_or_type: "welcome",
        channel: "email",
        status: "Delivered",
      },
      {
        contact_email: "admin@acme.com",
        customer_id: "ACCT-999",
        sent_at: "2026-06-01T10:00:00Z",
        template_or_type: "welcome",
        channel: "email",
        status: "Delivered",
      },
    ],
    sheetHeaders: {
      accounts: [...ROW2_ACCOUNTS_COLUMNS],
      contacts: [...ROW2_CONTACTS_COLUMNS],
      signals: [...ROW2_SIGNALS_COLUMNS],
    },
  };
  const orphanValidation = validateNormalizedMultisheetImport(orphanImport);
  assert(orphanValidation.passed === false, "orphan signals must block");
  assert(
    hasCode(orphanValidation.blockers, "SIGNAL_UNKNOWN_CONTACT_EMAIL"),
    "orphan contact_email blocker",
  );
  assert(
    hasCode(orphanValidation.blockers, "SIGNAL_UNKNOWN_CUSTOMER_ID"),
    "orphan account_id blocker",
  );
  assert(
    buildImportedContactsFromNormalized(orphanImport).length ===
      orphanImport.contacts.length,
    "signals must not create contacts",
  );
  console.log("  OK: orphan Signals blocked; no contact/log creation");

  console.log("11. Unsupported contact_role warning...");
  const roleWorkbook = buildTargetMultisheetWorkbook();
  const roleMatrix = sheetMatrix(roleWorkbook.Sheets.Contacts!);
  roleMatrix[2] = [
    "admin@acme.com",
    "Champion",
    "Sarah Chen",
    "No",
    "ACCT-001",
    "Acme Corporation",
    "Customer",
    "Sarah",
  ];
  roleWorkbook.Sheets.Contacts = XLSX.utils.aoa_to_sheet(roleMatrix as string[][]);
  const roleResult = validateTargetMultisheetWorkbook(roleWorkbook);
  assert(roleResult.passed === true, "unsupported role should not block");
  assert(
    (roleResult.importIssues ?? []).some((i) => i.code === "CONTACT_UNSUPPORTED_ROLE"),
    "unsupported role warning expected",
  );
  const roleDisplay = buildContactsForDisplay({
    customers: roleResult.customers,
    importedContacts: roleResult.importedContacts ?? [],
    dataSource: "upload",
  });
  assert(
    roleDisplay.contacts.some((c) => c.contact_role === "Champion"),
    "unsupported role preserved in display",
  );
  console.log("  OK: unsupported role warning only");

  console.log("12. Contacts display and export...");
  const uploadDisplay = buildContactsForDisplay({
    customers: valid.customers,
    importedContacts: valid.importedContacts ?? [],
    dataSource: "upload",
  });
  assert(uploadDisplay.source === "imported", "upload mode uses imported source");
  assert(
    uploadDisplay.contacts.every((c) => c.contact_name !== undefined),
    "contact_name available in display",
  );
  assert(
    uploadDisplay.contacts.every((c) => typeof c.do_not_contact === "boolean"),
    "do_not_contact available in display",
  );
  const emailSet = new Set(uploadDisplay.contacts.map((c) => c.contact_email));
  assert(
    emailSet.size === uploadDisplay.contacts.length,
    "one row per unique contact_email",
  );
  const demoDisplay = buildContactsForDisplay({
    customers: demoCustomers,
    importedContacts: [],
    dataSource: "demo",
  });
  assert(demoDisplay.source === "derived", "demo mode uses derived contacts");

  const contactsTable = readRepo("components/customers/contacts-table.tsx");
  assert(contactsTable.includes("derived contacts"), "demo copy mentions derived contacts");
  assert(contactsTable.includes("exportImportedContactsCsv"), "upload export wired");

  const exportRow = displayContactToImportedExport(uploadDisplay.contacts[0]!);
  const csv = buildImportedContactsExportCsv([exportRow]);
  for (const field of [
    "contact_email",
    "contact_name",
    "contact_role",
    "do_not_contact",
    "customer_id",
    "customer_name",
    "source",
  ]) {
    assert(csv.includes(field), `export CSV header must include ${field}`);
  }
  assert(!csv.includes("<html"), "export must not include template HTML");
  console.log("  OK: Contacts tab sources and safe export");

  console.log("13. Reports and dashboard...");
  const snapshot = buildReportsSnapshot({
    customers: valid.customers,
    importedContacts: valid.importedContacts,
    dataSource: "upload",
    actionQueue: [],
    sendLogs: demoSendLogs,
    emailSequences: [],
    enrollments: [],
    rules: [],
    lastValidation: valid,
  });
  assert(
    snapshot.contactJourney.totalContacts === (valid.importedContacts?.length ?? 0),
    "reports contact count uses importedContacts",
  );
  assert(
    snapshot.executiveOverview.totalContacts === (valid.importedContacts?.length ?? 0),
    "executive overview uses importedContacts",
  );
  assert(
    snapshot.dataGaps.some((g) => g.includes("importedContacts")),
    "data gap copy references importedContacts",
  );
  const metrics = computeDashboardContactMetrics({
    customers: valid.customers,
    importedContacts: valid.importedContacts,
    dataSource: "upload",
    enrollments: [],
    sendLogs: demoSendLogs,
    actionQueue: [],
  });
  assert(
    metrics.contact.totalContacts === (valid.importedContacts?.length ?? 0),
    "dashboard metrics use importedContacts",
  );
  console.log("  OK: reports and dashboard stable after Row 2 upload");

  console.log("14. Customer Data UI copy...");
  const uploadPanel = readRepo("components/customers/data-upload-panel.tsx");
  const requiredCopy = [
    "Upload one Excel workbook with a Journey Import sheet",
    "Row 1 is for readable labels",
    "Row 2 contains system keys",
    "Row 3 onward contains data",
    "Account ID can repeat for multiple contacts",
    "contact email must be unique",
    "Re-uploading replaces the current session data",
    "No emails are sent during import",
    "Refresh Action Queue remains",
    "Download Excel Import Template",
    "Upload Excel Workbook",
    "Validate Data",
    "Use Demo Data",
    "Flat Row 2 workbook",
    "Row 2 Excel workbook",
  ];
  for (const phrase of requiredCopy) {
    assert(uploadPanel.includes(phrase), `upload panel must include: ${phrase}`);
  }
  const forbidden = [
    "Download Current Upload Template",
    "Download Target Multi-Sheet Template",
    "Option A",
    "Option C",
    "first sheet only",
    "single header row",
  ];
  for (const phrase of forbidden) {
    assert(!uploadPanel.includes(phrase), `upload panel must not include: ${phrase}`);
  }
  console.log("  OK: Customer Data UI copy aligned with L-4D flat template");

  console.log("15. Audit metadata...");
  assert(
    getUiAuditPermission("data.excel_import.validate") === "upload_customer_data",
    "validate permission",
  );
  assert(
    getUiAuditPermission("data.excel_import.apply") === "upload_customer_data",
    "apply permission",
  );
  const meta = buildExcelImportAuditMetadata(valid);
  assert(
    Object.keys(meta).length === EXCEL_IMPORT_AUDIT_COUNT_KEYS.length,
    "counts-only metadata keys",
  );
  for (const value of Object.values(meta)) {
    assert(typeof value === "number", "audit metadata values must be numbers only");
  }
  assert(uploadPanel.includes("data.excel_import.validate"), "validate audit action");
  assert(uploadPanel.includes("data.excel_import.apply"), "apply audit action");
  assert(
    uploadPanel.includes("buildExcelImportAuditMetadata"),
    "counts-only audit metadata helper",
  );
  console.log("  OK: excel import audit counts-only");

  console.log("16. Safety and K-1 ledger unchanged...");
  assert(!uploadPanel.includes("/api/send-customer-email"), "no customer send route");
  try {
    readRepo("app/api/send-customer-email/route.ts");
    assert(false, "send-customer-email route must not exist");
  } catch {
    // expected
  }
  const importPaths = [
    "lib/import-multisheet-validation.ts",
    "lib/imported-contacts.ts",
    "lib/import-multisheet-parser.ts",
    "components/customers/data-upload-panel.tsx",
  ];
  for (const file of importPaths) {
    const src = readRepo(file);
    assert(!src.includes("@sendgrid/mail"), `${file} must not call SendGrid`);
    assert(
      !src.includes("buildSimulatedCommunicationLog"),
      `${file} must not create Communication Logs from import`,
    );
  }
  const simLogSource = readRepo("lib/communication-logs/simulated-log.ts");
  assert(
    simLogSource.includes("buildSimulatedCommunicationLog"),
    "K-1 simulated log helper still present",
  );
  console.log("  OK: no sends/logs from import; K-1 ledger unchanged");

  console.log("17. Documentation alignment...");
  const docs = [
    "docs/context/phase-l-2-row2-header-import.md",
    "docs/context/phase-l-4-flat-single-sheet-import.md",
    "docs/context/phase-l-single-excel-import.md",
    "docs/context/product.md",
    "README.md",
  ];
  for (const doc of docs) {
    const content = readRepo(doc);
    assert(
      content.includes("L-2A") ||
        content.includes("L-2F") ||
        content.includes("L-4D") ||
        content.includes("L-4"),
      `${doc} must mention L-2A/L-2F or L-4 flat import`,
    );
    assert(
      content.includes("L-2B") ||
        content.includes("L-2F") ||
        content.includes("L-2A–L-2F"),
      `${doc} must mention L-2B or L-2F stable verification`,
    );
    assert(
      content.includes("Row 2") || content.includes("row2") || content.includes("Row 1"),
      `${doc} must describe Row 2 import`,
    );
  }
  console.log("  OK: documentation references L-2 Row 2 import");

  console.log("\nL-2F stable verification script passed.");
}

main();
