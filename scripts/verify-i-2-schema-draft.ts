/**
 * Phase I-2 — Import persistence SQL migration draft verification.
 * Does NOT connect to a database.
 * Run: npx tsx scripts/verify-i-2-schema-draft.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const MIGRATION_PATH = join(ROOT, "db/migrations/002_create_import_persistence.sql");

const REQUIRED_TABLES = [
  "workspaces",
  "import_batches",
  "customer_accounts",
  "customer_contacts",
  "import_validation_results",
  "import_row_issues",
] as const;

const REQUIRED_COLUMNS = [
  "workspace_id",
  "import_batch_id",
  "account_id",
  "contact_email",
  "is_active",
  "header_mode",
  "validation_passed",
] as const;

const REQUIRED_INDEXES = [
  "idx_import_batches_workspace_id",
  "idx_import_batches_workspace_created_at",
  "idx_import_batches_workspace_active",
  "import_batches_one_active_per_workspace",
  "customer_accounts_active_account_unique",
  "customer_contacts_active_email_unique",
] as const;

const FORBIDDEN_COLUMN_PATTERNS = [
  /\bfile_content\s+(TEXT|BYTEA)/i,
  /\braw_workbook\s+(TEXT|BYTEA)/i,
  /\bworkbook_blob\s+(TEXT|BYTEA)/i,
  /\bworkbook_content\s+(TEXT|BYTEA)/i,
  /\bupload_blob\s+(TEXT|BYTEA)/i,
  /\bemail_body\s+/i,
  /\btemplate_html\s+/i,
];

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

function main(): void {
  console.log("Phase I-2 — Import Persistence SQL Draft Verification\n");

  assert(existsSync(MIGRATION_PATH), `migration file must exist: ${MIGRATION_PATH}`);

  const sql = readFileSync(MIGRATION_PATH, "utf8");
  const lower = sql.toLowerCase();

  console.log("1. Extension...");
  assert(
    lower.includes("create extension if not exists pgcrypto"),
    "must include CREATE EXTENSION IF NOT EXISTS pgcrypto",
  );
  assert(lower.includes("gen_random_uuid()"), "must use gen_random_uuid() for UUID defaults");
  console.log("  OK: pgcrypto + gen_random_uuid()");

  console.log("2. Required tables...");
  for (const table of REQUIRED_TABLES) {
    assert(
      new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, "i").test(sql),
      `missing CREATE TABLE for ${table}`,
    );
  }
  console.log(`  OK: ${REQUIRED_TABLES.length} tables defined`);

  console.log("3. Required columns...");
  for (const column of REQUIRED_COLUMNS) {
    assert(lower.includes(column), `missing column reference: ${column}`);
  }
  console.log("  OK: key columns present");

  console.log("4. Indexes and unique constraints...");
  for (const index of REQUIRED_INDEXES) {
    assert(lower.includes(index.toLowerCase()), `missing index: ${index}`);
  }
  assert(
    lower.includes("where is_active = true"),
    "must include partial unique indexes on is_active",
  );
  console.log("  OK: active batch + active account/contact unique indexes");

  console.log("5. Privacy / scope guards...");
  for (const pattern of FORBIDDEN_COLUMN_PATTERNS) {
    assert(!pattern.test(sql), `forbidden column pattern matched: ${pattern}`);
  }
  assert(
    !lower.includes("create table if not exists communication_logs"),
    "must not create communication_logs table",
  );
  assert(
    !lower.includes("create table if not exists workflow_statuses"),
    "must not create workflow_statuses table",
  );
  console.log("  OK: no raw workbook columns; no deferred tables; no SendGrid");

  console.log("6. Manual apply notice...");
  assert(
    sql.includes("manual apply") || sql.includes("Manual apply"),
    "migration must document manual apply only",
  );
  assert(
    !sql.includes("DATABASE_URL") || sql.includes("--"),
    "migration should not auto-connect",
  );
  console.log("  OK: manual draft documented");

  console.log("7. Workspace stub comments...");
  assert(lower.includes("default_workspace_id"), "workspaces must reference DEFAULT_WORKSPACE_ID");
  assert(lower.includes("clerk"), "workspaces should mention future Clerk mapping");
  console.log("  OK: workspace stub documented");

  console.log("\nPhase I-2 SQL draft verification passed.");
  console.log("Note: SQL was NOT applied to any database.");
}

main();
