import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";

import { detectImportFormatFromWorkbook } from "../lib/import-format-detection";
import {
  buildImportedContactsFromNormalized,
} from "../lib/imported-contacts";
import { validateNormalizedMultisheetImport } from "../lib/import-multisheet-cross-validation";
import {
  MultisheetParserError,
  parseTargetMultisheetWorkbook,
} from "../lib/import-multisheet-parser";
import { validateTargetMultisheetWorkbook } from "../lib/import-multisheet-validation";
import {
  ROW2_ACCOUNTS_COLUMNS,
  ROW2_CONTACTS_COLUMNS,
  ROW2_SIGNALS_COLUMNS,
} from "../lib/import-row2-schema";
import {
  buildRow2MultisheetWorkbook,
  buildRow2SystemImportWorkbook20Accounts,
  ROW2_SYSTEM_IMPORT_TEMPLATE_FILENAME,
} from "../lib/import-row2-fixture";
import { parseImportWorkbook } from "../lib/import-workbook-router";
import { FLAT_JOURNEY_IMPORT_SHEET_NAME } from "../lib/import-flat-row2-schema";
import {
  buildFlatImportWorkbook,
  buildLegacyMultisheetWorkbook,
  buildTargetMultisheetWorkbook,
} from "../lib/import-templates";

const ROOT = join(import.meta.dirname ?? __dirname, "..");

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

function hasCode(issues: { code: string }[], code: string): boolean {
  return issues.some((issue) => issue.code === code);
}

function buildInvalidRow2WorkbookMissingHeader(): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["Account ID", "Account Name"],
      ["", ""],
      ["ACCT-001", "Acme"],
    ]),
    "Accounts",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["Contact Email", "Contact Role", "Account ID"],
      ["contact_email", "contact_role", "account_id"],
      ["admin@acme.com", "Admin", "ACCT-001"],
    ]),
    "Contacts",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["Contact Email", "Account ID", "Sent At", "Template Or Type", "Channel", "Status"],
      [...ROW2_SIGNALS_COLUMNS],
      ["admin@acme.com", "ACCT-001", "2026-06-01", "welcome", "email", "Delivered"],
    ]),
    "Signals",
  );
  return workbook;
}

function buildInvalidRow2WorkbookDuplicateKey(): XLSX.WorkBook {
  const workbook = buildRow2MultisheetWorkbook();
  const sheet = workbook.Sheets.Accounts;
  if (!sheet) return workbook;

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
  });
  const headerRow = matrix[1] as string[];
  headerRow[0] = "account_id";
  headerRow[1] = "account_id";
  workbook.Sheets.Accounts = XLSX.utils.aoa_to_sheet(matrix as string[][]);
  return workbook;
}

function buildInvalidRow2WorkbookMissingRequiredKey(): XLSX.WorkBook {
  const workbook = buildRow2MultisheetWorkbook();
  const sheet = workbook.Sheets.Accounts;
  if (!sheet) return workbook;

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
  });
  const headerRow = matrix[1] as string[];
  const dataRows = matrix.slice(2);
  const trimmedHeaders = headerRow.filter((key) => key !== "account_name");
  const trimmedData = dataRows.map((row) => {
    const cells = row as string[];
    return [cells[0], ...cells.slice(2)];
  });
  workbook.Sheets.Accounts = XLSX.utils.aoa_to_sheet([
    matrix[0],
    trimmedHeaders,
    ...trimmedData,
  ] as string[][]);
  return workbook;
}

// 1. Row 2 compact workbook parses
console.log("1. Row 2 compact workbook...");
const row2Workbook = buildRow2MultisheetWorkbook();
const parsed = parseTargetMultisheetWorkbook(row2Workbook);

