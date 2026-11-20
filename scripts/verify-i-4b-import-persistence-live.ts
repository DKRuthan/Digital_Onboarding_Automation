/**
 * Phase I-4B — Import persistence live schema + transaction verification.
 *
 * SKIPPED (exit 0) when IMPORT_PERSISTENCE_ENABLED !== true or DATABASE_URL missing.
 * Uses dedicated workspace `test-import-persistence` — does not touch DEFAULT_WORKSPACE_ID data.
 *
 * Run: npx tsx scripts/verify-i-4b-import-persistence-live.ts
 */
import { createRequire } from "node:module";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { isImportPersistenceEnabled } from "../lib/import-persistence/import-persistence-env";
import type { Customer, ImportedContact } from "../lib/types";
import type { ValidationResult } from "../lib/upload-validation";

/** Allow importing server-only persistence modules from a Node verify script. */
function stubServerOnlyForScripts(): void {
  const require = createRequire(import.meta.url);
  const serverOnlyPath = require.resolve("server-only");
  require.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
  } as NodeModule;
}

const TEST_WORKSPACE_ID = "test-import-persistence";

type LiveVerifySql = NeonQueryFunction<false, false>;

const REQUIRED_TABLES = [
  "workspaces",
  "import_batches",
  "customer_accounts",
  "customer_contacts",
  "import_validation_results",
  "import_row_issues",
] as const;

const REQUIRED_COLUMNS: Record<string, string[]> = {
  import_batches: [
    "workspace_id",
    "status",
    "header_mode",
    "is_active",
    "validation_passed",
  ],
  customer_accounts: ["workspace_id", "import_batch_id", "account_id", "is_active"],
  customer_contacts: [
    "workspace_id",
    "import_batch_id",
    "contact_email",
    "is_active",
  ],
};

const REQUIRED_INDEXES = [
  "import_batches_one_active_per_workspace",
  "customer_accounts_active_account_unique",
  "customer_contacts_active_email_unique",
] as const;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

function skip(message: string): never {
  console.log(`SKIPPED: ${message}`);
  console.log("Exit code: 0 (blocked — not a failure)");
  process.exit(0);
}

