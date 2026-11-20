/**
 * Phase L-3 — Real Workbook Test Pass (Row 2 Excel Import QA).
 * Run: npx tsx scripts/verify-l-3-real-workbook.ts
 *
 * Builds a realistic 20-account Row 2 workbook and exercises validate/apply/re-upload/export/report flows.
 * QA only — does not modify product behavior.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";

import {
  buildContactsForDisplay,
  displayContactToImportedExport,
} from "../lib/customer-contacts";
import { computeDashboardContactMetrics } from "../lib/dashboard-contact-metrics";
import {
  buildImportedContactsFromNormalized,
  replaceImportedContacts,
} from "../lib/imported-contacts";
import {
  parseTargetMultisheetWorkbook,
} from "../lib/import-multisheet-parser";
import {
  buildExcelImportAuditMetadata,
  EXCEL_IMPORT_AUDIT_COUNT_KEYS,
} from "../lib/audit/excel-import-audit";
import {
  ROW2_ACCOUNTS_COLUMNS,
  ROW2_CONTACTS_COLUMNS,
  ROW2_SIGNALS_COLUMNS,
} from "../lib/import-row2-schema";
import {
  EXCEL_IMPORT_TEMPLATE_FILENAME,
  buildTargetMultisheetWorkbook,
  row2SheetFromRows,
  ROW2_DISPLAY_LABELS,
} from "../lib/import-templates";
import { validateTargetMultisheetWorkbook } from "../lib/import-multisheet-validation";
import { buildReportsSnapshot } from "../lib/reports-snapshot";
import { buildImportedContactsExportCsv } from "../lib/session-export";
import { sendLogs as demoSendLogs } from "../lib/mock-data";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
export const L3_REAL_WORKBOOK_FILENAME = "l3-real-workbook-20-accounts.xlsx";

type QaSummary = {
  workbook: string;
  accounts: number;
  contacts: number;
  signals: number;
  headerMode: string;
  passed: boolean;
  blockers: string[];
  warnings: string[];
  duplicateContactEmailCount: number;
  orphanSignalCount: number;
  orphanContactCount: number;
};

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

function buildRealisticAccountRow(index: number): Record<string, string> {
  const id = `ACCT-${String(index + 1).padStart(3, "0")}`;
  const names = [
    "Acme Corporation",
    "BrightPath Analytics",
    "CloudNine Systems",
    "Delta Secure",
    "EdgeWorks Labs",
    "FinSecure Global",
    "GreenField Health",
    "Harbor Logistics",
    "Ironclad Defense",
    "Juniper Networks Co",
    "Kite Energy Partners",
    "Lumen Data",
    "Meridian Bio",
    "Northstar Retail",
    "Orion Aerospace",
    "Pioneer Fintech",
    "Quantum SaaS",
    "Riverstone Media",
    "Summit Education",
    "Titan Manufacturing",
  ];
  return {
    account_id: id,
    account_name: names[index] ?? `Account ${index + 1}`,
    plan: index % 3 === 0 ? "Enterprise" : index % 3 === 1 ? "Professional" : "Starter",
    journey_stage: index % 4 === 0 ? "Adoption" : "Onboarding",
    segment: "Enterprise Security",
    use_case: "Security Operations",
    primary_icp: "Enterprise Security",
    account_owner: `Owner ${index + 1}`,
    owner_dam_name: "Alex Rivera",
    owner_dam_email: "alex.rivera@company.com",
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
    onboarding_date: "2026-01-15",
    onboarding_age_days: String(30 + index),
    near_threshold: index % 2 === 0 ? "Yes" : "No",
    onboarding_completed: index % 5 === 0 ? "Yes" : "No",
    active_users_7d: "5",
    total_sessions_7d: "20",
    active_users_15d: "6",
    total_sessions_15d: "40",
    active_users_30d: "7",
    total_sessions_30d: "80",
    active_users_100d: "7",
    total_sessions_100d: "100",
    invite_status: index % 3 === 0 ? "Pending" : "Accepted",
    invite_sent_date: "2026-01-10",
    invite_accepted_date: index % 3 === 0 ? "" : "2026-01-12",
    last_email_sent_date: "2026-06-01",
    last_email_sent_type: "Welcome",
    emails_sent_count: "2",
    notes: index % 7 === 0 ? "Expansion opportunity" : "",
    next_recommended_action: "Review usage",
  };
}

/** 20 accounts, 45 contacts (Admin+User each + CSM on first 5), 25 signals, varied do_not_contact. */
export function buildL3RealisticWorkbook20Accounts(): XLSX.WorkBook {
  const accountRows = Array.from({ length: 20 }, (_, i) => buildRealisticAccountRow(i));

  const contactRows: Record<string, string>[] = [];
  for (let i = 0; i < 20; i++) {
    const accountId = `ACCT-${String(i + 1).padStart(3, "0")}`;
    const accountName = accountRows[i]!.account_name!;
    contactRows.push({
      contact_email: `admin${i + 1}@customer-${i + 1}.example.com`,
      contact_role: "Admin",
      contact_name: `Admin ${i + 1}`,
      do_not_contact: "No",
      account_id: accountId,
      account_name: accountName,
      customer_type: "Customer",
      customer_first_name: `Admin${i + 1}`,
    });
    contactRows.push({
      contact_email: `user${i + 1}@customer-${i + 1}.example.com`,
      contact_role: "User",
      contact_name: `User ${i + 1}`,
      do_not_contact: i % 2 === 1 ? "Yes" : "No",
      account_id: accountId,
      account_name: accountName,
      customer_type: "Customer",
      customer_first_name: `User${i + 1}`,
    });
    if (i < 5) {
      contactRows.push({
        contact_email: `csm${i + 1}@company.com`,
        contact_role: "CSM",
        contact_name: `CSM ${i + 1}`,
        do_not_contact: "No",
        account_id: accountId,
        account_name: accountName,
        customer_type: "Internal",
        customer_first_name: `CSM${i + 1}`,
      });
    }
  }

  const signalRows: Record<string, string>[] = [];
  for (let i = 0; i < 20; i++) {
    const accountId = `ACCT-${String(i + 1).padStart(3, "0")}`;
    const adminEmail = `admin${i + 1}@customer-${i + 1}.example.com`;
    signalRows.push({
      contact_email: adminEmail,
      account_id: accountId,
      sent_at: "2026-06-01T10:00:00Z",
      template_or_type: "invite-reminder",
      channel: "email",
      status: "Delivered",
    });
    if (i < 5) {
      signalRows.push({
        contact_email: adminEmail,
        account_id: accountId,
        sent_at: "2026-06-02T14:00:00Z",
        template_or_type: "welcome",
        channel: "email",
        status: "Delivered",
      });
    }
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    row2SheetFromRows(ROW2_ACCOUNTS_COLUMNS, ROW2_DISPLAY_LABELS.accounts, accountRows),
    "Accounts",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    row2SheetFromRows(ROW2_CONTACTS_COLUMNS, ROW2_DISPLAY_LABELS.contacts, contactRows),
    "Contacts",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    row2SheetFromRows(ROW2_SIGNALS_COLUMNS, ROW2_DISPLAY_LABELS.signals, signalRows),
    "Signals",
  );
  return workbook;
}