assert(parsed.headerMode === "row2", `expected row2 headerMode, got ${parsed.headerMode}`);
assert(parsed.accounts.length === 2, `expected 2 accounts, got ${parsed.accounts.length}`);
assert(parsed.contacts.length === 3, `expected 3 contacts, got ${parsed.contacts.length}`);
assert(parsed.signals.length === 1, `expected 1 signal, got ${parsed.signals.length}`);
assert(
  parsed.sheetHeaders.accounts.includes("account_id"),
  "Accounts headers should include account_id from Row 2",
);
assert(
  !parsed.sheetHeaders.accounts.includes("customer_id"),
  "Accounts headers should not use customer_id in Row 2 mode",
);
assert(
  parsed.accounts[0]?.customer_id === "ACCT-001",
  `account_id should map to customer_id ACCT-001, got ${parsed.accounts[0]?.customer_id}`,
);
assert(
  parsed.accounts[0]?.customer_name === "Acme Corporation",
  `account_name should map to customer_name, got ${parsed.accounts[0]?.customer_name}`,
);
assert(
  parsed.accounts[0]?.stage === "Onboarding",
  `journey_stage should map to stage, got ${parsed.accounts[0]?.stage}`,
);
assert(
  parsed.contacts[0]?.customer_id === "ACCT-001",
  `contact account_id should map to customer_id, got ${parsed.contacts[0]?.customer_id}`,
);
assert(
  parsed.signals[0]?.customer_id === "ACCT-002",
  `signal account_id should map to customer_id, got ${parsed.signals[0]?.customer_id}`,
);
console.log("  OK: Row 2 parsing and account_id mapping");

// 2. Row 1 labels ignored — data starts Row 3
console.log("2. Row 1 ignored, data starts Row 3...");
const accountsSheet = row2Workbook.Sheets.Accounts;
const matrix = XLSX.utils.sheet_to_json<unknown[]>(accountsSheet!, {
  header: 1,
  defval: "",
});
assert(
  String(matrix[0]?.[0] ?? "").includes("Account"),
  "Row 1 should contain display labels",
);
assert(matrix[1]?.[0] === "account_id", "Row 2 should contain system keys");
assert(
  parsed.accounts[0]?.customer_name === "Acme Corporation",
  "First data row should be Row 3, not Row 1 labels",
);
console.log("  OK: Row 1 ignored, Row 3 is first data row");

// 3. 20-account workbook
console.log("3. 20-account Row 2 workbook...");
const workbook20 = buildRow2SystemImportWorkbook20Accounts();
const parsed20 = parseTargetMultisheetWorkbook(workbook20);
const validation20 = validateTargetMultisheetWorkbook(workbook20);

assert(parsed20.accounts.length === 20, `expected 20 accounts, got ${parsed20.accounts.length}`);
assert(parsed20.contacts.length === 40, `expected 40 contacts, got ${parsed20.contacts.length}`);
assert(parsed20.signals.length === 20, `expected 20 signals, got ${parsed20.signals.length}`);
assert(validation20.passed === true, "20-account workbook should pass validation");
assert(
  validation20.importedContacts?.length === 40,
  `expected 40 imported contacts, got ${validation20.importedContacts?.length}`,
);
console.log("  OK: 20 accounts / 40 contacts / signals validate");

// 4. Write runtime smoke workbook file
console.log("4. Write Row 2 smoke workbook file...");
const workbookPath = join(ROOT, ROW2_SYSTEM_IMPORT_TEMPLATE_FILENAME);
XLSX.writeFile(workbook20, workbookPath);
console.log(`  OK: wrote ${ROW2_SYSTEM_IMPORT_TEMPLATE_FILENAME}`);

// 5. Format detection
console.log("5. Format detection...");
const format = detectImportFormatFromWorkbook({
  fileName: ROW2_SYSTEM_IMPORT_TEMPLATE_FILENAME,
  sheetNames: workbook20.SheetNames,
  accountsHeaders: parsed20.sheetHeaders.accounts,
  contactsHeaders: parsed20.sheetHeaders.contacts,
  signalsHeaders: parsed20.sheetHeaders.signals,
  headerMode: "row2",
});
assert(format.format === "option_c", `expected option_c, got ${format.format}`);
assert(format.headerMode === "row2", "format detection should report row2");
console.log("  OK: Row 2 workbook detected");

