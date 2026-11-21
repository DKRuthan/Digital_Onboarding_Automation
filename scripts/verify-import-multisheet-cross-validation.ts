import * as XLSX from "xlsx";

import { validateNormalizedMultisheetImport } from "../lib/import-multisheet-cross-validation";
import {
  MultisheetParserError,
  parseTargetMultisheetWorkbook,
} from "../lib/import-multisheet-parser";
import type { NormalizedImport } from "../lib/import-multisheet-parser";
import {
  REQUIRED_ACCOUNTS_COLUMNS,
  REQUIRED_CONTACTS_COLUMNS,
  REQUIRED_SIGNALS_COLUMNS,
} from "../lib/import-sheet-schema";
import { buildTargetMultisheetWorkbook } from "../lib/import-templates";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

function hasCode(
  issues: { code: string }[],
  code: string,
): boolean {
  return issues.some((issue) => issue.code === code);
}

const DEFAULT_SHEET_HEADERS = {
  accounts: [...REQUIRED_ACCOUNTS_COLUMNS, "plan", "stage", "owner_dam_email"],
  contacts: [
    ...REQUIRED_CONTACTS_COLUMNS,
    "contact_name",
    "do_not_contact",
  ],
  signals: [...REQUIRED_SIGNALS_COLUMNS],
};

const SAMPLE_ACCOUNT = {
  customer_id: "CUST-001",
  customer_name: "Demo Customer 001",
  plan: "Enterprise",
  stage: "Onboarding",
  owner_dam_email: "ash.demo@team.example.com",
  term_start_date: "2026-01-15",
  renewal_date: "2027-01-15",
  invite_sent_date: "2026-01-10",
  invite_status: "Accepted",
  usage_sessions: "10",
  seats_total: "10",
  seats_assigned: "5",
  academy_visited: "Yes",
  webinar_attended: "No",
};

function baseImport(
  partial: Partial<NormalizedImport> & Pick<NormalizedImport, "accounts" | "contacts">,
): NormalizedImport {
  return {
    format: "option_c",
    headerMode: "legacy_single_row",
    sheetNames: ["Accounts", "Contacts", "Signals"],
    signals: [],
    sheetHeaders: DEFAULT_SHEET_HEADERS,
    ...partial,
  };
}

// A. Valid target template
console.log("A. Valid target template...");
const workbook = buildTargetMultisheetWorkbook();
const normalized = parseTargetMultisheetWorkbook(workbook);
const validResult = validateNormalizedMultisheetImport(normalized);

assert(validResult.passed === true, `expected passed=true, got ${validResult.passed}`);
assert(validResult.blockers.length === 0, `expected 0 blockers, got ${validResult.blockers.length}`);
assert(
  hasCode(validResult.info, "SIGNALS_NOT_IMPORTED"),
  "expected Signals info when Signals row present",
);
console.log("  OK: passed=true, blockers=0, Signals info present");

// B. Orphan contact
console.log("B. Orphan contact...");
const orphanImport = baseImport({
  accounts: [SAMPLE_ACCOUNT],
  contacts: [
    {
      contact_email: "orphan@example.com",
      contact_role: "Admin",
      customer_id: "CUST-999",
      do_not_contact: "No",
    },
  ],
});

const orphanResult = validateNormalizedMultisheetImport(orphanImport);
assert(orphanResult.passed === false, "orphan contact should fail validation");
assert(
  hasCode(orphanResult.blockers, "CONTACT_ORPHAN_CUSTOMER_ID"),
  "expected CONTACT_ORPHAN_CUSTOMER_ID blocker",
);
console.log("  OK: orphan contact produces blocker");

// C. Missing Admin
console.log("C. Missing Admin...");
const missingAdminImport = baseImport({
  accounts: [SAMPLE_ACCOUNT],
  contacts: [
    {
      contact_email: "user@customer-001.example.com",
      contact_role: "User",
      customer_id: "CUST-001",
      do_not_contact: "No",
    },
  ],
});

const missingAdminResult = validateNormalizedMultisheetImport(missingAdminImport);
assert(missingAdminResult.passed === true, "missing Admin should not block import");
assert(
  hasCode(missingAdminResult.warnings, "CONTACT_MISSING_ADMIN"),
  "expected CONTACT_MISSING_ADMIN warning",
);
console.log("  OK: missing Admin produces warning only");

// D. Duplicate contact email (global)
console.log("D. Duplicate contact email...");
const duplicateImport = baseImport({
  accounts: [SAMPLE_ACCOUNT],
  contacts: [
    {
      contact_email: "admin@customer-001.example.com",
      contact_role: "Admin",
      customer_id: "CUST-001",
      do_not_contact: "No",
    },
    {
      contact_email: "admin@customer-001.example.com",
      contact_role: "Admin",
      customer_id: "CUST-001",
      do_not_contact: "No",
    },
  ],
});

const duplicateResult = validateNormalizedMultisheetImport(duplicateImport);
assert(duplicateResult.passed === false, "duplicate contact email should fail validation");
assert(
  hasCode(duplicateResult.blockers, "CONTACT_DUPLICATE_EMAIL"),
  "expected CONTACT_DUPLICATE_EMAIL blocker",
);
console.log("  OK: duplicate contact email produces blocker");