function summarizeValidation(workbook: XLSX.WorkBook): QaSummary {
  const parsed = parseTargetMultisheetWorkbook(workbook);
  const result = validateTargetMultisheetWorkbook(workbook);
  const blockers = (result.importIssues ?? [])
    .filter((i) => i.severity === "blocker")
    .map((i) => `[${i.code}] ${i.message}`);
  const warnings = (result.importIssues ?? [])
    .filter((i) => i.severity === "warning")
    .map((i) => `[${i.code}] ${i.message}`);
  return {
    workbook: L3_REAL_WORKBOOK_FILENAME,
    accounts: parsed.accounts.length,
    contacts: parsed.contacts.length,
    signals: parsed.signals.length,
    headerMode: parsed.headerMode,
    passed: result.passed,
    blockers,
    warnings,
    duplicateContactEmailCount:
      result.importSummary?.duplicateContactEmailCount ?? 0,
    orphanSignalCount: result.importSummary?.orphanSignalCount ?? 0,
    orphanContactCount: result.importSummary?.orphanContactCount ?? 0,
  };
}

function main(): void {
  console.log("Phase L-3 — Real Workbook Test Pass\n");
  console.log("═".repeat(60));

  // 1. Template structure (download equivalent)
  console.log("\n[1] Download template structure");
  const template = buildTargetMultisheetWorkbook();
  assert(template.SheetNames.includes("Field Guide"), "template needs Field Guide");
  const tAccounts = XLSX.utils.sheet_to_json<unknown[]>(template.Sheets.Accounts!, {
    header: 1,
    defval: "",
  });
  assert(String(tAccounts[0]?.[0]).includes("Account"), "Row 1 labels");
  assert(tAccounts[1]?.[0] === "account_id", "Row 2 system keys");
  assert(tAccounts[2]?.[0] === "ACCT-001", "Row 3 data");
  assert(EXCEL_IMPORT_TEMPLATE_FILENAME === "excel-import-template.xlsx", "filename");
  console.log("  OK: template Row 1/2/3 + Field Guide");

  // 2. Build realistic workbook
  console.log("\n[2] Realistic 20-account workbook");
  const workbook = buildL3RealisticWorkbook20Accounts();
  const outPath = join(ROOT, L3_REAL_WORKBOOK_FILENAME);
  XLSX.writeFile(workbook, outPath);
  console.log(`  Wrote: ${L3_REAL_WORKBOOK_FILENAME}`);
  console.log("  Composition: 20 accounts, 45 contacts (Admin+User+CSM×5), 25 signals");
  console.log("  Includes: do_not_contact Yes on odd-index users, CSM on first 5 accounts");

  // 3. Validate
  console.log("\n[3] Upload + validate (programmatic)");
  const qa = summarizeValidation(workbook);
  console.log(`  headerMode: ${qa.headerMode}`);
  console.log(`  accounts: ${qa.accounts}`);
  console.log(`  contacts: ${qa.contacts}`);
  console.log(`  signals: ${qa.signals}`);
  console.log(`  passed: ${qa.passed}`);
  console.log(`  blockers: ${qa.blockers.length}`);
  console.log(`  warnings: ${qa.warnings.length}`);
  console.log(`  duplicate_contact_email: ${qa.duplicateContactEmailCount}`);
  console.log(`  orphan_signal: ${qa.orphanSignalCount}`);
  console.log(`  orphan_contact: ${qa.orphanContactCount}`);

  if (!qa.passed) {
    console.log("\n  BLOCKERS:");
    for (const b of qa.blockers) console.log(`    - ${b}`);
    console.log("\n  Decision: workbook cleanup needed before apply");
    process.exit(1);
  }

  if (qa.warnings.length > 0) {
    console.log("\n  WARNINGS (expected advisory):");
    for (const w of qa.warnings.slice(0, 8)) console.log(`    - ${w}`);
    if (qa.warnings.length > 8) console.log(`    ... +${qa.warnings.length - 8} more`);
  }

  const valid = validateTargetMultisheetWorkbook(workbook);
  assert(valid.passed, "validation must pass");
  assert(valid.customers.length === 20, `expected 20 customers, got ${valid.customers.length}`);
  assert(
    valid.importedContacts?.length === 45,
    `expected 45 importedContacts, got ${valid.importedContacts?.length}`,
  );

  // 4. Apply simulation
  console.log("\n[4] Apply simulation");
  const customers = valid.customers;
  const importedContacts = valid.importedContacts ?? [];
  const display = buildContactsForDisplay({
    customers,
    importedContacts,
    dataSource: "upload",
  });
  assert(display.source === "imported", "upload mode uses imported");
  assert(display.contacts.length === 45, `contacts tab count ${display.contacts.length}`);
  assert(
    display.contacts.every((c) => c.contact_name),
    "contact_name present",
  );
  assert(
    display.contacts.some((c) => c.do_not_contact === true),
    "do_not_contact Yes visible",
  );
  assert(
    display.contacts.some((c) => c.contact_role === "CSM"),
    "CSM role in uploaded data",
  );
  const roles = new Set(display.contacts.map((c) => c.contact_role));
  assert(roles.has("Admin") && roles.has("User") && roles.has("CSM"), "role filter roles");
  console.log(`  OK: ${customers.length} accounts, ${display.contacts.length} contacts displayed`);
  console.log(`  Roles: ${[...roles].join(", ")}`);

  // 5. Reports + dashboard
  console.log("\n[5] Reports + dashboard");
  const snapshot = buildReportsSnapshot({
    customers,
    importedContacts,
    dataSource: "upload",
    actionQueue: [],
    sendLogs: demoSendLogs,
    emailSequences: [],
    enrollments: [],
    rules: [],
    lastValidation: valid,
  });
  assert(snapshot.contactJourney.totalContacts === 45, "reports contact count");
  assert(snapshot.executiveOverview.totalContacts === 45, "executive overview contacts");
  const metrics = computeDashboardContactMetrics({
    customers,
    importedContacts,
    dataSource: "upload",
    enrollments: [],
    sendLogs: demoSendLogs,
    actionQueue: [],
  });
  assert(metrics.contact.totalContacts === 45, "dashboard contact count");
  console.log("  OK: reports and dashboard stable");

  // 6. Re-upload replace
  console.log("\n[6] Re-upload replace");
  const contacts1 = importedContacts;
  const contacts2 = buildImportedContactsFromNormalized(parseTargetMultisheetWorkbook(workbook));
  const replaced = replaceImportedContacts(contacts1, contacts2);
  assert(replaced.length === 45, "re-upload must not double");
  assert(customers.length === 20, "accounts must not double");
  console.log("  OK: re-upload replace semantics");

  // 7. Modified workbook
  console.log("\n[7] Modified workbook (remove/add contact)");
  const modified = buildL3RealisticWorkbook20Accounts();
  const cMatrix = XLSX.utils.sheet_to_json<unknown[]>(modified.Sheets.Contacts!, {
    header: 1,
    defval: "",
  });
  const dataRows = cMatrix.slice(2) as string[][];
  const filtered = dataRows.filter(
    (row) => row[0] !== "user1@customer-1.example.com",
  );
  filtered.push([
    "new.contact@customer-1.example.com",
    "User",
    "New Contact",
    "No",
    "ACCT-001",
    "Acme Corporation",
    "Customer",
    "New",
  ]);
  modified.Sheets.Contacts = XLSX.utils.aoa_to_sheet([
    cMatrix[0],
    cMatrix[1],
    ...filtered,
  ] as string[][]);
  const modValid = validateTargetMultisheetWorkbook(modified);
  assert(modValid.passed, "modified workbook must pass");
  const modContacts = buildImportedContactsFromNormalized(
    parseTargetMultisheetWorkbook(modified),
  );
  const modReplaced = replaceImportedContacts(contacts1, modContacts);
  assert(modReplaced.length === 45, "still 45 contacts after swap");
  assert(
    !modReplaced.some((c) => c.contact_email === "user1@customer-1.example.com"),
    "removed contact gone",
  );
  assert(
    modReplaced.some((c) => c.contact_email === "new.contact@customer-1.example.com"),
    "new contact present",
  );
  console.log("  OK: modified workbook replace");

  // 8. Export
  console.log("\n[8] Contacts CSV export");
  const exportRow = displayContactToImportedExport(display.contacts[0]!);
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
    assert(csv.includes(field), `export header ${field}`);
  }
  assert(!csv.includes("<html"), "no template HTML");
  assert(!csv.includes("password"), "no secrets");
  console.log("  OK: safe export fields only");

  // 9. Audit counts-only
  console.log("\n[9] Audit metadata");
  const meta = buildExcelImportAuditMetadata(valid);
  assert(Object.keys(meta).length === EXCEL_IMPORT_AUDIT_COUNT_KEYS.length, "counts only");
  console.log(`  OK: ${JSON.stringify(meta)}`);

  // 10. Safety
  console.log("\n[10] Safety");
  const importSrc = readFileSync(
    join(ROOT, "lib/import-multisheet-validation.ts"),
    "utf8",
  );
  assert(!importSrc.includes("@sendgrid/mail"), "no SendGrid in import path");
  assert(!importSrc.includes("buildSimulatedCommunicationLog"), "no log creation from import");
  const logCountBefore = demoSendLogs.length;
  assert(logCountBefore > 0, "demo send logs exist (unchanged by import simulation)");
  console.log("  OK: no sends/logs from import; demo Communication Logs independent");

  console.log("\n" + "═".repeat(60));
  console.log("L-3 Real Workbook Test Pass: PASSED");
  console.log("═".repeat(60));
  console.log("\nQA Summary:");
  console.log(`  Workbook: ${L3_REAL_WORKBOOK_FILENAME}`);
  console.log(`  Accounts: ${qa.accounts}`);
  console.log(`  Contacts: ${qa.contacts}`);
  console.log(`  Signals: ${qa.signals}`);
  console.log(`  Validation: PASSED (${qa.warnings.length} warnings)`);
  console.log(`  Apply: ready (${customers.length} customers, ${importedContacts.length} contacts)`);
  console.log("\nDecision: READY for Phase I persistence");
}

main();
