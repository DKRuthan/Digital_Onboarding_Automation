import { validateTargetMultisheetWorkbook } from "../lib/import-multisheet-validation";
import { buildTargetMultisheetWorkbook } from "../lib/import-templates";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

const FIXED_NOW = new Date("2026-06-18T12:00:00.000Z");
const workbook = buildTargetMultisheetWorkbook();
const result = validateTargetMultisheetWorkbook(workbook, { now: FIXED_NOW });

assert(result.passed === true, `expected passed=true, got ${result.passed}`);
assert(
  result.customers.length === 2,
  `expected 2 customers, got ${result.customers.length}`,
);

const acme = result.customers.find((c) => c.customer_id === "ACCT-001");
const brightPath = result.customers.find((c) => c.customer_id === "ACCT-002");

assert(Boolean(acme), "Acme should exist");
assert(Boolean(brightPath), "BrightPath should exist");
assert(
  acme!.admin_email === "admin@acme.com",
  `Acme admin_email mismatch: ${acme!.admin_email}`,
);
assert(
  acme!.user_email === "sarah.chen@acme.com",
  `Acme user_email mismatch: ${acme!.user_email}`,
);
assert(
  brightPath!.admin_email === "it-admin@brightpath.io",
  `BrightPath admin_email mismatch: ${brightPath!.admin_email}`,
);

assert(result.importSummary?.format === "option_c", "importSummary format");
assert(result.importSummary?.accountsCount === 2, "accountsCount");
assert(result.importSummary?.contactsCount === 3, "contactsCount");
assert(result.importSummary?.signalsCount === 1, "signalsCount");
assert(result.importSummary?.customersCount === 2, "customersCount");

console.log("OK: import multisheet validate verification passed");
console.log(
  `  passed=${result.passed}, customers=${result.customers.length}, warnings=${result.importWarnings?.length ?? 0}`,
);
if (result.importNotes?.length) {
  console.log(`  notes: ${result.importNotes.join("; ")}`);
}
