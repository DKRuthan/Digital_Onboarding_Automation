/**
 * Phase L-1F — stable verification checkpoint for Single Excel Import.
 * Run: npx tsx scripts/verify-l-1f-stable.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";

import {
  EXCEL_IMPORT_AUDIT_COUNT_KEYS,
  buildExcelImportAuditMetadata,
} from "../lib/audit/excel-import-audit";
import { getUiAuditPermission } from "../lib/audit/ui-audit-events";
import {
  buildContactsForDisplay,
  displayContactToImportedExport,
} from "../lib/customer-contacts";
import { computeDashboardContactMetrics } from "../lib/dashboard-contact-metrics";
import {
  buildImportedContactsFromNormalized,
  replaceImportedContacts,
} from "../lib/imported-contacts";
import { validateNormalizedMultisheetImport } from "../lib/import-multisheet-cross-validation";
import {
  MultisheetParserError,
  parseTargetMultisheetWorkbook,
} from "../lib/import-multisheet-parser";
import type { NormalizedImport } from "../lib/import-multisheet-parser";
import {
  REQUIRED_ACCOUNTS_COLUMNS,
  REQUIRED_CONTACTS_COLUMNS,
  REQUIRED_SIGNALS_COLUMNS,
} from "../lib/import-sheet-schema";
import {
  EXCEL_IMPORT_TEMPLATE_FILENAME,
  TARGET_ACCOUNTS_COLUMNS,
  TARGET_CONTACTS_COLUMNS,
  TARGET_SIGNALS_COLUMNS,
  buildTargetMultisheetWorkbook,
} from "../lib/import-templates";
import { validateTargetMultisheetWorkbook } from "../lib/import-multisheet-validation";
import { buildReportsSnapshot } from "../lib/reports-snapshot";
import { buildImportedContactsExportCsv } from "../lib/session-export";
import { customers as demoCustomers, sendLogs as demoSendLogs } from "../lib/mock-data";

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

function hasCode(issues: { code: string }[], code: string): boolean {
  return issues.some((issue) => issue.code === code);
}

const SAMPLE_ACCOUNT = {
  customer_id: "CUST-001",
  customer_name: "Acme Corporation",
  plan: "Enterprise",
  stage: "Onboarding",
  owner_dam_email: "alex.rivera@company.com",
  term_start_date: "2026-01-15",
  renewal_date: "2027-01-15",
  invite_sent_date: "2026-01-10",
  invite_status: "Accepted",
  usage_sessions: "10",
  seats_total: "10",
  seats_assigned: "5",
  academy_visited: "Yes",
  webinar_attended: "No",
};

const DEFAULT_HEADERS = {
  accounts: [...REQUIRED_ACCOUNTS_COLUMNS, "plan", "stage", "owner_dam_email"],
  contacts: [...REQUIRED_CONTACTS_COLUMNS, "contact_name", "do_not_contact"],
  signals: [...REQUIRED_SIGNALS_COLUMNS],
};

function baseImport(
  partial: Partial<NormalizedImport> & Pick<NormalizedImport, "accounts" | "contacts">,
): NormalizedImport {
  return {
    format: "option_c",
    headerMode: "legacy_single_row",
    sheetNames: ["Accounts", "Contacts", "Signals"],
    signals: [],
    sheetHeaders: DEFAULT_HEADERS,
    ...partial,
  };
}

function main(): void {
  console.log("L-1F stable verification\n");

  console.log("1. Template workbook structure and filename...");
  const workbook = buildTargetMultisheetWorkbook();
  const sheetNames = workbook.SheetNames.map((n) => n.toLowerCase());
  assert(sheetNames.includes("accounts"), "Accounts sheet required");
  assert(sheetNames.includes("contacts"), "Contacts sheet required");
  assert(sheetNames.includes("signals"), "Signals sheet required");
  assert(
    EXCEL_IMPORT_TEMPLATE_FILENAME === "excel-import-template.xlsx",
    "template filename must be excel-import-template.xlsx",
  );
  assert(
    TARGET_ACCOUNTS_COLUMNS[0] === "account_id",
    "Accounts Row 2 headers must use account_id",
  );
  assert(
    TARGET_CONTACTS_COLUMNS.includes("contact_email"),
    "Contacts headers must include contact_email",
  );
  assert(
    TARGET_SIGNALS_COLUMNS.includes("sent_at"),
    "Signals headers must include sent_at",
  );
  const parsedTemplate = parseTargetMultisheetWorkbook(workbook);
  assert(
    parsedTemplate.headerMode === "row2",
    "download template must parse as row2",
  );
  console.log("  OK: template sheets, Row 2 headers, filename");

  console.log("2. Valid workbook validate/apply payload...");
  const valid = validateTargetMultisheetWorkbook(workbook);
  assert(valid.passed === true, "template workbook must pass validation");
  assert(valid.customers.length === 2, "expected 2 customers from template");
  assert(
    valid.importedContacts?.length === valid.importSummary?.contactsCount,
    "importedContacts count must match Contacts sheet",
  );
  console.log(
    `  OK: passed=${valid.passed}, customers=${valid.customers.length}, contacts=${valid.importedContacts?.length}`,
  );

  console.log("3. Re-upload replace semantics...");
  const contacts1 = valid.importedContacts ?? [];
  const contacts2 = buildImportedContactsFromNormalized(
    parseTargetMultisheetWorkbook(workbook),
  );
  const replaced = replaceImportedContacts(contacts1, contacts2);
  assert(replaced.length === contacts1.length, "re-upload must not double contacts");
  assert(
    replaced.every((c, i) => c.contact_email === contacts2[i]?.contact_email),
    "re-upload replaces with same normalized contacts",
  );
  console.log("  OK: replace semantics on re-upload");

  console.log("4. Modified workbook replaces contacts...");
  const modified = baseImport({
    accounts: [SAMPLE_ACCOUNT],
    contacts: [
      {
        contact_email: "admin@acme.com",
        contact_role: "Admin",
        customer_id: "CUST-001",
        contact_name: "Admin One",
      },
      {
        contact_email: "newperson@acme.com",
        contact_role: "User",
        customer_id: "CUST-001",
        contact_name: "New Person",
        do_not_contact: "Yes",
      },
    ],
    signals: [
      {
        contact_email: "admin@acme.com",
        customer_id: "CUST-001",
        sent_at: "2026-06-01T10:00:00Z",
        template_or_type: "invite",
        channel: "email",
        status: "Delivered",
      },
    ],
  });
  const modifiedContacts = buildImportedContactsFromNormalized(modified);
  const afterReplace = replaceImportedContacts(contacts1, modifiedContacts);
  assert(afterReplace.length === 2, "modified workbook has 2 contacts");
  assert(
    !afterReplace.some((c) => c.contact_email === "user@acme.com"),
    "removed template user contact must not remain after replace",
  );
  assert(
    afterReplace.some((c) => c.contact_email === "newperson@acme.com"),
    "new contact must appear after replace",
  );
  console.log("  OK: modified workbook replaces session contacts");

  console.log("5. Duplicate normalized contact_email blocker...");
  const dupResult = validateNormalizedMultisheetImport(
    baseImport({
      accounts: [SAMPLE_ACCOUNT],
      contacts: [
        { contact_email: "Admin@Acme.com", contact_role: "Admin", customer_id: "CUST-001" },
        { contact_email: "  admin@acme.com ", contact_role: "User", customer_id: "CUST-001" },
      ],
      signals: [
        {
          contact_email: "admin@acme.com",
          customer_id: "CUST-001",
          sent_at: "2026-06-01T10:00:00Z",
          template_or_type: "a",
          channel: "email",
          status: "Delivered",
        },
      ],
    }),
  );
  assert(dupResult.passed === false, "duplicate email must block apply");
  assert(
    hasCode(dupResult.blockers, "CONTACT_DUPLICATE_EMAIL"),
    "duplicate blocker code expected",
  );
  console.log("  OK: duplicate contact_email blocked");

  console.log("6. Missing Signals sheet...");
  const noSignals = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    noSignals,
    XLSX.utils.aoa_to_sheet([["customer_id", "customer_name"], ["CUST-001", "Acme"]]),
    "Accounts",
  );
  XLSX.utils.book_append_sheet(
    noSignals,
    XLSX.utils.aoa_to_sheet([
      ["contact_email", "contact_role", "customer_id"],
      ["admin@acme.com", "Admin", "CUST-001"],
    ]),
    "Contacts",
  );
  let parseFailed = false;
  try {
    parseTargetMultisheetWorkbook(noSignals);
  } catch (e) {
    parseFailed = e instanceof MultisheetParserError;
  }
  assert(parseFailed, "missing Signals sheet must fail parse");
  console.log("  OK: missing Signals sheet rejected");

  console.log("7. Orphan Signals blockers...");
  const orphanEmail = validateNormalizedMultisheetImport(
    baseImport({
      accounts: [SAMPLE_ACCOUNT],
      contacts: [
        { contact_email: "admin@acme.com", contact_role: "Admin", customer_id: "CUST-001" },
      ],
      signals: [
        {
          contact_email: "unknown@acme.com",
          customer_id: "CUST-001",
          sent_at: "2026-06-01T10:00:00Z",
          template_or_type: "a",
          channel: "email",
          status: "Delivered",
        },
      ],
    }),
  );
  assert(orphanEmail.passed === false, "orphan signal email must block");
  assert(
    hasCode(orphanEmail.blockers, "SIGNAL_UNKNOWN_CONTACT_EMAIL"),
    "orphan signal contact_email blocker",
  );
  console.log("  OK: orphan Signals blocked, no contact creation");

  console.log("8. Unsupported contact_role warning...");
  const roleImport = baseImport({
    accounts: [SAMPLE_ACCOUNT],
    contacts: [
      {
        contact_email: "admin@acme.com",
        contact_role: "Champion",
        customer_id: "CUST-001",
      },
    ],
    signals: [
      {
        contact_email: "admin@acme.com",
        customer_id: "CUST-001",
        sent_at: "2026-06-01T10:00:00Z",
        template_or_type: "a",
        channel: "email",
        status: "Delivered",
      },
    ],
  });
  const roleWarn = validateNormalizedMultisheetImport(roleImport);
  assert(roleWarn.passed === true, "unsupported role should not block");
  assert(
    roleWarn.warnings.some((w) => w.code === "CONTACT_UNSUPPORTED_ROLE"),
    "unsupported role warning expected",
  );
  const display = buildContactsForDisplay({
    customers: [],
    importedContacts: buildImportedContactsFromNormalized(roleImport),
    dataSource: "upload",
  });
  assert(
    display.contacts[0]?.contact_role === "Champion",
    "unsupported role preserved in display",
  );
  console.log("  OK: unsupported role warning only, role preserved");

  console.log("9. Contacts display and export...");
  const uploadDisplay = buildContactsForDisplay({
    customers: valid.customers,
    importedContacts: valid.importedContacts ?? [],
    dataSource: "upload",
  });
  assert(uploadDisplay.source === "imported", "upload mode uses imported source");
  const emails = new Set(uploadDisplay.contacts.map((c) => c.contact_email));
  assert(
    emails.size === uploadDisplay.contacts.length,
    "one row per unique contact_email",
  );
  const demoDisplay = buildContactsForDisplay({
    customers: demoCustomers,
    importedContacts: [],
    dataSource: "demo",
  });
  assert(demoDisplay.source === "derived", "demo mode uses derived contacts");

  const exportRow = displayContactToImportedExport(uploadDisplay.contacts[0]!);
  const csv = buildImportedContactsExportCsv([exportRow]);
  for (const field of [
    "contact_email",
    "contact_name",
    "contact_role",
    "do_not_contact",
    "customer_id",
    "customer_name",
    "source",
  ]) {
    assert(csv.includes(field), `export CSV header must include ${field}`);
  }
  assert(!csv.includes("<html"), "export must not include template HTML");
  console.log("  OK: display sources and safe export fields");

  console.log("10. Reports and dashboard after upload...");
  const snapshot = buildReportsSnapshot({
    customers: valid.customers,
    importedContacts: valid.importedContacts,
    dataSource: "upload",
    actionQueue: [],
    sendLogs: demoSendLogs,
    emailSequences: [],
    enrollments: [],
    rules: [],
    lastValidation: valid,
  });
  assert(
    snapshot.contactJourney.totalContacts === (valid.importedContacts?.length ?? 0),
    "reports contact count must use importedContacts",
  );
  assert(
    snapshot.dataGaps.some((g) => g.includes("importedContacts")),
    "data gap must mention importedContacts rollup distinction",
  );
  const metrics = computeDashboardContactMetrics({
    customers: valid.customers,
    importedContacts: valid.importedContacts,
    dataSource: "upload",
    enrollments: [],
    sendLogs: demoSendLogs,
    actionQueue: [],
  });
  assert(
    metrics.contact.totalContacts === (valid.importedContacts?.length ?? 0),
    "dashboard contact count must match importedContacts",
  );
  console.log("  OK: reports and dashboard use uploaded contact counts");

  console.log("11. Audit metadata...");
  assert(
    getUiAuditPermission("data.excel_import.validate") === "upload_customer_data",
    "validate permission",
  );
  assert(
    getUiAuditPermission("data.excel_import.apply") === "upload_customer_data",
    "apply permission",
  );
  const meta = buildExcelImportAuditMetadata(valid);
  assert(
    Object.keys(meta).length === EXCEL_IMPORT_AUDIT_COUNT_KEYS.length,
    "counts-only metadata keys",
  );
  const uploadPanel = readRepo("components/customers/data-upload-panel.tsx");
  assert(
    uploadPanel.includes("data.excel_import.validate"),
    "upload panel must emit data.excel_import.validate",
  );
  assert(
    uploadPanel.includes("data.excel_import.apply"),
    "upload panel must emit data.excel_import.apply",
  );
  assert(
    uploadPanel.includes("buildExcelImportAuditMetadata"),
    "upload panel must use buildExcelImportAuditMetadata",
  );
  console.log("  OK: excel import audit aligned");

  console.log("12. Safety...");
  assert(
    !readRepo("components/customers/data-upload-panel.tsx").includes(
      "/api/send-customer-email",
    ),
    "no customer send route in upload UI",
  );
  try {
    readRepo("app/api/send-customer-email/route.ts");
    assert(false, "send-customer-email route must not exist");
  } catch {
    // expected
  }
  const importLibs = [
    "lib/import-multisheet-validation.ts",
    "lib/imported-contacts.ts",
    "components/customers/data-upload-panel.tsx",
  ];
  for (const file of importLibs) {
    const src = readRepo(file);
    assert(!src.includes("@sendgrid/mail"), `${file} must not call SendGrid`);
  }
  console.log("  OK: no SendGrid/customer-send/automatic sending in import path");

  console.log("\nL-1F stable verification script passed.");
}

main();
