import * as XLSX from "xlsx";

import {
  LEGACY_ACCOUNTS_COLUMNS,
  LEGACY_CONTACTS_COLUMNS,
  LEGACY_SIGNALS_COLUMNS,
  buildTargetMultisheetWorkbook,
} from "../lib/import-templates";
import { validateTargetMultisheetWorkbook } from "../lib/import-multisheet-validation";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

function hasIssueCode(
  result: { importIssues?: { code: string; severity: string }[] },
  code: string,
  severity?: "blocker" | "warning" | "info",
): boolean {
  return (result.importIssues ?? []).some(
    (issue) =>
      issue.code === code && (severity ? issue.severity === severity : true),
  );
}

function buildWorkbook(
  accounts: Record<string, string>[],
  contacts: Record<string, string>[],
  signals: Record<string, string>[] = [],
): XLSX.WorkBook {
  const sheetFromRows = (
    headers: readonly string[],
    rows: Record<string, string>[],
  ) => {
    const data = [
      [...headers],
      ...rows.map((row) => headers.map((header) => row[header] ?? "")),
    ];
    return XLSX.utils.aoa_to_sheet(data);
  };

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    sheetFromRows(LEGACY_ACCOUNTS_COLUMNS, accounts),
    "Accounts",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    sheetFromRows(LEGACY_CONTACTS_COLUMNS, contacts),
    "Contacts",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    sheetFromRows(LEGACY_SIGNALS_COLUMNS, signals),
    "Signals",
  );
  return workbook;
}

const sampleAccount: Record<string, string> = {
  customer_id: "CUST-001",
  customer_name: "Demo Customer 001",
  plan: "Enterprise",
  stage: "Onboarding",
  segment: "Enterprise Security",
  use_case: "Security Operations",
  icp: "Enterprise Security",
  account_owner: "Aster Demo",
  owner_dam_name: "Ash Demo",
  owner_dam_email: "ash.demo@team.example.com",
  onboarding_start_date: "2026-01-15",
  term_start_date: "2026-01-15",
  renewal_date: "2027-01-15",
  invite_status: "Accepted",
  invite_sent_date: "2026-01-10",
  invite_accepted_date: "2026-01-12",
  usage_sessions: "10",
  usage_activities: "100",
  active_users: "5",
  last_usage_date: "2026-06-17",
  usage_threshold: "100",
  usage_threshold_percent: "76",
  seats_total: "10",
  seats_assigned: "5",
  seat_assignment_percent: "50",
  graph_desktop_assigned: "2",
  graph_browser_assigned: "2",
  search_assigned: "1",
  academy_visited: "Yes",
  webinar_attended: "No",
  last_email_sent_date: "2026-06-01",
  last_email_sent_type: "Usage Summary",
  emails_sent_count: "1",
  notes: "",
  next_recommended_action: "",
};

const FIXED_NOW = new Date("2026-06-18T12:00:00.000Z");

// A. Valid target template
console.log("A. Valid target template...");
const validResult = validateTargetMultisheetWorkbook(
  buildTargetMultisheetWorkbook(),
  { now: FIXED_NOW },
);
assert(validResult.passed === true, "valid template should pass");
assert(validResult.customers.length === 2, "expected 2 customers");
assert(
  (validResult.importIssues ?? []).filter((i) => i.severity === "blocker").length === 0,
  "expected no blockers",
);
assert(
  hasIssueCode(validResult, "SIGNALS_NOT_IMPORTED", "info") ||
    (validResult.importNotes ?? []).some((n) => n.includes("Signals")),
  "expected Signals note/info",
);
console.log("  OK: passes with 2 customers, no blockers, Signals info present");

// B. Orphan contact
console.log("B. Orphan contact...");
const orphanResult = validateTargetMultisheetWorkbook(
  buildWorkbook(
    [sampleAccount],
    [
      {
        contact_email: "orphan@example.com",
        contact_role: "Admin",
        contact_name: "Orphan",
        do_not_contact: "No",
        customer_id: "CUST-999",
      },
    ],
  ),
  { now: FIXED_NOW },
);
assert(orphanResult.passed === false, "orphan contact should fail validation");
assert(
  hasIssueCode(orphanResult, "CONTACT_ORPHAN_CUSTOMER_ID", "blocker"),
  "expected orphan blocker",
);
assert(orphanResult.customers.length === 0, "customers should not be apply-ready");
console.log("  OK: fails with blocker, no apply-ready customers");

// C. Missing Admin
console.log("C. Missing Admin...");
const missingAdminResult = validateTargetMultisheetWorkbook(
  buildWorkbook(
    [sampleAccount],
    [
      {
        contact_email: "user@customer-001.example.com",
        contact_role: "User",
        contact_name: "User Only",
        do_not_contact: "No",
        customer_id: "CUST-001",
      },
    ],
  ),
  { now: FIXED_NOW },
);
assert(missingAdminResult.passed === true, "missing Admin should pass");
assert(
  hasIssueCode(missingAdminResult, "CONTACT_MISSING_ADMIN", "warning"),
  "expected missing Admin warning",
);
assert(missingAdminResult.customers.length === 1, "expected 1 customer");
console.log("  OK: passes with warning and customers returned");

// D. Duplicate contact
console.log("D. Duplicate contact...");
const duplicateResult = validateTargetMultisheetWorkbook(
  buildWorkbook(
    [sampleAccount],
    [
      {
        contact_email: "admin@customer-001.example.com",
        contact_role: "Admin",
        contact_name: "Admin One",
        do_not_contact: "No",
        customer_id: "CUST-001",
      },
      {
        contact_email: "admin@customer-001.example.com",
        contact_role: "Admin",
        contact_name: "Admin Two",
        do_not_contact: "No",
        customer_id: "CUST-001",
      },
    ],
  ),
  { now: FIXED_NOW },
);
assert(duplicateResult.passed === false, "duplicate contact should fail");
assert(
  hasIssueCode(duplicateResult, "CONTACT_DUPLICATE_EMAIL", "blocker"),
  "expected duplicate blocker",
);
console.log("  OK: fails with duplicate blocker");

// E. do_not_contact Yes
console.log("E. do_not_contact Yes...");
const dncResult = validateTargetMultisheetWorkbook(
  buildWorkbook(
    [sampleAccount],
    [
      {
        contact_email: "admin@customer-001.example.com",
        contact_role: "Admin",
        contact_name: "Admin",
        do_not_contact: "Yes",
        customer_id: "CUST-001",
      },
    ],
  ),
  { now: FIXED_NOW },
);
assert(dncResult.passed === true, "do_not_contact Yes should pass");
assert(
  hasIssueCode(dncResult, "CONTACT_DO_NOT_CONTACT_NOT_PERSISTED", "warning"),
  "expected do_not_contact warning",
);
console.log("  OK: passes with do_not_contact warning");

console.log("OK: import multisheet cross-validation wired verification passed");
