import { parseTargetMultisheetWorkbook } from "../lib/import-multisheet-parser";
import { buildTargetMultisheetWorkbook } from "../lib/import-templates";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

const workbook = buildTargetMultisheetWorkbook();
const parsed = parseTargetMultisheetWorkbook(workbook);

assert(parsed.format === "option_c", "format should be option_c");
assert(parsed.headerMode === "row2", "download template should use row2 headerMode");
assert(parsed.accounts.length === 2, `expected 2 account rows, got ${parsed.accounts.length}`);
assert(parsed.contacts.length === 3, `expected 3 contact rows, got ${parsed.contacts.length}`);
assert(parsed.signals.length === 1, `expected 1 signal row, got ${parsed.signals.length}`);

for (const sheet of ["Accounts", "Contacts", "Signals"]) {
  assert(
    parsed.sheetNames.some(
      (name) => name.trim().toLowerCase() === sheet.toLowerCase(),
    ),
    `sheetNames should include ${sheet}`,
  );
}

assert(
  parsed.accounts[0]?.customer_id === "ACCT-001",
  `first account customer_id should be ACCT-001, got ${parsed.accounts[0]?.customer_id}`,
);
assert(
  parsed.contacts[0]?.contact_email === "admin@customer-001.example.com",
  `first contact contact_email should be admin@customer-001.example.com, got ${parsed.contacts[0]?.contact_email}`,
);

console.log("OK: import multisheet parser verification passed");
console.log(
  `  accounts=${parsed.accounts.length}, contacts=${parsed.contacts.length}, signals=${parsed.signals.length}`,
);
console.log(`  sheets=${parsed.sheetNames.join(", ")}`);
