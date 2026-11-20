/**
 * Phase I-4A — Import persistence repository foundation verification.
 * Does NOT connect to a database.
 * Run: npx tsx scripts/verify-i-4a-import-persistence-foundation.ts
 */
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");

const REQUIRED_FILES = [
  "lib/import-persistence/import-persistence-env.ts",
  "lib/import-persistence/import-persistence-db.ts",
  "lib/import-persistence/import-persistence-types.ts",
  "lib/import-persistence/import-persistence-mappers.ts",
  "lib/import-persistence/import-persistence-transaction.ts",
  "lib/import-persistence/import-batch-repository.ts",
  "lib/import-persistence/customer-account-repository.ts",
  "lib/import-persistence/customer-contact-repository.ts",
  "lib/import-persistence/import-validation-repository.ts",
  "lib/import-persistence/import-persistence-service.ts",
] as const;

const SERVER_ONLY_FILES = [
  "lib/import-persistence/import-persistence-db.ts",
  "lib/import-persistence/import-persistence-transaction.ts",
  "lib/import-persistence/import-batch-repository.ts",
  "lib/import-persistence/customer-account-repository.ts",
  "lib/import-persistence/customer-contact-repository.ts",
  "lib/import-persistence/import-validation-repository.ts",
  "lib/import-persistence/import-persistence-service.ts",
] as const;

const REQUIRED_FUNCTIONS = [
  "isImportPersistenceEnabled",
  "getImportPersistenceConfig",
  "getDefaultImportWorkspaceId",
  "getImportPersistenceSql",
  "isImportPersistenceConfigured",
  "createImportBatch",
  "markPreviousActiveBatchesSuperseded",
  "deactivateActiveAccountsForWorkspace",
  "insertCustomerAccounts",
  "loadActiveCustomerAccounts",
  "deactivateActiveContactsForWorkspace",
  "insertCustomerContacts",
  "loadActiveCustomerContacts",
  "saveImportValidationResult",
  "saveImportRowIssues",
  "loadActiveImportForWorkspace",
  "applyImportForWorkspace",
  "ensureWorkspace",
  "runApplyImportInTransaction",
  "buildApplyImportTransactionQueries",
] as const;

const UI_SCAN_PATHS = [
  "components",
  "app/(dashboard)",
  "app/sign-in",
  "app/sign-up",
] as const;

