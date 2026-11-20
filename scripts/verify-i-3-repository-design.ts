/**
 * Phase I-3 — Import persistence repository design verification.
 * Does NOT connect to a database.
 * Run: npx tsx scripts/verify-i-3-repository-design.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const DESIGN_PATH = join(ROOT, "docs/context/phase-i-3-import-repository-design.md");

const REQUIRED_MODULES = [
  "lib/import-persistence/import-batch-repository.ts",
  "lib/import-persistence/customer-account-repository.ts",
  "lib/import-persistence/customer-contact-repository.ts",
  "lib/import-persistence/import-validation-repository.ts",
  "lib/import-persistence/import-persistence-service.ts",
] as const;

const REQUIRED_TRANSACTION_STEPS = [
  "BEGIN",
  "workspace",
  "supersede",
  "deactivate",
  "customer_accounts",
  "customer_contacts",
  "import_validation_results",
  "import_row_issues",
  "COMMIT",
  "ROLLBACK",
] as const;

const REQUIRED_SIGNATURES = [
  "loadActiveImportForWorkspace",
  "applyImportForWorkspace",
  "saveValidationResult",
  "listImportBatches",
  "ActiveImportState",
  "ApplyImportPersistenceInput",
  "ApplyImportPersistenceResult",
  "ImportBatchSummary",
  "PersistedImportIssue",
] as const;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

function main(): void {
  console.log("Phase I-3 — Import Persistence Repository Design Verification\n");

  assert(existsSync(DESIGN_PATH), `design doc must exist: ${DESIGN_PATH}`);

  const doc = readFileSync(DESIGN_PATH, "utf8");
  const lower = doc.toLowerCase();

  console.log("1. Design doc exists...");
  assert(
    doc.includes("Phase I-3") && doc.includes("Repository Design"),
    "doc must be titled Phase I-3 repository design",
  );
  console.log("  OK: phase-i-3-import-repository-design.md");

  console.log("2. Repository module names...");
  for (const modulePath of REQUIRED_MODULES) {
    assert(doc.includes(modulePath), `design doc must mention ${modulePath}`);
  }
  console.log(`  OK: ${REQUIRED_MODULES.length} planned modules`);

  console.log("3. Transaction steps...");
  for (const step of REQUIRED_TRANSACTION_STEPS) {
    assert(lower.includes(step.toLowerCase()), `design doc must mention transaction step: ${step}`);
  }
  console.log("  OK: apply transaction documented");

  console.log("4. Workspace server-side resolution...");
  assert(
    lower.includes("default_workspace_id") || lower.includes("getdefaultworkspaceid"),
    "must document DEFAULT_WORKSPACE_ID / getDefaultWorkspaceId",
  );
  assert(
    doc.includes("never") && lower.includes("client"),
    "must document client must not send trusted workspace_id",
  );
  assert(lower.includes("upload_customer_data"), "must document upload_customer_data permission");
  console.log("  OK: workspace + auth documented");

  console.log("5. Privacy guards...");
  assert(
    lower.includes("no raw workbook") || lower.includes("no raw workbook storage"),
    "must document no raw workbook storage",
  );
  assert(
    !lower.includes("enable sendgrid") && !lower.includes("sendgrid send"),
    "must not enable SendGrid",
  );
  assert(
    lower.includes("communication logs") &&
      (lower.includes("not") || lower.includes("no ") || lower.includes("unchanged")),
    "must document Communication Logs not persisted in I-3",
  );
  console.log("  OK: no raw workbook; no SendGrid; Communication Logs unchanged");

  console.log("6. Type signatures...");
  for (const sig of REQUIRED_SIGNATURES) {
    assert(doc.includes(sig), `design doc must propose type/signature: ${sig}`);
  }
  console.log("  OK: API signatures documented");

  console.log("7. Disabled behavior...");
  assert(lower.includes("database_url"), "must document DATABASE_URL gate");
  assert(
    lower.includes("disabled") || lower.includes("shouldpersistimport"),
    "must document disabled persistence behavior",
  );
  console.log("  OK: config/disabled behavior documented");

  console.log("8. Mapping design...");
  assert(doc.includes("account_id") && doc.includes("customer_id"), "must map account_id → customer_id");
  assert(doc.includes("ImportedContact"), "must map to ImportedContact");
  assert(lower.includes("normalizecontactemail"), "must mention email normalization");
  console.log("  OK: DB ↔ app mapping documented");

  console.log("9. I-5 readiness decision...");
  assert(
    lower.includes("ready for i-5") ||
      lower.includes("i-5 api") ||
      lower.includes("ready for i-4"),
    "must include I-5 or I-4 readiness decision",
  );
  console.log("  OK: I-5 readiness noted");

  console.log("\nPhase I-3 repository design verification passed.");
  console.log("Note: No repository code or database connection was used.");
}

main();