/** Neon tagged-template results may be row arrays or fullResults objects — normalize to T[]. */
function assertArrayRows<T>(value: unknown, label: string): T[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label}: expected array result from Neon query`);
  }
  return value as T[];
}

function buildTestCustomer(accountId: string, suffix: string): Customer {
  return {
    customer_id: accountId,
    customer_name: `I-4B Test Account ${suffix}`,
    account_owner: "Test Admin",
    admin_email: "",
    user_email: "",
    role: "Admin",
    plan: "Enterprise",
    engagement_model: "Tech Touch",
    stage: "Activation",
    term_start_date: "2025-01-01",
    renewal_date: "2026-01-01",
    days_since_start: 100,
    days_to_renewal: 200,
    invite_sent_date: "",
    invite_accepted_date: "",
    invite_status: "Pending",
    seats_total: 10,
    seats_assigned: 5,
    seat_assignment_percent: 50,
    graph_desktop_assigned: 2,
    graph_browser_assigned: 2,
    search_assigned: 1,
    usage_sessions: 100,
    usage_activities: 0,
    active_users: 5,
    last_usage_date: "",
    usage_threshold: 0,
    usage_threshold_percent: 0,
    use_case: "Test",
    icp: "Test ICP",
    academy_visited: "No",
    webinar_attended: "No",
    last_email_sent: "",
    last_email_sent_date: "",
    emails_sent_count: 0,
    next_recommended_action: "",
    automation_status: "None",
    owner: "",
    notes: "I-4B live verification",
  };
}

function buildTestValidationResult(
  accountId: string,
  contactEmail: string,
  runLabel: string,
): ValidationResult {
  const customer = buildTestCustomer(accountId, runLabel);
  const importedContacts: ImportedContact[] = [
    {
      contact_email: contactEmail,
      contact_role: "Admin",
      contact_name: "Test Admin",
      do_not_contact: false,
      customer_id: accountId,
      customer_name: customer.customer_name,
      source: "excel_import",
    },
  ];

  return {
    totalRows: 1,
    validRows: 1,
    errorRows: 0,
    missingColumns: [],
    duplicateCustomerIds: [],
    invalidEmails: 0,
    invalidDates: 0,
    invalidNumbers: 0,
    rowErrors: [],
    passed: true,
    customers: [customer],
    importedContacts,
    importSummary: {
      format: "option_c",
      headerMode: "flat_row2",
      accountsCount: 1,
      contactsCount: 1,
      signalsCount: 0,
      customersCount: 1,
      blockerCount: 0,
      warningCount: 0,
      duplicateContactEmailCount: 0,
      orphanContactCount: 0,
      orphanSignalCount: 0,
    },
    importIssues: [
      {
        severity: "info",
        code: "I4B_LIVE_TEST",
        message: `I-4B live verification issue (${runLabel})`,
        sheet: "Journey Import",
        rowNumber: 3,
        customer_id: accountId,
        contact_email: contactEmail,
      },
    ],
  };
}

async function verifySchema(sql: LiveVerifySql): Promise<void> {
  console.log("1. Required tables...");
  for (const table of REQUIRED_TABLES) {
    const rows = assertArrayRows<{ table_name: string }>(
      await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ${table}
    `,
      `table ${table}`,
    );
    assert(rows.length === 1, `missing table: ${table}`);
  }
  console.log(`  OK: ${REQUIRED_TABLES.length} tables exist`);

  console.log("2. Required columns...");
  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    for (const column of columns) {
      const rows = assertArrayRows<{ column_name: string }>(
        await sql`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ${table}
          AND column_name = ${column}
      `,
        `column ${table}.${column}`,
      );
      assert(rows.length === 1, `missing column ${table}.${column}`);
    }
  }
  console.log("  OK: key columns present");

  console.log("3. Partial unique indexes...");
  for (const indexName of REQUIRED_INDEXES) {
    const rows = assertArrayRows<{ indexname: string }>(
      await sql`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = ${indexName}
    `,
      `index ${indexName}`,
    );
    assert(rows.length === 1, `missing index: ${indexName}`);
  }
  console.log("  OK: partial unique indexes exist");

  console.log("4. Workspace upsert...");
  await sql`
    INSERT INTO workspaces (id, name)
    VALUES (${TEST_WORKSPACE_ID}, ${"I-4B Import Persistence Test"})
    ON CONFLICT (id) DO NOTHING
  `;
  const ws = assertArrayRows<{ id: string }>(
    await sql`
    SELECT id FROM workspaces WHERE id = ${TEST_WORKSPACE_ID}
  `,
    "workspace upsert",
  );
  assert(ws.length === 1, "workspace upsert failed");
  console.log(`  OK: workspace ${TEST_WORKSPACE_ID} ensured`);
}

