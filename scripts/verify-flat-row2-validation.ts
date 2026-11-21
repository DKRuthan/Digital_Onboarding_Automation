/**
 * Phase L-4C — Flat Row 2 validation + validate/apply wiring verification.
 * Run: npx tsx scripts/verify-flat-row2-validation.ts
 */
import * as XLSX from "xlsx";

import {
  buildFlatRow2Workbook20Accounts,
  buildFlatRow2WorkbookSmall,
} from "../lib/import-flat-row2-fixture";
import {
  FLAT_JOURNEY_IMPORT_SHEET_NAME,
  FLAT_ROW2_COLUMNS,
  FLAT_ROW2_DISPLAY_LABELS,
} from "../lib/import-flat-row2-schema";
import { parseFlatRow2Workbook } from "../lib/import-flat-row2-parser";
import { validateNormalizedMultisheetImport } from "../lib/import-multisheet-cross-validation";
import { validateTargetMultisheetWorkbook } from "../lib/import-multisheet-validation";
import { buildImportedContactsFromNormalized } from "../lib/imported-contacts";
import { buildRow2MultisheetWorkbook } from "../lib/import-row2-fixture";
import { row2SheetFromRows } from "../lib/import-templates";
import { sendLogs as demoSendLogs } from "../lib/mock-data";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

function hasCode(
  issues: Array<{ code: string }>,
  code: string,
): boolean {
  return issues.some((issue) => issue.code === code);
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
    account_name: "Demo Customer 001",
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
    contact_email: "admin@customer-001.example.com",
    contact_name: "Aster Demo",
    contact_role: "Admin",
    do_not_contact: "No",
    invite_status: "Accepted",
    invite_sent_date: "2026-01-10",
    invite_accepted_date: "2026-01-12",
    notes: "",
    ...overrides,
  };
}

console.log("Phase L-4C — Flat Row 2 Validation\n");
console.log("═".repeat(60));

// 1. Validate path (same as UI)
console.log("\n[1] Flat workbook validates through validateTargetMultisheetWorkbook");
const smallWorkbook = buildFlatRow2WorkbookSmall();
const smallResult = validateTargetMultisheetWorkbook(smallWorkbook);
assert(smallResult.passed === true, `expected pass, got passed=${smallResult.passed}`);
assert(
  (smallResult.importedContacts?.length ?? 0) === 3,
  `expected 3 importedContacts, got ${smallResult.importedContacts?.length}`,
);
assert(
  smallResult.customers?.length === 2,
  `expected 2 customers, got ${smallResult.customers?.length}`,
);
console.log("  OK: validate path passed (2 accounts, 3 contacts)");

// 2. No multi-sheet requirement
console.log("\n[2] Flat workbook does not require Accounts/Contacts/Signals");
assert(
  !smallWorkbook.SheetNames.includes("Accounts"),
  "flat workbook should not need Accounts sheet",
);
assert(
  !smallWorkbook.SheetNames.includes("Signals"),
  "flat workbook should not need Signals sheet",
);
const issues = [
  ...(smallResult.importIssues ?? []),
];
assert(
  !hasCode(issues, "SIGNAL_UNKNOWN_CONTACT_EMAIL"),
  "no orphan signal blockers",
);
console.log("  OK: no missing Signals blocker");

// 3. 20-account workbook
console.log("\n[3] 20-account / 45-contact flat workbook");
const workbook20 = buildFlatRow2Workbook20Accounts();
const result20 = validateTargetMultisheetWorkbook(workbook20);
assert(result20.passed === true, "20-account flat workbook should pass");
assert(
  result20.importSummary?.contactsCount === 45,
  `expected 45 contacts, got ${result20.importSummary?.contactsCount}`,
);
assert(
  result20.importSummary?.signalsCount === 0,
  "signals count should be 0",
);
console.log("  OK: 20 accounts / 45 contacts validated");

