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

const firstCustomer = result.customers.find((c) => c.customer_id === "ACCT-001");
const secondCustomer = result.customers.find((c) => c.customer_id === "ACCT-002");

assert(Boolean(firstCustomer), "Demo Customer 001 should exist");
assert(Boolean(secondCustomer), "Demo Customer 002 should exist");
assert(
  firstCustomer!.admin_email === "admin@customer-001.example.com",
  `Demo Customer 001 admin_email mismatch: ${firstCustomer!.admin_email}`,
);
assert(
  firstCustomer!.user_email === "aster.demo@customer-001.example.com",
  `Demo Customer 001 user_email mismatch: ${firstCustomer!.user_email}`,
);
assert(
  secondCustomer!.admin_email === "it-admin@customer-002.example.com",
  `Demo Customer 002 admin_email mismatch: ${secondCustomer!.admin_email}`,
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