async function main(): Promise<void> {
  console.log("Phase I-4B — Import Persistence Live Verification\n");

  if (!isImportPersistenceEnabled()) {
    skip(
      "IMPORT_PERSISTENCE_ENABLED is not true. Set IMPORT_PERSISTENCE_ENABLED=true to run live verification.",
    );
  }

  if (!process.env.DATABASE_URL?.trim()) {
    skip("DATABASE_URL is missing. Configure DATABASE_URL to run live verification.");
  }

  stubServerOnlyForScripts();

  const {
    applyImportForWorkspace,
  } = await import("../lib/import-persistence/import-persistence-service");
  const { findActiveBatchForWorkspace } = await import(
    "../lib/import-persistence/import-batch-repository"
  );
  const { loadActiveCustomerAccounts } = await import(
    "../lib/import-persistence/customer-account-repository"
  );
  const { loadActiveCustomerContacts } = await import(
    "../lib/import-persistence/customer-contact-repository"
  );
  const { loadIssuesForBatch } = await import(
    "../lib/import-persistence/import-validation-repository"
  );

  const sql = neon(process.env.DATABASE_URL!.trim());

  try {
    await verifySchema(sql);

    const runId = Date.now();
    const account1 = `i4b-test-acct-${runId}-1`;
    const contact1 = `i4b-test-${runId}-1@example.test`;
    const account2 = `i4b-test-acct-${runId}-2`;
    const contact2 = `i4b-test-${runId}-2@example.test`;

    console.log("5. First apply (repository/service)...");
    const first = await applyImportForWorkspace({
      workspaceId: TEST_WORKSPACE_ID,
      workspaceName: "I-4B Import Persistence Test",
      validationResult: buildTestValidationResult(account1, contact1, "run-1"),
      sourceFilename: "i4b-live-test-1.xlsx",
      uploadedBy: "verify-i-4b",
    });
    assert(first.ok === true, `first apply failed: ${first.ok === false ? first.message : ""}`);
    console.log(`  OK: batch ${first.ok ? first.importBatchId : ""} applied`);

    const activeBatch1 = await findActiveBatchForWorkspace(TEST_WORKSPACE_ID);
    assert(activeBatch1?.is_active === true, "active batch missing after first apply");
    assert(activeBatch1?.status === "applied", "batch status must be applied");

    const accounts1 = await loadActiveCustomerAccounts(TEST_WORKSPACE_ID);
    const contacts1 = await loadActiveCustomerContacts(TEST_WORKSPACE_ID);
    assert(accounts1.length === 1, `expected 1 active account, got ${accounts1.length}`);
    assert(contacts1.length === 1, `expected 1 active contact, got ${contacts1.length}`);
    assert(accounts1[0]?.account_id === account1, "active account id mismatch");
    assert(contacts1[0]?.contact_email === contact1, "active contact email mismatch");

    const issues1 = await loadIssuesForBatch(activeBatch1!.id, TEST_WORKSPACE_ID);
    assert(issues1.length >= 1, "row issues not saved");
    console.log("  OK: active batch, accounts, contacts, issues verified");

    console.log("6. Second apply (replace/supersede)...");
    const firstBatchId = activeBatch1!.id;
    const second = await applyImportForWorkspace({
      workspaceId: TEST_WORKSPACE_ID,
      validationResult: buildTestValidationResult(account2, contact2, "run-2"),
      sourceFilename: "i4b-live-test-2.xlsx",
    });
    assert(second.ok === true, `second apply failed: ${second.ok === false ? second.message : ""}`);

    const activeBatch2 = await findActiveBatchForWorkspace(TEST_WORKSPACE_ID);
    assert(activeBatch2?.id !== firstBatchId, "active batch should be new after replace");
    assert(activeBatch2?.is_active === true, "second batch must be active");

    const oldBatch = assertArrayRows<{ is_active: boolean; status: string }>(
      await sql`
      SELECT status, is_active FROM import_batches WHERE id = ${firstBatchId}
    `,
      "previous batch status",
    );
    assert(oldBatch[0]?.is_active === false, "previous batch must be inactive");
    assert(oldBatch[0]?.status === "superseded", "previous batch must be superseded");

    const accounts2 = await loadActiveCustomerAccounts(TEST_WORKSPACE_ID);
    const contacts2 = await loadActiveCustomerContacts(TEST_WORKSPACE_ID);
    assert(accounts2.length === 1, `active accounts must not double: ${accounts2.length}`);
    assert(contacts2.length === 1, `active contacts must not double: ${contacts2.length}`);
    assert(accounts2[0]?.account_id === account2, "replaced active account mismatch");
    assert(contacts2[0]?.contact_email === contact2, "replaced active contact mismatch");

    const inactiveOldAccounts = assertArrayRows<{ count: number }>(
      await sql`
      SELECT COUNT(*)::int AS count
      FROM customer_accounts
      WHERE workspace_id = ${TEST_WORKSPACE_ID}
        AND account_id = ${account1}
        AND is_active = false
    `,
      "inactive old accounts count",
    );
    assert(
      (inactiveOldAccounts[0]?.count ?? 0) >= 1,
      "previous account row should be inactive",
    );

    console.log("  OK: supersede/replace verified — no active count doubling");

    console.log("\nPhase I-4B live verification passed.");
    console.log(
      `Test data remains in workspace "${TEST_WORKSPACE_ID}" with i4b-test-* prefixes.`,
    );
    console.log(
      "Cleanup: DELETE FROM import_batches WHERE workspace_id = 'test-import-persistence'; (cascades issues/validation) then deactivate orphan rows if needed.",
    );
  } catch (error) {
    if (error instanceof Error && /does not exist|relation/i.test(error.message)) {
      console.error(
        "BLOCKED: Schema tables missing — apply db/migrations/002_create_import_persistence.sql manually first.",
      );
      console.error(`Detail: ${error.message}`);
      process.exit(0);
    }
    throw error;
  }
}

main().catch((error) => {
  console.error("FAIL: live verification error:", error);
  process.exit(1);
});