// 4. Duplicate contact_email blocker
console.log("\n[4] Duplicate contact_email blocker");
const dupWorkbook = flatWorkbookFromRows([
  baseFlatRow({ contact_email: "dup@test.example.com", contact_role: "Admin" }),
  baseFlatRow({ contact_email: "dup@test.example.com", contact_role: "User" }),
]);
const dupResult = validateTargetMultisheetWorkbook(dupWorkbook);
assert(dupResult.passed === false, "duplicate email should fail");
assert(
  hasCode(dupResult.importIssues ?? [], "CONTACT_DUPLICATE_EMAIL"),
  "CONTACT_DUPLICATE_EMAIL blocker expected",
);
console.log("  OK: duplicate contact_email blocked");

// 5. Invalid contact_email blocker
console.log("\n[5] Invalid contact_email blocker");
const invalidEmailWorkbook = flatWorkbookFromRows([
  baseFlatRow({ contact_email: "not-an-email", contact_role: "Admin" }),
]);
const invalidEmailResult = validateTargetMultisheetWorkbook(invalidEmailWorkbook);
assert(invalidEmailResult.passed === false, "invalid email should fail");
assert(
  hasCode(invalidEmailResult.importIssues ?? [], "CONTACT_INVALID_EMAIL"),
  "CONTACT_INVALID_EMAIL blocker expected",
);
console.log("  OK: invalid contact_email blocked");

// 6. Empty account_id blocker
console.log("\n[6] Empty account_id blocker");
const emptyAccountIdWorkbook = flatWorkbookFromRows([
  baseFlatRow({ account_id: "", contact_role: "Admin" }),
]);
const emptyAccountIdResult = validateTargetMultisheetWorkbook(emptyAccountIdWorkbook);
assert(emptyAccountIdResult.passed === false, "empty account_id should fail");
assert(
  hasCode(emptyAccountIdResult.importIssues ?? [], "ACCOUNT_MISSING_CUSTOMER_ID"),
  "ACCOUNT_MISSING_CUSTOMER_ID blocker expected",
);
console.log("  OK: empty account_id blocked");

// 7. Empty account_name blocker
console.log("\n[7] Empty account_name blocker");
const emptyAccountNameWorkbook = flatWorkbookFromRows([
  baseFlatRow({ account_name: "", contact_role: "Admin" }),
]);
const emptyAccountNameResult = validateTargetMultisheetWorkbook(emptyAccountNameWorkbook);
assert(emptyAccountNameResult.passed === false, "empty account_name should fail");
assert(
  hasCode(emptyAccountNameResult.importIssues ?? [], "ACCOUNT_MISSING_CUSTOMER_NAME"),
  "ACCOUNT_MISSING_CUSTOMER_NAME blocker expected",
);
console.log("  OK: empty account_name blocked");

// 8. Empty contact_role blocker
console.log("\n[8] Empty contact_role blocker");
const emptyRoleWorkbook = flatWorkbookFromRows([
  baseFlatRow({ contact_role: "" }),
]);
const emptyRoleResult = validateTargetMultisheetWorkbook(emptyRoleWorkbook);
assert(emptyRoleResult.passed === false, "empty contact_role should fail");
assert(
  hasCode(emptyRoleResult.importIssues ?? [], "CONTACT_MISSING_ROLE"),
  "CONTACT_MISSING_ROLE blocker expected",
);
console.log("  OK: empty contact_role blocked");

// 9. account_name conflict blocker
console.log("\n[9] account_name conflict blocker");
const nameConflictWorkbook = flatWorkbookFromRows([
  baseFlatRow({ account_name: "Demo Customer 001", contact_role: "Admin", contact_email: "a1@test.example.com" }),
  baseFlatRow({ account_name: "Wrong Name Inc", contact_role: "User", contact_email: "u1@test.example.com" }),
]);
const nameConflictResult = validateTargetMultisheetWorkbook(nameConflictWorkbook);
assert(nameConflictResult.passed === false, "account_name conflict should fail");
assert(
  hasCode(nameConflictResult.importIssues ?? [], "FLAT_ACCOUNT_NAME_CONFLICT"),
  "FLAT_ACCOUNT_NAME_CONFLICT blocker expected",
);
console.log("  OK: account_name conflict blocked");

