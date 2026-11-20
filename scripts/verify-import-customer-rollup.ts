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

const acme = customers.find((customer) => customer.customer_id === "CUST-001");
const brightPath = customers.find((customer) => customer.customer_id === "CUST-002");

assert(Boolean(acme), "Acme (CUST-001) should exist");
assert(Boolean(brightPath), "BrightPath (CUST-002) should exist");

assert(
  acme!.admin_email === "admin@acme.com",
  `Acme admin_email should be admin@acme.com, got ${acme!.admin_email}`,
);
assert(
  acme!.user_email === "sarah.chen@acme.com",
  `Acme user_email should be sarah.chen@acme.com, got ${acme!.user_email}`,
);
assert(
  brightPath!.admin_email === "it-admin@brightpath.io",
  `BrightPath admin_email should be it-admin@brightpath.io, got ${brightPath!.admin_email}`,
);

assert(
  acme!.owner === "alex.rivera@company.com",
  `Acme owner should come from owner_dam_email, got ${acme!.owner}`,
);
assert(acme!.last_email_sent === "Usage Summary", "Acme last_email_sent mapped");
assert(acme!.days_since_start > 0, "Acme days_since_start should be computed");
assert(acme!.days_to_renewal > 0, "Acme days_to_renewal should be computed");

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
  `  customers=${customers.length}, acme=${acme!.customer_name}, brightpath=${brightPath!.customer_name}`,
);
