/**
 * Phase L-4B — Flat single-sheet Row 2 import parser verification.
 * Run: npx tsx scripts/verify-flat-row2-import.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";

import { detectImportFormatFromWorkbook } from "../lib/import-format-detection";
import {
  buildFlatRow2Workbook20Accounts,
  buildFlatRow2WorkbookSmall,
  FLAT_ROW2_20_ACCOUNTS_WORKBOOK_FILENAME,
  FLAT_ROW2_SMALL_WORKBOOK_FILENAME,
} from "../lib/import-flat-row2-fixture";
import {
  FLAT_JOURNEY_IMPORT_SHEET_NAME,
  FLAT_ROW2_COLUMNS,
  validateFlatRow2Headers,
} from "../lib/import-flat-row2-schema";
import { parseFlatRow2Workbook } from "../lib/import-flat-row2-parser";
import { parseTargetMultisheetWorkbook } from "../lib/import-multisheet-parser";
import { buildRow2MultisheetWorkbook } from "../lib/import-row2-fixture";
import { normalizeContactEmail } from "../lib/import-contact-email";
import { sendLogs as demoSendLogs } from "../lib/mock-data";

const ROOT = join(import.meta.dirname ?? __dirname, "..");

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

function hasSendGridInSource(relativePath: string): boolean {
  const content = readFileSync(join(ROOT, relativePath), "utf8");
  return content.includes("sendgrid") || content.includes("SendGrid");
}

console.log("Phase L-4B — Flat Row 2 Import Parser\n");
console.log("═".repeat(60));

// 1. Small flat workbook structure
console.log("\n[1] Small flat workbook (2 accounts, 3 contacts)");
const smallWorkbook = buildFlatRow2WorkbookSmall();
const smallSheet = smallWorkbook.Sheets[FLAT_JOURNEY_IMPORT_SHEET_NAME];
assert(Boolean(smallSheet), "Journey Import sheet must exist");
const smallMatrix = XLSX.utils.sheet_to_json<unknown[]>(smallSheet!, {
  header: 1,
  defval: "",
});
assert(
  String(smallMatrix[0]?.[0] ?? "").length > 0,
  "Row 1 must contain human labels",
);
assert(smallMatrix[1]?.[0] === "account_id", "Row 2 must contain system keys");
assert(
  String(smallMatrix[2]?.[0] ?? "") === "ACCT-001",
  "Row 3 must start data",
);
assert(
  smallWorkbook.SheetNames.includes("Field Guide"),
  "Field Guide sheet should be present in fixture",
);
console.log("  OK: Row 1/2/3 structure + Field Guide");

// 2. Format detection
console.log("\n[2] Format detection");
const smallParsedHeaders = (smallMatrix[1] as string[]).map((cell) =>
  String(cell ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_"),
);
const formatResult = detectImportFormatFromWorkbook({
  fileName: "flat-test.xlsx",
  sheetNames: smallWorkbook.SheetNames,
  journeyImportHeaders: smallParsedHeaders,
  headerMode: "flat_row2",
});
assert(formatResult.headerMode === "flat_row2", "expected flat_row2 headerMode");
assert(
  formatResult.label === "Flat Row 2 workbook",
  `expected Flat Row 2 label, got ${formatResult.label}`,
);
console.log("  OK: flat_row2 format detected");

// 3. Parse small workbook
console.log("\n[3] Parse small flat workbook");
const smallParsed = parseFlatRow2Workbook(smallWorkbook);
assert(smallParsed.headerMode === "flat_row2", "headerMode must be flat_row2");
assert(smallParsed.accounts.length === 2, `expected 2 accounts, got ${smallParsed.accounts.length}`);
assert(smallParsed.contacts.length === 3, `expected 3 contacts, got ${smallParsed.contacts.length}`);
assert(smallParsed.signals.length === 0, "signals must be empty for flat import");
console.log("  OK: 2 accounts, 3 contacts, 0 signals");

// 4. account_id deduplication
console.log("\n[4] account_id deduplication");
const acct001Rows = smallParsed.accounts.filter((a) => a.customer_id === "ACCT-001");
assert(acct001Rows.length === 1, "ACCT-001 should dedupe to one account");
assert(
  smallParsed.accounts[0]!.customer_name === "Acme Corporation",
  "first account row wins for account_name",
);
console.log("  OK: repeated account_id deduped; first row wins");

// 5. Field mappings
console.log("\n[5] Field mappings");
const acme = smallParsed.accounts.find((a) => a.customer_id === "ACCT-001");
assert(acme?.customer_id === "ACCT-001", "account_id -> customer_id");
assert(acme?.customer_name === "Acme Corporation", "account_name -> customer_name");
assert(acme?.stage === "Adoption", "journey_stage -> stage");
assert(acme?.icp === "Enterprise Security", "primary_icp -> icp");
assert(acme?.seats_total === "10", "seats_purchased -> seats_total");
assert(acme?.usage_sessions === "100", "total_sessions -> usage_sessions");
const adminContact = smallParsed.contacts.find((c) => c.contact_email === "admin@acme.com");
assert(Boolean(adminContact), "admin contact present");
assert(
  adminContact!.contact_email === normalizeContactEmail("admin@acme.com"),
  "contact_email normalized",
);
assert(adminContact!.customer_id === "ACCT-001", "contact linked to account_id");
console.log("  OK: account and contact mappings");

// 6. 20-account workbook
console.log("\n[6] 20-account flat workbook");
const workbook20 = buildFlatRow2Workbook20Accounts();
const parsed20 = parseFlatRow2Workbook(workbook20);
assert(parsed20.accounts.length === 20, `expected 20 accounts, got ${parsed20.accounts.length}`);
assert(parsed20.contacts.length === 45, `expected 45 contacts, got ${parsed20.contacts.length}`);
assert(parsed20.signals.length === 0, "no signals from flat import");
const uniqueEmails = new Set(parsed20.contacts.map((c) => c.contact_email));
assert(
  uniqueEmails.size === parsed20.contacts.length,
  "all contact emails unique in fixture",
);
console.log("  OK: 20 accounts / 45 contacts");

// 7. Write smoke files
console.log("\n[7] Write smoke workbook files");
XLSX.writeFile(smallWorkbook, join(ROOT, FLAT_ROW2_SMALL_WORKBOOK_FILENAME));
XLSX.writeFile(workbook20, join(ROOT, FLAT_ROW2_20_ACCOUNTS_WORKBOOK_FILENAME));
console.log(`  Wrote: ${FLAT_ROW2_SMALL_WORKBOOK_FILENAME}`);
console.log(`  Wrote: ${FLAT_ROW2_20_ACCOUNTS_WORKBOOK_FILENAME}`);

// 8. Field Guide ignored
console.log("\n[8] Field Guide ignored");
assert(
  !smallParsed.sheetHeaders.accounts.includes("sheet"),
  "Field Guide must not affect parsed headers",
);
console.log("  OK: Field Guide ignored");

// 9. Parser header validation
console.log("\n[9] Parser header validation");
const dupHeaders = [...FLAT_ROW2_COLUMNS];
dupHeaders[1] = "account_id";
const dupValidation = validateFlatRow2Headers(dupHeaders);
assert(!dupValidation.valid, "duplicate Row 2 key should fail validation");
assert(
  dupValidation.errors.some((e) => e.includes("duplicate")),
  "expected duplicate key error",
);
console.log("  OK: duplicate Row 2 system key rejected");

// 10. L-2 multi-sheet still works
console.log("\n[10] L-2 multi-sheet backward compatibility");
const multisheet = buildRow2MultisheetWorkbook();
const multiParsed = parseTargetMultisheetWorkbook(multisheet);
assert(multiParsed.headerMode === "row2", "multi-sheet must remain row2");
assert(multiParsed.accounts.length === 2, "multi-sheet accounts unchanged");
assert(multiParsed.contacts.length === 3, "multi-sheet contacts unchanged");
console.log("  OK: L-2 multi-sheet parser unchanged");

// 11. Safety
console.log("\n[11] Safety");
assert(
  !hasSendGridInSource("lib/import-flat-row2-parser.ts"),
  "flat parser must not call SendGrid",
);
assert(demoSendLogs.length > 0, "demo send logs exist independently");
assert(smallParsed.signals.length === 0, "no signals created from flat import");
console.log("  OK: no SendGrid; no signals/logs from flat import");

console.log("\n" + "═".repeat(60));
console.log("L-4B Flat Row 2 Import Parser: PASSED");
console.log("═".repeat(60));
console.log("\nDecision: READY for L-4C flat validation");
