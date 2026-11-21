import { rollupNormalizedImportToCustomers } from "../lib/import-customer-rollup";
import { parseTargetMultisheetWorkbook } from "../lib/import-multisheet-parser";
import { buildTargetMultisheetWorkbook } from "../lib/import-templates";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

const FIXED_NOW = new Date("2026-06-18T12:00:00.000Z");

const workbook = buildTargetMultisheetWorkbook();
const parsed = parseTargetMultisheetWorkbook(workbook);
const { customers, warnings } = rollupNormalizedImportToCustomers(parsed, {
  now: FIXED_NOW,
});

assert(customers.length === 2, `expected 2 customers, got ${customers.length}`);

const firstCustomer = customers.find((customer) => customer.customer_id === "ACCT-001");
const secondCustomer = customers.find((customer) => customer.customer_id === "ACCT-002");

assert(Boolean(firstCustomer), "Demo Customer 001 (ACCT-001) should exist");
assert(Boolean(secondCustomer), "Demo Customer 002 (ACCT-002) should exist");

assert(
  firstCustomer!.admin_email === "admin@customer-001.example.com",
  `Demo Customer 001 admin_email should be admin@customer-001.example.com, got ${firstCustomer!.admin_email}`,
);
assert(
  firstCustomer!.user_email === "aster.demo@customer-001.example.com",
  `Demo Customer 001 user_email should be aster.demo@customer-001.example.com, got ${firstCustomer!.user_email}`,
);
assert(
  secondCustomer!.admin_email === "it-admin@customer-002.example.com",
  `Demo Customer 002 admin_email should be it-admin@customer-002.example.com, got ${secondCustomer!.admin_email}`,
);

assert(
  firstCustomer!.owner === "ash.demo@team.example.com",
  `Demo Customer 001 owner should come from owner_dam_email, got ${firstCustomer!.owner}`,
);
assert(firstCustomer!.last_email_sent === "Usage Summary", "Demo Customer 001 last_email_sent mapped");
assert(firstCustomer!.days_since_start > 0, "Demo Customer 001 days_since_start should be computed");
assert(firstCustomer!.days_to_renewal > 0, "Demo Customer 001 days_to_renewal should be computed");

if (warnings.length > 0) {
  console.log(`Warnings (${warnings.length}):`);
  for (const warning of warnings) {
    console.log(`  - [${warning.code}] ${warning.message}`);
  }
} else {
  console.log("Warnings: none");
}

console.log("OK: import customer rollup verification passed");
console.log(
  `  customers=${customers.length}, firstCustomer=${firstCustomer!.customer_name}, secondCustomer=${secondCustomer!.customer_name}`,
);