// 6. Missing Row 2 header blocker
console.log("6. Missing Row 2 header blocker...");
const missingHeaderWorkbook = buildInvalidRow2WorkbookMissingHeader();
let missingHeaderParsed;
try {
  missingHeaderParsed = parseTargetMultisheetWorkbook(missingHeaderWorkbook);
} catch (error) {
  assert(
    error instanceof MultisheetParserError,
    "missing Row 2 should throw parser error or fail validation",
  );
  missingHeaderParsed = null;
}
if (missingHeaderParsed) {
  const missingHeaderValidation = validateNormalizedMultisheetImport(missingHeaderParsed);
  assert(
    missingHeaderValidation.passed === false,
    "missing Row 2 keys should fail validation",
  );
  assert(
    hasCode(missingHeaderValidation.blockers, "SHEET_MISSING_REQUIRED_COLUMN") ||
      hasCode(missingHeaderValidation.blockers, "SHEET_MISSING_ROW2_HEADER"),
    "expected missing Row 2 header blocker",
  );
}
console.log("  OK: missing Row 2 header blocked");

// 7. Duplicate Row 2 system key blocker
console.log("7. Duplicate Row 2 system key blocker...");
const duplicateKeyWorkbook = buildInvalidRow2WorkbookDuplicateKey();
const duplicateKeyParsed = parseTargetMultisheetWorkbook(duplicateKeyWorkbook);
const duplicateKeyValidation = validateNormalizedMultisheetImport(duplicateKeyParsed);
assert(duplicateKeyValidation.passed === false, "duplicate Row 2 key should fail");
assert(
  hasCode(duplicateKeyValidation.blockers, "SHEET_DUPLICATE_HEADER_KEY"),
  "expected duplicate header key blocker",
);
console.log("  OK: duplicate Row 2 system key blocked");

// 8. Missing required Row 2 key blocker
console.log("8. Missing required Row 2 key blocker...");
const missingKeyWorkbook = buildInvalidRow2WorkbookMissingRequiredKey();
const missingKeyParsed = parseTargetMultisheetWorkbook(missingKeyWorkbook);
const missingKeyValidation = validateNormalizedMultisheetImport(missingKeyParsed);
assert(missingKeyValidation.passed === false, "missing required Row 2 key should fail");
assert(
  hasCode(missingKeyValidation.blockers, "SHEET_MISSING_REQUIRED_COLUMN"),
  "expected missing required Row 2 key blocker",
);
console.log("  OK: missing required Row 2 key blocked");

// 9. Duplicate contact_email remains blocker
console.log("9. Duplicate contact_email blocker...");
const dupContactsWorkbook = buildRow2MultisheetWorkbook();
const dupSheet = dupContactsWorkbook.Sheets.Contacts;
const dupMatrix = XLSX.utils.sheet_to_json<unknown[]>(dupSheet!, {
  header: 1,
  defval: "",
});
dupMatrix.push([
  "dup@example.com",
  "Admin",
  "Dup",
  "No",
  "ACCT-001",
  "Acme Corporation",
  "Customer",
  "Dup",
]);
dupMatrix.push([
  "dup@example.com",
  "User",
  "Dup Two",
  "No",
  "ACCT-001",
  "Acme Corporation",
  "Customer",
  "Dup",
]);
dupContactsWorkbook.Sheets.Contacts = XLSX.utils.aoa_to_sheet(
  dupMatrix as string[][],
);
const dupParsed = parseTargetMultisheetWorkbook(dupContactsWorkbook);
const dupValidation = validateNormalizedMultisheetImport(dupParsed);
assert(dupValidation.passed === false, "duplicate contact_email should fail");
assert(
  hasCode(dupValidation.blockers, "CONTACT_DUPLICATE_EMAIL"),
  "expected duplicate contact_email blocker",
);
console.log("  OK: duplicate contact_email blocked");

// 10. Repeated signal contact_email allowed; signals do not create contacts
console.log("10. Signals behavior...");
const signalRepeatWorkbook = buildRow2MultisheetWorkbook();
const signalSheet = signalRepeatWorkbook.Sheets.Signals;
const signalMatrix = XLSX.utils.sheet_to_json<unknown[]>(signalSheet!, {
  header: 1,
  defval: "",
});
signalMatrix.push([
  "it-admin@brightpath.io",
  "ACCT-002",
  "2026-06-02T10:00:00Z",
  "welcome",
  "email",
  "Delivered",
]);
signalRepeatWorkbook.Sheets.Signals = XLSX.utils.aoa_to_sheet(
  signalMatrix as string[][],
);
const signalRepeatParsed = parseTargetMultisheetWorkbook(signalRepeatWorkbook);
const signalRepeatValidation = validateNormalizedMultisheetImport(signalRepeatParsed);
assert(signalRepeatValidation.passed === true, "repeated signal emails should pass");
const importedContacts = buildImportedContactsFromNormalized(signalRepeatParsed);
assert(
  importedContacts.length === signalRepeatParsed.contacts.length,
  "signals should not create contacts",
);
console.log("  OK: repeated signal contact_email allowed; signals do not create contacts");