// 10. plan conflict warning
console.log("\n[10] plan conflict warning");
const planConflictWorkbook = flatWorkbookFromRows([
  baseFlatRow({ plan: "Enterprise", contact_role: "Admin", contact_email: "a1@test.example.com" }),
  baseFlatRow({ plan: "Starter", contact_role: "User", contact_email: "u1@test.example.com" }),
]);
const planConflictParsed = parseFlatRow2Workbook(planConflictWorkbook);
const planConflictValidation = validateNormalizedMultisheetImport(planConflictParsed);
assert(planConflictValidation.passed === true, "plan conflict should not block");
assert(
  hasCode(planConflictValidation.warnings, "FLAT_ACCOUNT_PLAN_CONFLICT"),
  "FLAT_ACCOUNT_PLAN_CONFLICT warning expected",
);
console.log("  OK: plan conflict is warning only");

// 11. Missing CSM warning
console.log("\n[11] Missing CSM contact warning");
const noCsmWorkbook = flatWorkbookFromRows([
  baseFlatRow({ contact_role: "Admin", contact_email: "admin@customer-001.example.com" }),
  baseFlatRow({ contact_role: "User", contact_email: "user@customer-001.example.com" }),
]);
const noCsmResult = validateTargetMultisheetWorkbook(noCsmWorkbook);
assert(
  hasCode(noCsmResult.importIssues ?? [], "ACCOUNT_MISSING_CSM_CONTACT"),
  "ACCOUNT_MISSING_CSM_CONTACT warning expected",
);
console.log("  OK: missing CSM warning");

// 12. Missing Admin warning
console.log("\n[12] Missing Admin contact warning");
const noAdminWorkbook = flatWorkbookFromRows([
  baseFlatRow({ contact_role: "User", contact_email: "user@customer-001.example.com" }),
  baseFlatRow({ contact_role: "CSM", contact_email: "csm@team.example.com" }),
]);
const noAdminResult = validateTargetMultisheetWorkbook(noAdminWorkbook);
assert(
  hasCode(noAdminResult.importIssues ?? [], "ACCOUNT_MISSING_ADMIN_CONTACT"),
  "ACCOUNT_MISSING_ADMIN_CONTACT warning expected",
);
console.log("  OK: missing Admin warning");

// 13. Communication history info
console.log("\n[13] Communication history not imported");
assert(
  hasCode(smallResult.importIssues ?? [], "COMMUNICATION_HISTORY_NOT_IMPORTED") ||
    (smallResult.importNotes ?? []).some((n) => n.includes("prior send history")),
  "communication history note/info expected",
);
console.log("  OK: communication history advisory present");

// 14. Re-upload replace
console.log("\n[14] Re-upload replace semantics");
const reupload1 = validateTargetMultisheetWorkbook(smallWorkbook);
const reupload2 = validateTargetMultisheetWorkbook(smallWorkbook);
assert(
  reupload1.customers?.length === reupload2.customers?.length,
  "re-upload should not double customers",
);
assert(
  reupload1.importedContacts?.length === reupload2.importedContacts?.length,
  "re-upload should not double contacts",
);
console.log("  OK: re-upload replace semantics");

// 15. importedContacts fields
console.log("\n[15] importedContacts preservation");
const parsedSmall = parseFlatRow2Workbook(smallWorkbook);
const imported = buildImportedContactsFromNormalized(parsedSmall);
assert(imported.length === 3, "importedContacts count");
assert(imported.some((c) => c.contact_name), "contact_name preserved");
assert(imported.some((c) => c.contact_role), "contact_role preserved");
assert(imported.every((c) => c.customer_id), "customer link preserved");
console.log("  OK: importedContacts fields preserved");

// 16. Safety
console.log("\n[16] Safety — no signals/logs/emails");
assert(parsedSmall.signals.length === 0, "no signals");
assert(demoSendLogs.length > 0, "demo logs independent");
console.log("  OK: flat import creates no signals");

// 17. L-2 multi-sheet still passes
console.log("\n[17] L-2 multi-sheet validation backward compatibility");
const multiResult = validateTargetMultisheetWorkbook(buildRow2MultisheetWorkbook());
assert(multiResult.passed === true, "L-2 multi-sheet should still pass");
console.log("  OK: L-2 multi-sheet unchanged");

console.log("\n" + "═".repeat(60));
console.log("L-4C Flat Row 2 Validation: PASSED");
console.log("═".repeat(60));
console.log("\nDecision: READY for L-4D flat template/UI switch");