const FORBIDDEN_IMPORT_PATTERNS = [
  /from\s+["']@\/lib\/import-persistence/,
  /from\s+["']\.\.\/lib\/import-persistence/,
  /from\s+["']\.\.\/\.\.\/lib\/import-persistence/,
];

const FORBIDDEN_STORAGE_PATTERNS = [
  /\bfile_content\s*:/,
  /\braw_workbook\s*:/,
  /\bworkbook_blob\s*:/,
  /\bworkbook_content\s*:/,
  /\bupload_blob\s*:/,
  /\bemail_body\s*:/,
  /\btemplate_html\s*:/,
];

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

function scanDirectory(relativeDir: string, extensions: string[]): string[] {
  const results: string[] = [];
  const base = join(ROOT, relativeDir);
  if (!existsSync(base)) return results;

  function walk(dir: string): void {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stats = statSync(full);
      if (stats.isDirectory()) {
        walk(full);
      } else if (extensions.some((ext) => entry.endsWith(ext))) {
        results.push(full);
      }
    }
  }

  walk(base);
  return results;
}

function collectSourceFiles(): string[] {
  const files = new Set<string>();
  for (const dir of UI_SCAN_PATHS) {
    for (const file of scanDirectory(dir, [".ts", ".tsx"])) {
      files.add(file);
    }
  }
  for (const file of scanDirectory("app/api", [".ts"])) {
    files.add(file);
  }
  return [...files];
}

function main(): void {
  console.log("Phase I-4A — Import Persistence Foundation Verification\n");

  console.log("1. Repository files exist...");
  for (const file of REQUIRED_FILES) {
    assert(existsSync(join(ROOT, file)), `missing file: ${file}`);
  }
  console.log(`  OK: ${REQUIRED_FILES.length} files present`);

  console.log("2. Server-only boundaries...");
  for (const file of SERVER_ONLY_FILES) {
    const content = read(file);
    assert(
      content.includes('"server-only"') || content.includes("'server-only'"),
      `${file} must import server-only`,
    );
  }
  console.log(`  OK: ${SERVER_ONLY_FILES.length} server-only modules`);

  console.log("3. Env example gate...");
  const envExample = read(".env.example");
  assert(
    envExample.includes("IMPORT_PERSISTENCE_ENABLED=false"),
    ".env.example must include IMPORT_PERSISTENCE_ENABLED=false",
  );
  console.log("  OK: IMPORT_PERSISTENCE_ENABLED=false in .env.example");

  console.log("4. .env.local unchanged...");
  try {
    const diff = execSync("git diff --name-only -- .env.local", {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
    assert(diff.length === 0, ".env.local must not be modified");
    console.log("  OK: .env.local not modified");
  } catch {
    console.log("  OK: .env.local check skipped (not tracked or git unavailable)");
  }

  console.log("5. No UI/provider imports...");
  const uiFiles = collectSourceFiles();
  for (const file of uiFiles) {
    const content = readFileSync(file, "utf8");
    for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
      assert(
        !pattern.test(content),
        `forbidden import-persistence import in ${file.replace(`${ROOT}/`, "")}`,
      );
    }
  }
  console.log(`  OK: no UI/API imports in ${uiFiles.length} scanned files`);

  console.log("6. No SendGrid / Communication Logs persistence...");
  for (const file of REQUIRED_FILES) {
    const content = read(file).toLowerCase();
    assert(!content.includes("sendgrid"), `${file} must not import SendGrid`);
    assert(
      !content.includes("communication_logs"),
      `${file} must not reference communication_logs table`,
    );
  }
  console.log("  OK: no SendGrid or communication_logs in repository layer");

  console.log("7. Key function names...");
  const combinedRepoSource = REQUIRED_FILES.map((file) => read(file)).join("\n");
  for (const fn of REQUIRED_FUNCTIONS) {
    assert(combinedRepoSource.includes(fn), `missing function/export: ${fn}`);
  }
  console.log(`  OK: ${REQUIRED_FUNCTIONS.length} key functions present`);

  console.log("8. No raw workbook storage logic...");
  for (const file of REQUIRED_FILES) {
    const content = read(file);
    for (const pattern of FORBIDDEN_STORAGE_PATTERNS) {
      assert(
        !pattern.test(content),
        `${file} must not include raw workbook storage pattern: ${pattern}`,
      );
    }
  }
  console.log("  OK: no raw workbook/blob storage patterns");

  console.log("9. Disabled SQL helper (static)...");
  const dbSource = read("lib/import-persistence/import-persistence-db.ts");
  assert(
    dbSource.includes("shouldPersistImport()"),
    "getImportPersistenceSql must gate on shouldPersistImport",
  );
  assert(
    /if\s*\(\s*!shouldPersistImport\(\)\s*\)[\s\S]*return null/.test(dbSource),
    "getImportPersistenceSql must return null when disabled",
  );
  console.log("  OK: getImportPersistenceSql gated — no connection on module import");

  console.log("10. Atomic transaction helper...");
  const txSource = read("lib/import-persistence/import-persistence-transaction.ts");
  assert(
    txSource.includes("sql.transaction") || txSource.includes(".transaction("),
    "transaction module must use sql.transaction",
  );
  assert(
    txSource.includes("buildApplyImportTransactionQueries"),
    "transaction query builder must exist",
  );
  assert(
    txSource.includes("runApplyImportInTransaction"),
    "runApplyImportInTransaction must exist",
  );
  console.log("  OK: Neon atomic transaction helper present");

  console.log("11. Live verification script...");
  assert(
    existsSync(join(ROOT, "scripts/verify-i-4b-import-persistence-live.ts")),
    "verify-i-4b-import-persistence-live.ts must exist",
  );
  console.log("  OK: live verification script present");

  console.log("12. No API routes wired...");
  const apiRoutes = scanDirectory("app/api", [".ts"]);
  for (const file of apiRoutes) {
    const content = readFileSync(file, "utf8");
    for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
      assert(
        !pattern.test(content),
        `API route must not import persistence yet: ${file.replace(`${ROOT}/`, "")}`,
      );
    }
  }
  console.log(`  OK: no persistence imports in ${apiRoutes.length} API route files`);

  console.log("\nPhase I-4A import persistence foundation verification passed.");
  console.log("Note: No database connection was used.");
}

main();