// E. do_not_contact Yes
console.log("E. do_not_contact Yes...");
const dncImport = baseImport({
  accounts: [SAMPLE_ACCOUNT],
  contacts: [
    {
      contact_email: "admin@customer-001.example.com",
      contact_role: "Admin",
      customer_id: "CUST-001",
      do_not_contact: "Yes",
    },
  ],
});

const dncResult = validateNormalizedMultisheetImport(dncImport);
assert(dncResult.passed === true, "do_not_contact Yes should not block import");
assert(
  hasCode(dncResult.warnings, "CONTACT_DO_NOT_CONTACT_NOT_PERSISTED"),
  "expected CONTACT_DO_NOT_CONTACT_NOT_PERSISTED warning",
);
assert(
  !hasCode(dncResult.blockers, "CONTACT_DO_NOT_CONTACT_NOT_PERSISTED"),
  "do_not_contact Yes should not be a blocker",
);
console.log("  OK: do_not_contact Yes produces warning only");

// F. Unsupported contact_role warning
console.log("F. Unsupported contact_role...");
const badRoleImport = baseImport({
  accounts: [SAMPLE_ACCOUNT],
  contacts: [
    {
      contact_email: "admin@customer-001.example.com",
      contact_role: "Owner",
      customer_id: "CUST-001",
      do_not_contact: "No",
    },
  ],
});

const badRoleResult = validateNormalizedMultisheetImport(badRoleImport);
assert(badRoleResult.passed === true, "unsupported role should not block import");
assert(
  hasCode(badRoleResult.warnings, "CONTACT_UNSUPPORTED_ROLE"),
  "expected CONTACT_UNSUPPORTED_ROLE warning",
);
console.log("  OK: unsupported contact_role produces warning only");

// G. Signal orphan contact_email blocker
console.log("G. Signal orphan contact_email...");
const orphanSignalImport = baseImport({
  accounts: [SAMPLE_ACCOUNT],
  contacts: [
    {
      contact_email: "admin@customer-001.example.com",
      contact_role: "Admin",
      customer_id: "CUST-001",
      do_not_contact: "No",
    },
  ],
  signals: [
    {
      contact_email: "missing@customer-001.example.com",
      customer_id: "CUST-001",
      sent_at: "2026-06-01T10:00:00Z",
      template_or_type: "invite-reminder",
      channel: "email",
      status: "Delivered",
    },
  ],
});

const orphanSignalResult = validateNormalizedMultisheetImport(orphanSignalImport);
assert(orphanSignalResult.passed === false, "orphan signal contact should fail");
assert(
  hasCode(orphanSignalResult.blockers, "SIGNAL_UNKNOWN_CONTACT_EMAIL"),
  "expected SIGNAL_UNKNOWN_CONTACT_EMAIL blocker",
);
console.log("  OK: orphan signal contact_email produces blocker");

// H. Repeated signal contact_email allowed
console.log("H. Repeated signal contact_email...");
const repeatSignalImport = baseImport({
  accounts: [SAMPLE_ACCOUNT],
  contacts: [
    {
      contact_email: "admin@customer-001.example.com",
      contact_role: "Admin",
      customer_id: "CUST-001",
      do_not_contact: "No",
    },
  ],
  signals: [
    {
      contact_email: "admin@customer-001.example.com",
      customer_id: "CUST-001",
      sent_at: "2026-06-01T10:00:00Z",
      template_or_type: "invite-reminder",
      channel: "email",
      status: "Delivered",
    },
    {
      contact_email: "admin@customer-001.example.com",
      customer_id: "CUST-001",
      sent_at: "2026-06-02T10:00:00Z",
      template_or_type: "welcome",
      channel: "email",
      status: "Delivered",
    },
  ],
});

const repeatSignalResult = validateNormalizedMultisheetImport(repeatSignalImport);
assert(repeatSignalResult.passed === true, "repeated signal emails should pass");
console.log("  OK: repeated Signals.contact_email allowed");

// I. Missing Signals sheet
console.log("I. Missing Signals sheet...");
const noSignalsWorkbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  noSignalsWorkbook,
  XLSX.utils.aoa_to_sheet([["customer_id", "customer_name"], ["CUST-001", "Demo Customer 001"]]),
  "Accounts",
);
XLSX.utils.book_append_sheet(
  noSignalsWorkbook,
  XLSX.utils.aoa_to_sheet([
    ["contact_email", "contact_role", "customer_id"],
    ["admin@customer-001.example.com", "Admin", "CUST-001"],
  ]),
  "Contacts",
);

let parseFailed = false;
try {
  parseTargetMultisheetWorkbook(noSignalsWorkbook);
} catch (error) {
  parseFailed = error instanceof MultisheetParserError;
}
assert(parseFailed, "missing Signals sheet should fail parse");
console.log("  OK: missing Signals sheet rejected at parse");

console.log("OK: import multisheet cross-validation verification passed");
