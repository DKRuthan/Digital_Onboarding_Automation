/**
 * Phase I-Local-1 — local browser persistence for active Journey Import.
 * Run: npx tsx scripts/verify-local-import-persistence.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Customer, ImportedContact } from "../lib/types";
import {
  LOCAL_ACTIVE_IMPORT_SCHEMA_VERSION,
  LOCAL_ACTIVE_IMPORT_STORAGE_KEY,
  clearLocalActiveImport,
  isLocalActiveImport,
  loadLocalActiveImport,
  saveLocalActiveImport,
} from "../lib/local-import-persistence";

const ROOT = join(import.meta.dirname ?? __dirname, "..");

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

function readRepo(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const sampleCustomer: Customer = {
  customer_id: "CUST-TEST-001",
  customer_name: "Test Corp",
  account_owner: "Owner",
  admin_email: "admin@test.com",
  user_email: "user@test.com",
  role: "Admin",
  plan: "Enterprise",
  engagement_model: "High Touch",
  stage: "Onboarding",
  term_start_date: "2026-01-15",
  renewal_date: "2027-01-15",
  days_since_start: 10,
  days_to_renewal: 200,
  invite_sent_date: "2026-01-10",
  invite_accepted_date: "2026-01-12",
  invite_status: "Accepted",
  seats_total: 10,
  seats_assigned: 5,
  seat_assignment_percent: 50,
  graph_desktop_assigned: 2,
  graph_browser_assigned: 2,
  search_assigned: 1,
  usage_sessions: 10,
  usage_activities: 50,
  active_users: 5,
  last_usage_date: "2026-06-01",
  usage_threshold: 100,
  usage_threshold_percent: 50,
  use_case: "Testing",
  icp: "Enterprise",
  academy_visited: "No",
  webinar_attended: "No",
  last_email_sent: "",
  last_email_sent_date: "",
  emails_sent_count: 0,
  next_recommended_action: "Review",
  automation_status: "Ready",
  owner: "Owner",
  notes: "",
};

const sampleContact: ImportedContact = {
  contact_email: "admin@test.com",
  contact_role: "Admin",
  customer_id: "CUST-TEST-001",
  do_not_contact: false,
};

function installMockLocalStorage(): Map<string, string> {
  const store = new Map<string, string>();
  const mock = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };

  // Minimal browser shim for node verification only.
  (globalThis as Record<string, unknown>).window = { localStorage: mock };

  return store;
}

function main(): void {
  console.log("A. Mock localStorage save/load round trip...");
  const store = installMockLocalStorage();

  saveLocalActiveImport({
    customers: [sampleCustomer],
    importedContacts: [sampleContact],
    sourceFilename: "Customers.xlsx",
    validationSummary: {
      passed: true,
      headerMode: "flat_row2",
      accountsCount: 1,
      contactsCount: 1,
      blockerCount: 0,
      warningCount: 0,
    },
  });

  assert(store.has(LOCAL_ACTIVE_IMPORT_STORAGE_KEY), "storage key written");
  const loaded = loadLocalActiveImport();
  assert(loaded !== null, "load returns stored import");
  assert(loaded!.customers.length === 1, "customers restored");
  assert(loaded!.importedContacts.length === 1, "importedContacts restored");
  assert(loaded!.dataSource === "upload", "dataSource is upload");
  assert(loaded!.sourceFilename === "Customers.xlsx", "sourceFilename restored");
  assert(loaded!.validationSummary?.passed === true, "validation summary restored");

  console.log("B. Corrupted JSON falls back safely...");
  store.set(LOCAL_ACTIVE_IMPORT_STORAGE_KEY, "{not-json");
  assert(loadLocalActiveImport() === null, "corrupted JSON returns null");

  console.log("C. Schema version mismatch falls back safely...");
  store.set(
    LOCAL_ACTIVE_IMPORT_STORAGE_KEY,
    JSON.stringify({
      schemaVersion: LOCAL_ACTIVE_IMPORT_SCHEMA_VERSION + 99,
      dataSource: "upload",
      customers: [sampleCustomer],
      importedContacts: [sampleContact],
      appliedAt: new Date().toISOString(),
    }),
  );
  assert(loadLocalActiveImport() === null, "schema mismatch returns null");

  console.log("D. Invalid payload shape falls back safely...");
  store.set(
    LOCAL_ACTIVE_IMPORT_STORAGE_KEY,
    JSON.stringify({
      schemaVersion: LOCAL_ACTIVE_IMPORT_SCHEMA_VERSION,
      dataSource: "upload",
      customers: [{ bad: true }],
      importedContacts: [],
      appliedAt: new Date().toISOString(),
    }),
  );
  assert(loadLocalActiveImport() === null, "invalid customer shape returns null");
  assert(!isLocalActiveImport({ schemaVersion: 2 }), "isLocalActiveImport rejects bad shape");

  console.log("E. clearLocalActiveImport removes stored data...");
  saveLocalActiveImport({
    customers: [sampleCustomer],
    importedContacts: [sampleContact],
  });
  assert(loadLocalActiveImport() !== null, "data exists before clear");
  clearLocalActiveImport();
  assert(loadLocalActiveImport() === null, "clear removes stored import");
  assert(!store.has(LOCAL_ACTIVE_IMPORT_STORAGE_KEY), "storage key removed");

  console.log("F. Provider apply path references helper...");
  const providerSource = readRepo("components/providers/customer-data-provider.tsx");
  assert(
    providerSource.includes("saveLocalActiveImport"),
    "provider calls saveLocalActiveImport on apply",
  );
  assert(
    providerSource.includes("loadLocalActiveImport"),
    "provider loads local import on mount",
  );
  assert(
    providerSource.includes("setWorkflowStatuses({})"),
    "import apply still resets workflowStatuses",
  );

  console.log("G. Use Demo Data clears local import...");
  assert(
    providerSource.includes("clearLocalActiveImport"),
    "restoreDemoData clears local import persistence",
  );

  console.log("H. No Neon / DATABASE_URL requirement in local persistence...");
  const helperSource = readRepo("lib/local-import-persistence.ts");
  assert(!helperSource.includes("DATABASE_URL"), "helper does not reference DATABASE_URL");
  assert(!helperSource.includes("@neondatabase"), "helper does not use Neon");
  assert(!helperSource.includes("sendgrid"), "helper does not reference SendGrid");

  console.log("I. No API routes added for local persistence...");
  assert(
    !readRepo("components/providers/customer-data-provider.tsx").includes("/api/"),
    "provider does not add API routes",
  );

  console.log("J. Upload panel passes filename and validation summary...");
  const panelSource = readRepo("components/customers/data-upload-panel.tsx");
  assert(
    panelSource.includes("buildLocalImportValidationSummary"),
    "upload panel builds validation summary for persistence",
  );
  assert(panelSource.includes("sourceFilename: fileName"), "upload panel passes filename");

  console.log("\nAll local import persistence checks passed.");
}

main();
