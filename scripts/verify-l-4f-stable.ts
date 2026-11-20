/**
 * Phase L-4F — stable verification checkpoint for flat single-sheet Row 2 import.
 * Run: npx tsx scripts/verify-l-4f-stable.ts
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
import { detectImportFormatFromWorkbook } from "../lib/import-format-detection";
import {
  FLAT_JOURNEY_IMPORT_SHEET_NAME,
  FLAT_ROW2_COLUMNS,
  FLAT_ROW2_DISPLAY_LABELS,
} from "../lib/import-flat-row2-schema";
import { parseFlatRow2Workbook } from "../lib/import-flat-row2-parser";
import { parseImportWorkbook } from "../lib/import-workbook-router";
import { validateNormalizedMultisheetImport } from "../lib/import-multisheet-cross-validation";
import {
  parseTargetMultisheetWorkbook,
} from "../lib/import-multisheet-parser";
import { validateTargetMultisheetWorkbook } from "../lib/import-multisheet-validation";
import {
  buildImportedContactsFromNormalized,
  replaceImportedContacts,
} from "../lib/imported-contacts";
import { buildRow2MultisheetWorkbook } from "../lib/import-row2-fixture";
import {
  EXCEL_IMPORT_TEMPLATE_FILENAME,
  buildFlatImportWorkbook,
  buildLegacyMultisheetWorkbook,
  buildTargetMultisheetWorkbook,
  row2SheetFromRows,
} from "../lib/import-templates";
import { buildReportsSnapshot } from "../lib/reports-snapshot";
import { buildImportedContactsExportCsv } from "../lib/session-export";
import { sendLogs as demoSendLogs } from "../lib/mock-data";

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

function flatWorkbookFromRows(rows: Record<string, string>[]): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    row2SheetFromRows(FLAT_ROW2_COLUMNS, FLAT_ROW2_DISPLAY_LABELS, rows),
    FLAT_JOURNEY_IMPORT_SHEET_NAME,
  );
  return workbook;
}

function baseFlatRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
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
    seats_purchased: "10",
    search_seats_assigned: "2",
    graph_browser_seats_assigned: "3",
    graph_desktop_seats_assigned: "2",
    search_active_users: "2",
    graph_browser_active_users: "3",
    graph_desktop_active_users: "2",
    total_active_seats: "7",
    total_sessions: "100",
    onboarding_completed: "No",
    onboarding_date: "2026-01-15",
    onboarding_age_days: "30",
    near_threshold: "No",
    active_users_7d: "5",
    total_sessions_7d: "20",
    active_users_15d: "6",
    total_sessions_15d: "40",
    active_users_30d: "7",
    total_sessions_30d: "80",
    active_users_100d: "7",
    total_sessions_100d: "100",
    contact_email: "admin@acme.com",
    contact_name: "Sarah Chen",
    contact_role: "Admin",
    do_not_contact: "No",
    invite_status: "Accepted",
    invite_sent_date: "2026-01-10",
    invite_accepted_date: "2026-01-12",
    notes: "",
    ...overrides,
  };
}

function main(): void {
  console.log("L-4F stable verification (Flat Row 2 Import)\n");

  const templatesSource = readRepo("lib/import-templates.ts");
  assert(
    templatesSource.includes("buildFlatImportWorkbook"),
    "download must use buildFlatImportWorkbook",
  );
  assert(
    templatesSource.includes("downloadExcelImportTemplate"),
    "downloadExcelImportTemplate must exist",
  );
  assert(
    templatesSource.includes("const workbook = buildFlatImportWorkbook()"),
    "downloadExcelImportTemplate must call buildFlatImportWorkbook",
  );

  console.log("1. Public flat template structure...");
  assert(
    EXCEL_IMPORT_TEMPLATE_FILENAME === "excel-import-template.xlsx",
    "filename must be excel-import-template.xlsx",
  );

  const templateWorkbook = buildFlatImportWorkbook();
  const sheetNames = templateWorkbook.SheetNames;
  assert(sheetNames.includes(FLAT_JOURNEY_IMPORT_SHEET_NAME), "Journey Import sheet required");
  assert(sheetNames.includes("Field Guide"), "Field Guide sheet required");
  assert(!sheetNames.includes("Accounts"), "public template must not expose Accounts");
  assert(!sheetNames.includes("Contacts"), "public template must not expose Contacts");
  assert(!sheetNames.includes("Signals"), "public template must not expose Signals");

  const journeyMatrix = sheetMatrix(templateWorkbook.Sheets[FLAT_JOURNEY_IMPORT_SHEET_NAME]!);
  const row1 = (journeyMatrix[0] as string[]) ?? [];
  const row2 = (journeyMatrix[1] as string[]) ?? [];
  assert(String(row1[0] ?? "").includes("Account"), "Row 1 readable labels");
  assert(row2[0] === "account_id", "Row 2 system keys");
  assert(journeyMatrix.length >= 3, "Row 3+ sample data");

  for (const key of FLAT_ROW2_COLUMNS) {
    assert(row2.includes(key), `Row 2 must include ${key}`);
  }

  const dataRows = journeyMatrix.slice(2);
  const accountIdCounts = new Map<string, number>();
  const contactEmails = new Set<string>();
  const emailIndex = row2.indexOf("contact_email");
  for (const row of dataRows) {
    const cells = row as string[];
    const accountId = String(cells[0] ?? "");
    if (accountId) {
      accountIdCounts.set(accountId, (accountIdCounts.get(accountId) ?? 0) + 1);
    }
    const email = String(cells[emailIndex] ?? "").trim().toLowerCase();
    if (email) {
      assert(!contactEmails.has(email), `duplicate sample contact_email: ${email}`);
      contactEmails.add(email);
    }
  }
  assert([...accountIdCounts.values()].some((count) => count > 1), "repeated account_id samples");
  assert(contactEmails.size >= 4, "multiple unique sample contact emails");
  console.log("  OK: flat public template structure");

  console.log("2. Parsing public template...");
  const parsed = parseImportWorkbook(templateWorkbook);
  assert(parsed.headerMode === "flat_row2", "must parse as flat_row2");
  assert(parsed.accounts[0]?.customer_name === "Acme Corporation", "Row 1 labels ignored");
  assert(parsed.accounts.length >= 2, "deduped accounts from flat rows");
  assert(parsed.contacts.length >= 4, "one contact per data row");
  assert(parsed.signals.length === 0, "flat import has no signals");
  assert(
    templateWorkbook.SheetNames.includes("Field Guide") && parsed.accounts.length >= 2,
    "Field Guide ignored by parser",
  );

  const formatResult = detectImportFormatFromWorkbook({
    fileName: EXCEL_IMPORT_TEMPLATE_FILENAME,
    sheetNames: templateWorkbook.SheetNames,
    journeyImportHeaders: row2,
  });
  assert(formatResult.headerMode === "flat_row2", "format detection flat_row2");
  assert(
    formatResult.label === "Flat Row 2 workbook",
    `expected Flat Row 2 label, got ${formatResult.label}`,
  );
  console.log("  OK: flat_row2 parse; Row 1 ignored; Row 2 keys; Row 3+ data; Field Guide ignored");

  console.log("3. Validation — public template passes...");
  const valid = validateTargetMultisheetWorkbook(templateWorkbook);
  assert(valid.passed === true, "public template must pass with 0 blockers");
  assert(
    (valid.importIssues ?? []).filter((i) => i.severity === "blocker").length === 0,
    "0 blockers on public template",
  );
  assert(valid.importSummary?.headerMode === "flat_row2", "summary headerMode flat_row2");
  console.log("  OK: public template validates with 0 blockers");

  console.log("4. Validation blockers...");
  const dupResult = validateTargetMultisheetWorkbook(
    flatWorkbookFromRows([
      baseFlatRow({ contact_email: "dup@test.com", contact_role: "Admin" }),
      baseFlatRow({ contact_email: "dup@test.com", contact_role: "User" }),
    ]),
  );
  assert(dupResult.passed === false && hasCode(dupResult.importIssues ?? [], "CONTACT_DUPLICATE_EMAIL"), "duplicate email");

  const invalidEmailResult = validateTargetMultisheetWorkbook(
    flatWorkbookFromRows([baseFlatRow({ contact_email: "not-an-email" })]),
  );
  assert(
    invalidEmailResult.passed === false &&
      hasCode(invalidEmailResult.importIssues ?? [], "CONTACT_INVALID_EMAIL"),
    "invalid email",
  );

  const emptyAccountIdResult = validateTargetMultisheetWorkbook(
    flatWorkbookFromRows([baseFlatRow({ account_id: "" })]),
  );
  assert(
    emptyAccountIdResult.passed === false &&
      hasCode(emptyAccountIdResult.importIssues ?? [], "ACCOUNT_MISSING_CUSTOMER_ID"),
    "empty account_id",
  );

  const emptyAccountNameResult = validateTargetMultisheetWorkbook(
    flatWorkbookFromRows([baseFlatRow({ account_name: "" })]),
  );
  assert(
    emptyAccountNameResult.passed === false &&
      hasCode(emptyAccountNameResult.importIssues ?? [], "ACCOUNT_MISSING_CUSTOMER_NAME"),
    "empty account_name",
  );

  const emptyEmailResult = validateTargetMultisheetWorkbook(
    flatWorkbookFromRows([baseFlatRow({ contact_email: "" })]),
  );
  assert(
    emptyEmailResult.passed === false &&
      hasCode(emptyEmailResult.importIssues ?? [], "CONTACT_MISSING_EMAIL"),
    "empty contact_email",
  );

  const emptyRoleResult = validateTargetMultisheetWorkbook(
    flatWorkbookFromRows([baseFlatRow({ contact_role: "" })]),
  );
  assert(
    emptyRoleResult.passed === false &&
      hasCode(emptyRoleResult.importIssues ?? [], "CONTACT_MISSING_ROLE"),
    "empty contact_role",
  );

  const nameConflictResult = validateTargetMultisheetWorkbook(
    flatWorkbookFromRows([
      baseFlatRow({ account_name: "Acme Corporation", contact_email: "a1@test.com", contact_role: "Admin" }),
      baseFlatRow({ account_name: "Wrong Name Inc", contact_email: "u1@test.com", contact_role: "User" }),
    ]),
  );
  assert(
    nameConflictResult.passed === false &&
      hasCode(nameConflictResult.importIssues ?? [], "FLAT_ACCOUNT_NAME_CONFLICT"),
    "account_name conflict",
  );
  console.log("  OK: flat validation blockers");

  console.log("5. Validation warnings and info...");
  const planConflictParsed = parseFlatRow2Workbook(
    flatWorkbookFromRows([
      baseFlatRow({ plan: "Enterprise", contact_email: "a1@test.com", contact_role: "Admin" }),
      baseFlatRow({ plan: "Starter", contact_email: "u1@test.com", contact_role: "User" }),
    ]),
  );
  const planConflictValidation = validateNormalizedMultisheetImport(planConflictParsed);
  assert(
    planConflictValidation.passed === true &&
      hasCode(planConflictValidation.warnings, "FLAT_ACCOUNT_PLAN_CONFLICT"),
    "plan conflict warning",
  );

  const stageConflictValidation = validateNormalizedMultisheetImport(
    parseFlatRow2Workbook(
      flatWorkbookFromRows([
        baseFlatRow({ journey_stage: "Onboarding", contact_email: "a1@test.com", contact_role: "Admin" }),
        baseFlatRow({ journey_stage: "Adoption", contact_email: "u1@test.com", contact_role: "User" }),
      ]),
    ),
  );
  assert(
    hasCode(stageConflictValidation.warnings, "FLAT_ACCOUNT_STAGE_CONFLICT"),
    "journey_stage conflict warning",
  );

  const dateConflictValidation = validateNormalizedMultisheetImport(
    parseFlatRow2Workbook(
      flatWorkbookFromRows([
        baseFlatRow({ renewal_date: "2027-01-15", contact_email: "a1@test.com", contact_role: "Admin" }),
        baseFlatRow({ renewal_date: "2028-01-15", contact_email: "u1@test.com", contact_role: "User" }),
      ]),
    ),
  );
  assert(
    hasCode(dateConflictValidation.warnings, "FLAT_ACCOUNT_RENEWAL_CONFLICT"),
    "renewal_date conflict warning",
  );

  const noCsmResult = validateTargetMultisheetWorkbook(
    flatWorkbookFromRows([
      baseFlatRow({ contact_role: "Admin", contact_email: "admin@acme.com" }),
      baseFlatRow({ contact_role: "User", contact_email: "user@acme.com" }),
    ]),
  );
  assert(hasCode(noCsmResult.importIssues ?? [], "ACCOUNT_MISSING_CSM_CONTACT"), "missing CSM warning");

  const noAdminResult = validateTargetMultisheetWorkbook(
    flatWorkbookFromRows([
      baseFlatRow({ contact_role: "User", contact_email: "user@acme.com" }),
      baseFlatRow({ contact_role: "CSM", contact_email: "csm@company.com" }),
    ]),
  );
  assert(hasCode(noAdminResult.importIssues ?? [], "ACCOUNT_MISSING_ADMIN_CONTACT"), "missing Admin warning");

  assert(
    hasCode(valid.importIssues ?? [], "COMMUNICATION_HISTORY_NOT_IMPORTED") ||
      (valid.importNotes ?? []).some((n) => n.toLowerCase().includes("prior send history")),
    "communication history info/note",
  );
  console.log("  OK: warnings and communication history info");

  console.log("6. Apply payload and account/contact counts...");
  assert(valid.customers.length >= 2, "one Customer per account_id");
  assert(
    valid.importedContacts?.length === valid.importSummary?.contactsCount,
    "one importedContact per contact row",
  );
  assert(
    valid.importedContacts?.length === parsed.contacts.length,
    "importedContacts aligned with parsed contacts",
  );
  const imported = buildImportedContactsFromNormalized(parsed);
  assert(imported.length === parsed.contacts.length, "buildImportedContactsFromNormalized count");
  console.log(
    `  OK: customers=${valid.customers.length}, contacts=${valid.importedContacts?.length}`,
  );

  console.log("7. Re-upload replace semantics...");
  const contacts1 = valid.importedContacts ?? [];
  const contacts2 = buildImportedContactsFromNormalized(parseImportWorkbook(templateWorkbook));
  const replaced = replaceImportedContacts(contacts1, contacts2);
  assert(replaced.length === contacts1.length, "re-upload must not double contacts");
  assert(
    valid.customers.length === validateTargetMultisheetWorkbook(templateWorkbook).customers.length,
    "re-upload must not double customers",
  );
  console.log("  OK: re-upload replace semantics");

  console.log("8. Modified flat workbook replaces contacts...");
  const modifiedWorkbook = buildFlatImportWorkbook();
  const modifiedMatrix = sheetMatrix(modifiedWorkbook.Sheets[FLAT_JOURNEY_IMPORT_SHEET_NAME]!);
  const modifiedRow2 = (modifiedMatrix[1] as string[]) ?? [];
  const modifiedData = modifiedMatrix.slice(2, 3).map((row) => {
    const cells = [...(row as string[])];
    const emailCol = modifiedRow2.indexOf("contact_email");
    const roleCol = modifiedRow2.indexOf("contact_role");
    const nameCol = modifiedRow2.indexOf("contact_name");
    const dncCol = modifiedRow2.indexOf("do_not_contact");
    if (emailCol >= 0) cells[emailCol] = "admin@acme.com";
    if (roleCol >= 0) cells[roleCol] = "Admin";
    if (nameCol >= 0) cells[nameCol] = "Sarah Chen";
    if (dncCol >= 0) cells[dncCol] = "No";
    return cells;
  });
  modifiedData.push(
    FLAT_ROW2_COLUMNS.map((key) => {
      const base = baseFlatRow({
        contact_email: "newperson@acme.com",
        contact_name: "New Person",
        contact_role: "User",
        do_not_contact: "Yes",
      });
      return base[key] ?? "";
    }),
  );
  modifiedWorkbook.Sheets[FLAT_JOURNEY_IMPORT_SHEET_NAME] = XLSX.utils.aoa_to_sheet([
    modifiedMatrix[0],
    modifiedMatrix[1],
    ...modifiedData,
  ] as string[][]);
  const modifiedValid = validateTargetMultisheetWorkbook(modifiedWorkbook);
  const afterReplace = replaceImportedContacts(contacts1, modifiedValid.importedContacts ?? []);
  assert(afterReplace.length === 2, "modified flat workbook has 2 contacts");
  assert(
    !afterReplace.some((c) => c.contact_email === "sarah.chen@acme.com"),
    "removed contact must not remain",
  );
  assert(
    afterReplace.some((c) => c.contact_email === "newperson@acme.com"),
    "new contact must appear",
  );
  console.log("  OK: modified flat workbook replace semantics");

  console.log("9. Contacts display and export...");
  const uploadDisplay = buildContactsForDisplay({
    customers: valid.customers,
    importedContacts: valid.importedContacts ?? [],
    dataSource: "upload",
  });
  assert(uploadDisplay.source === "imported", "upload mode uses importedContacts");
  assert(
    uploadDisplay.contacts.every((c) => c.contact_name !== undefined),
    "contact_name preserved",
  );
  assert(
    uploadDisplay.contacts.every((c) => typeof c.do_not_contact === "boolean"),
    "do_not_contact preserved",
  );
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
  console.log("  OK: Contacts display and safe export");

  console.log("10. Reports and dashboard...");
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
    "reports use importedContacts count",
  );
  assert(
    snapshot.executiveOverview.totalContacts === (valid.importedContacts?.length ?? 0),
    "executive overview uses importedContacts",
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
  console.log("  OK: reports and dashboard stable");

  console.log("11. L-2 multi-sheet fallback...");
  const l2Result = validateTargetMultisheetWorkbook(buildTargetMultisheetWorkbook());
  assert(l2Result.passed === true, "L-2 multi-sheet must still validate");
  const l2Parsed = parseTargetMultisheetWorkbook(buildTargetMultisheetWorkbook());
  assert(l2Parsed.headerMode === "row2", "L-2 parses as row2");
  const l2Compat = validateTargetMultisheetWorkbook(buildRow2MultisheetWorkbook());
  assert(l2Compat.passed === true, "L-2 fixture workbook passes");
  console.log("  OK: L-2 multi-sheet fallback intact");

  console.log("12. L-1 legacy fallback...");
  const legacyResult = validateTargetMultisheetWorkbook(buildLegacyMultisheetWorkbook());
  assert(legacyResult.passed === true, "L-1 legacy workbook must still validate");
  const legacyParsed = parseTargetMultisheetWorkbook(buildLegacyMultisheetWorkbook());
  assert(legacyParsed.headerMode === "legacy_single_row", "legacy headerMode");
  console.log("  OK: L-1 legacy fallback intact");

  console.log("13. Customer Data UI copy...");
  const uploadPanel = readRepo("components/customers/data-upload-panel.tsx");
  const preview = readRepo("components/customers/multisheet-import-preview.tsx");
  const requiredCopy = [
    "Upload one Excel workbook with a Journey Import sheet",
    "Row 1 is for readable labels",
    "Row 2 contains system keys",
    "Row 3 onward contains data",
    "One row represents one account-contact",
    "Account ID can repeat for multiple contacts",
    "contact email must be unique",
    "No emails are sent during import",
    "Refresh Action Queue remains",
    "Download Excel Import Template",
    "Upload Excel Workbook",
    "Validate Data",
    "Use Demo Data",
    "Flat Row 2 workbook",
  ];
  for (const phrase of requiredCopy) {
    assert(uploadPanel.includes(phrase), `upload panel must include: ${phrase}`);
  }
  const forbidden = [
    "Accounts, Contacts, and Signals",
    "Signals required",
    "Download Current Upload Template",
    "Download Target Multi-Sheet Template",
    "Option A",
    "Option C",
    "first sheet only",
    "extra contacts not persisted",
    "single header row",
  ];
  for (const phrase of forbidden) {
    assert(!uploadPanel.includes(phrase), `upload panel must not include: ${phrase}`);
  }
  assert(preview.includes("Flat Import Preview"), "flat preview title");
  assert(preview.includes("flat_row2"), "flat preview branch");
  console.log("  OK: Customer Data UI copy aligned with L-4 flat import");

  console.log("14. Audit metadata...");
  assert(
    getUiAuditPermission("data.excel_import.validate") === "upload_customer_data",
    "validate permission",
  );
  const meta = buildExcelImportAuditMetadata(valid);
  assert(Object.keys(meta).length === EXCEL_IMPORT_AUDIT_COUNT_KEYS.length, "audit counts-only");
  console.log("  OK: excel import audit counts-only");

  console.log("15. Safety and K-1 ledger unchanged...");
  assert(!uploadPanel.includes("/api/send-customer-email"), "no customer send route");
  try {
    readRepo("app/api/send-customer-email/route.ts");
    assert(false, "send-customer-email route must not exist");
  } catch {
    // expected
  }
  const importPaths = [
    "lib/import-templates.ts",
    "lib/import-flat-row2-parser.ts",
    "lib/import-flat-row2-validation.ts",
    "lib/import-multisheet-validation.ts",
    "lib/import-workbook-router.ts",
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
  assert(parsed.signals.length === 0, "flat import creates no signals");
  assert(
    buildImportedContactsFromNormalized(parsed).length === parsed.contacts.length,
    "signals must not create contacts",
  );
  const simLogSource = readRepo("lib/communication-logs/simulated-log.ts");
  assert(
    simLogSource.includes("buildSimulatedCommunicationLog"),
    "K-1 simulated log helper still present",
  );
  console.log("  OK: no sends/logs from flat import; K-1 ledger unchanged");

  console.log("16. Documentation alignment...");
  const docs = [
    "docs/context/phase-l-4-flat-single-sheet-import.md",
    "docs/context/phase-l-single-excel-import.md",
    "docs/context/product.md",
    "README.md",
  ];
  for (const doc of docs) {
    const content = readRepo(doc);
    assert(
      content.includes("L-4") || content.includes("flat"),
      `${doc} must mention L-4 flat import`,
    );
    assert(
      content.includes("Journey Import") || content.includes("flat"),
      `${doc} must mention Journey Import or flat import`,
    );
  }
  console.log("  OK: documentation references flat import");

  console.log("\nL-4F stable verification script passed.");
  console.log("Decision: STABLE — flat single-sheet Row 2 import ready for Phase I persistence planning.");
}

main();