// 11. Legacy L-1 workbook still parses
console.log("11. Legacy single-row fallback...");
const legacyWorkbook = buildLegacyMultisheetWorkbook();
const legacyParsed = parseTargetMultisheetWorkbook(legacyWorkbook);
assert(
  legacyParsed.headerMode === "legacy_single_row",
  `expected legacy_single_row, got ${legacyParsed.headerMode}`,
);
assert(
  legacyParsed.accounts[0]?.customer_id === "CUST-001",
  "legacy customer_id should still parse",
);
console.log("  OK: legacy single-row headers supported as fallback");

// 12. No SendGrid / send routes added (static grep guard)
console.log("12. No SendGrid additions in parser layer...");
const parserSource = readRepoFile("lib/import-multisheet-parser.ts");
assert(!parserSource.includes("sendgrid"), "parser should not call SendGrid");
assert(!parserSource.includes("sendApproved"), "parser should not send emails");
console.log("  OK: parser layer has no send integration");

// 13. Generated download template (L-4D public flat template)
console.log("13. Generated download template...");
const templateWorkbook = buildFlatImportWorkbook();
const templateParsed = parseImportWorkbook(templateWorkbook);
const templateValidation = validateTargetMultisheetWorkbook(templateWorkbook);

assert(
  templateWorkbook.SheetNames.includes("Field Guide"),
  "download template should include Field Guide sheet",
);
assert(
  templateWorkbook.SheetNames.includes(FLAT_JOURNEY_IMPORT_SHEET_NAME),
  "download template should include Journey Import sheet",
);
assert(
  templateParsed.headerMode === "flat_row2",
  `download template should parse as flat_row2, got ${templateParsed.headerMode}`,
);
assert(templateValidation.passed === true, "download template should pass validation");

const templateJourneySheet = templateWorkbook.Sheets[FLAT_JOURNEY_IMPORT_SHEET_NAME];
const templateMatrix = XLSX.utils.sheet_to_json<unknown[]>(templateJourneySheet!, {
  header: 1,
  defval: "",
});
assert(
  String(templateMatrix[0]?.[0] ?? "").includes("Account"),
  "Row 1 should contain human-friendly labels",
);
assert(templateMatrix[1]?.[0] === "account_id", "Row 2 should contain system keys");
assert(
  templateMatrix[2]?.[0] === "ACCT-001",
  "first data row should start at Row 3",
);
console.log("  OK: public download template uses flat Journey Import Row 1/2/3");

console.log("13b. Internal L-2 multi-sheet template...");
const l2TemplateWorkbook = buildTargetMultisheetWorkbook();
const l2TemplateParsed = parseTargetMultisheetWorkbook(l2TemplateWorkbook);
assert(
  l2TemplateParsed.headerMode === "row2",
  `L-2 internal template should parse as row2, got ${l2TemplateParsed.headerMode}`,
);

for (const key of ROW2_ACCOUNTS_COLUMNS) {
  assert(
    l2TemplateParsed.sheetHeaders.accounts.includes(key),
    `Accounts Row 2 keys must include ${key}`,
  );
}
for (const key of ROW2_CONTACTS_COLUMNS) {
  assert(
    l2TemplateParsed.sheetHeaders.contacts.includes(key),
    `Contacts Row 2 keys must include ${key}`,
  );
}
for (const key of ROW2_SIGNALS_COLUMNS) {
  assert(
    l2TemplateParsed.sheetHeaders.signals.includes(key),
    `Signals Row 2 keys must include ${key}`,
  );
}
console.log("  OK: L-2 internal template Row 2 keys retained for fallback");

function readRepoFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

console.log("OK: Row 2 header import verification passed");
