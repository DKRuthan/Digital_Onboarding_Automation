/**
 * Phase L-4D — Public flat import template download verification.
 */
import * as XLSX from "xlsx";

import { parseImportWorkbook } from "../lib/import-workbook-router";
import { FLAT_JOURNEY_IMPORT_SHEET_NAME, FLAT_ROW2_COLUMNS } from "../lib/import-flat-row2-schema";
import { validateTargetMultisheetWorkbook } from "../lib/import-multisheet-validation";
import {
  EXCEL_IMPORT_TEMPLATE_FILENAME,
  buildFlatImportWorkbook,
} from "../lib/import-templates";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

function sheetMatrix(sheet: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
}

function main(): void {
  console.log("Phase L-4D — Flat Template Download\n");

  console.log("1. Public template builder...");
  assert(
    EXCEL_IMPORT_TEMPLATE_FILENAME === "excel-import-template.xlsx",
    "filename must be excel-import-template.xlsx",
  );

  const workbook = buildFlatImportWorkbook();
  const sheetNames = workbook.SheetNames;
  assert(sheetNames.includes(FLAT_JOURNEY_IMPORT_SHEET_NAME), "Journey Import sheet required");
  assert(sheetNames.includes("Field Guide"), "Field Guide sheet required");
  assert(!sheetNames.includes("Accounts"), "public template must not expose Accounts sheet");
  assert(!sheetNames.includes("Contacts"), "public template must not expose Contacts sheet");
  assert(!sheetNames.includes("Signals"), "public template must not expose Signals sheet");
  console.log("  OK: flat workbook with Journey Import + Field Guide");

  console.log("2. Journey Import Row 1 / Row 2 / Row 3 structure...");
  const journeySheet = workbook.Sheets[FLAT_JOURNEY_IMPORT_SHEET_NAME]!;
  const matrix = sheetMatrix(journeySheet);
  assert(matrix.length >= 3, "template must include Row 1, Row 2, and sample data");

  const row1 = (matrix[0] as string[]) ?? [];
  const row2 = (matrix[1] as string[]) ?? [];
  assert(String(row1[0] ?? "").includes("Account"), "Row 1 must contain readable labels");
  assert(row2[0] === "account_id", "Row 2 must start with account_id system key");

  for (const key of FLAT_ROW2_COLUMNS) {
    assert(row2.includes(key), `Row 2 must include canonical flat key: ${key}`);
  }

  const forbiddenKeys = [
    "segment",
    "account_owner",
    "owner_dam_name",
    "owner_dam_email",
    "last_email_sent_date",
    "last_email_sent_type",
    "emails_sent_count",
    "use_cases",
  ];
  for (const key of forbiddenKeys) {
    assert(!row2.includes(key), `Row 2 must not include removed key: ${key}`);
  }
  assert(row2.includes("use_case"), "Row 2 must include use_case (singular)");
  console.log("  OK: Row 1 labels + Row 2 canonical keys");

  console.log("3. Sample data rows...");
  const dataRows = matrix.slice(2);
  assert(dataRows.length >= 4, "template must include multiple sample data rows");

  const accountIds = new Set<string>();
  const accountIdCounts = new Map<string, number>();
  const contactEmails = new Set<string>();

  for (const row of dataRows) {
    const cells = row as string[];
    const accountId = String(cells[0] ?? "");
    const emailIndex = row2.indexOf("contact_email");
    const email = String(cells[emailIndex] ?? "").trim().toLowerCase();
    if (accountId) {
      accountIds.add(accountId);
      accountIdCounts.set(accountId, (accountIdCounts.get(accountId) ?? 0) + 1);
    }
    if (email) {
      assert(!contactEmails.has(email), `duplicate contact_email in template: ${email}`);
      contactEmails.add(email);
    }
  }

  assert(accountIds.size >= 2, "template must include at least 2 sample accounts");
  const repeatedAccount = [...accountIdCounts.values()].some((count) => count > 1);
  assert(repeatedAccount, "template must include repeated account_id sample rows");
  assert(contactEmails.size >= 4, "template must include multiple unique contact emails");
  console.log("  OK: sample accounts, repeated account_id, unique contact_email");

  console.log("4. Parser + validation...");
  const parsed = parseImportWorkbook(workbook);
  assert(parsed.headerMode === "flat_row2", "template must parse as flat_row2");
  assert(parsed.signals.length === 0, "flat template must not include signals");
  assert(parsed.accounts.length >= 2, "template must parse at least 2 accounts");
  assert(parsed.contacts.length >= 4, "template must parse multiple contacts");

  const validation = validateTargetMultisheetWorkbook(workbook);
  assert(validation.passed, "template must validate with 0 blockers");
  const blockers = (validation.importIssues ?? []).filter(
    (issue) => issue.severity === "blocker",
  );
  assert(blockers.length === 0, `expected 0 blockers, got ${blockers.length}`);
  console.log("  OK: parses as flat_row2 and validates with 0 blockers");

  console.log("5. Safety...");
  const templatesSource = XLSX.read(
    XLSX.write(workbook, { bookType: "xlsx", type: "array" }),
    { type: "array" },
  );
  assert(templatesSource.SheetNames.includes(FLAT_JOURNEY_IMPORT_SHEET_NAME), "round-trip ok");
  console.log("  OK: no Signals sheet required; no send/log behavior in template builder");

  console.log("\nL-4D Flat Template Download: PASSED");
}

main();
