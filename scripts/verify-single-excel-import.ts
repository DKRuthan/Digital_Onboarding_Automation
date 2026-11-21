import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";

import { normalizeContactEmail } from "../lib/import-contact-email";
import {
  buildContactsForDisplay,
} from "../lib/customer-contacts";
import {
  buildImportedContactsFromNormalized,
  replaceImportedContacts,
} from "../lib/imported-contacts";
import { buildReportsSnapshot } from "../lib/reports-snapshot";
import {
  buildExcelImportAuditMetadata,
  EXCEL_IMPORT_AUDIT_COUNT_KEYS,
} from "../lib/audit/excel-import-audit";
import { validateNormalizedMultisheetImport } from "../lib/import-multisheet-cross-validation";
import { getUiAuditPermission } from "../lib/audit/ui-audit-events";
import {
  MultisheetParserError,
  parseTargetMultisheetWorkbook,
} from "../lib/import-multisheet-parser";
import type { NormalizedImport } from "../lib/import-multisheet-parser";
import { validateTargetMultisheetWorkbook } from "../lib/import-multisheet-validation";
import {
  REQUIRED_ACCOUNTS_COLUMNS,
  REQUIRED_CONTACTS_COLUMNS,
  REQUIRED_SIGNALS_COLUMNS,
} from "../lib/import-sheet-schema";
import {
  EXCEL_IMPORT_TEMPLATE_FILENAME,
  buildFlatImportWorkbook,
  buildTargetMultisheetWorkbook,
  TARGET_ACCOUNTS_COLUMNS,
} from "../lib/import-templates";
import { FLAT_JOURNEY_IMPORT_SHEET_NAME, FLAT_ROW2_COLUMNS } from "../lib/import-flat-row2-schema";
import { parseImportWorkbook } from "../lib/import-workbook-router";

const ROOT = join(import.meta.dirname ?? __dirname, "..");

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

function readRepoFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function hasCode(issues: { code: string }[], code: string): boolean {
  return issues.some((issue) => issue.code === code);
}

const DEFAULT_SHEET_HEADERS = {
  accounts: [...REQUIRED_ACCOUNTS_COLUMNS, "plan", "stage", "owner_dam_email"],
  contacts: [
    ...REQUIRED_CONTACTS_COLUMNS,
    "contact_name",
    "do_not_contact",
  ],
  signals: [...REQUIRED_SIGNALS_COLUMNS],
};

const SAMPLE_ACCOUNT = {
  customer_id: "CUST-001",
  customer_name: "Demo Customer 001",
  plan: "Enterprise",
  stage: "Onboarding",
  owner_dam_email: "ash.demo@team.example.com",
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

function baseImport(
  partial: Partial<NormalizedImport> & Pick<NormalizedImport, "accounts" | "contacts">,
): NormalizedImport {
  return {
    format: "option_c",
    headerMode: "legacy_single_row",
    sheetNames: ["Accounts", "Contacts", "Signals"],
    signals: [],
    sheetHeaders: DEFAULT_SHEET_HEADERS,
    ...partial,
  };
}

function grepNoSendgridCallsInImportLibs(): void {
  const paths = [
    "components/customers/data-upload-panel.tsx",
    "lib/import-templates.ts",
    "lib/import-format-detection.ts",
    "lib/import-multisheet-parser.ts",
    "lib/import-multisheet-validation.ts",
    "lib/import-multisheet-cross-validation.ts",
    "lib/import-contact-email.ts",
  ];

  for (const relativePath of paths) {
    const content = readRepoFile(relativePath);
    assert(
      !content.includes("@sendgrid/mail") && !content.includes('from "@sendgrid'),
      `${relativePath} must not import SendGrid`,
    );
    assert(
      !content.includes("POST /api/send") && !content.includes('fetch("/api/send'),
      `${relativePath} must not call send API routes`,
    );
  }
}

function main(): void {
  console.log("A. Customer Data UI — single Excel template button...");
  const uploadPanel = readRepoFile("components/customers/data-upload-panel.tsx");

  assert(
    !uploadPanel.includes("Download Current Upload Template"),
    "Download Current Upload Template must not appear in Customer Data UI",
  );
  assert(
    !uploadPanel.includes("Download Target Multi-Sheet Template"),
    "Download Target Multi-Sheet Template must not appear in Customer Data UI",
  );
  assert(
    uploadPanel.includes("Download Excel Import Template"),
    "Download Excel Import Template must appear in Customer Data UI",
  );
  assert(
    uploadPanel.includes("downloadExcelImportTemplate"),
    "data-upload-panel must call downloadExcelImportTemplate",
  );
  assert(
    !uploadPanel.includes("current-upload-template.csv"),
    "CSV template filename must not be exposed in Customer Data UI",
  );
  assert(
    uploadPanel.includes('accept=".xlsx"'),
    'upload input accept should be ".xlsx"',
  );
  console.log("  OK: single template button and XLSX-only accept");

  console.log("B. Template workbook structure (public flat template)...");
  const workbook = buildFlatImportWorkbook();
  const sheetNames = workbook.SheetNames.map((name) => name.toLowerCase());
  assert(
    sheetNames.includes("journey import"),
    "template must include Journey Import sheet",
  );
  assert(sheetNames.includes("field guide"), "template should include Field Guide sheet");
  assert(!sheetNames.includes("signals"), "public template must not include Signals sheet");
  assert(
    readRepoFile("lib/import-templates.ts").includes(EXCEL_IMPORT_TEMPLATE_FILENAME),
    "excel-import-template.xlsx must be defined for download",
  );
  assert(
    readRepoFile("lib/import-templates.ts").includes("buildFlatImportWorkbook"),
    "download must use buildFlatImportWorkbook",
  );

  const parsedTemplate = parseImportWorkbook(workbook);
  assert(
    parsedTemplate.headerMode === "flat_row2",
    "download template must parse as flat_row2 headerMode",
  );
  const journeyMatrix = XLSX.utils.sheet_to_json<unknown[]>(
    workbook.Sheets[FLAT_JOURNEY_IMPORT_SHEET_NAME]!,
    { header: 1, defval: "" },
  );
  assert(
    String(journeyMatrix[0]?.[0] ?? "").includes("Account"),
    "Row 1 must contain human-friendly labels",
  );
  assert(journeyMatrix[1]?.[0] === "account_id", "Row 2 must contain system keys");
  assert(
    journeyMatrix[2]?.[0] === "ACCT-001",
    "first data row must start at Row 3",
  );
  const row2 = (journeyMatrix[1] as string[]) ?? [];
  for (const key of FLAT_ROW2_COLUMNS) {
    assert(row2.includes(key), `Row 2 must include flat key ${key}`);
  }
  console.log("  OK: flat Row 2 template with Journey Import + Field Guide");

  console.log("B1. Internal L-2 multi-sheet template still available...");
  const l2Workbook = buildTargetMultisheetWorkbook();
  const l2Sheets = l2Workbook.SheetNames.map((name) => name.toLowerCase());
  assert(l2Sheets.includes("accounts"), "L-2 internal template must include Accounts");
  assert(l2Sheets.includes("contacts"), "L-2 internal template must include Contacts");
  assert(l2Sheets.includes("signals"), "L-2 internal template must include Signals");
  assert(
    TARGET_ACCOUNTS_COLUMNS[0] === "account_id",
    "L-2 template Accounts Row 2 must use account_id",
  );
  console.log("  OK: L-2 multi-sheet builder retained for fallback/tests");

  console.log("B2. Customer Data UI Row 2 copy...");
  assert(
    uploadPanel.includes("Row 1 is for readable labels"),
    "upload panel must explain Row 1 labels",
  );
  assert(
    uploadPanel.includes("Row 2 contains system keys"),
    "upload panel must explain Row 2 system keys",
  );
  assert(
    uploadPanel.includes("Row 3 onward contains data"),
    "upload panel must explain Row 3+ data rows",
  );
  assert(
    uploadPanel.includes("Journey Import sheet"),
    "upload panel must explain Journey Import sheet",
  );
  assert(
    uploadPanel.includes("Account ID can repeat"),
    "upload panel must explain repeated account_id",
  );
  assert(
    uploadPanel.includes("contact email must be unique"),
    "upload panel must explain unique contact_email",
  );
  assert(
    uploadPanel.includes("Flat Row 2 workbook") ||
      uploadPanel.includes("Row 2 Excel workbook") ||
      uploadPanel.includes("legacy_single_row"),
    "upload panel format notice must distinguish flat, Row 2, and legacy",
  );
  console.log("  OK: UI copy mentions Row 1 / Row 2 / Row 3");

  console.log("C. normalizeContactEmail helper...");
  assert(
    normalizeContactEmail("  Admin@Customer-001.EXAMPLE.COM  ") === "admin@customer-001.example.com",
    "normalizeContactEmail should trim and lowercase",
  );
  assert(normalizeContactEmail("") === "", "empty email stays empty");
  console.log("  OK: normalizeContactEmail trim + lowercase");

  console.log("D. Missing Signals sheet is a blocker...");
  const noSignalsWorkbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    noSignalsWorkbook,
    XLSX.utils.aoa_to_sheet([["customer_id", "customer_name"], ["CUST-001", "Demo Customer 001"]]),
    "Accounts",
  );
  XLSX.utils.book_append_sheet(
    noSignalsWorkbook,
    XLSX.utils.aoa_to_sheet([
      ["contact_email", "contact_role", "customer_id"],
      ["admin@customer-001.example.com", "Admin", "CUST-001"],
    ]),
    "Contacts",
  );
  let parseFailed = false;
  try {
    parseTargetMultisheetWorkbook(noSignalsWorkbook);
  } catch (error) {
    parseFailed = error instanceof MultisheetParserError;
  }
  assert(parseFailed, "missing Signals sheet should fail parse");
  console.log("  OK: missing Signals sheet rejected");

  console.log("E. Missing required columns are blockers...");
  const missingColumnsImport = baseImport({
    accounts: [SAMPLE_ACCOUNT],
    contacts: [
      {
        contact_email: "admin@customer-001.example.com",
        contact_role: "Admin",
        customer_id: "CUST-001",
      },
    ],
    sheetHeaders: {
      accounts: ["customer_id"],
      contacts: [...REQUIRED_CONTACTS_COLUMNS],
      signals: [...REQUIRED_SIGNALS_COLUMNS],
    },
  });
  const missingColumnsResult =
    validateNormalizedMultisheetImport(missingColumnsImport);
  assert(missingColumnsResult.passed === false, "missing columns should fail");
  assert(
    hasCode(missingColumnsResult.blockers, "SHEET_MISSING_REQUIRED_COLUMN"),
    "expected SHEET_MISSING_REQUIRED_COLUMN blocker",
  );
  console.log("  OK: missing required column produces blocker");

  console.log("F. Global duplicate contact_email blocker...");
  const duplicateResult = validateNormalizedMultisheetImport(
    baseImport({
      accounts: [SAMPLE_ACCOUNT],
      contacts: [
        {
          contact_email: "admin@customer-001.example.com",
          contact_role: "Admin",
          customer_id: "CUST-001",
        },
        {
          contact_email: "Admin@Customer-001.example.com",
          contact_role: "User",
          customer_id: "CUST-001",
        },
      ],
    }),
  );
  assert(duplicateResult.passed === false, "duplicate emails should fail");
  assert(
    hasCode(duplicateResult.blockers, "CONTACT_DUPLICATE_EMAIL"),
    "expected CONTACT_DUPLICATE_EMAIL blocker",
  );
  console.log("  OK: case-insensitive duplicate contact_email blocked");

  console.log("G. Unsupported contact_role is warning...");
  const badRoleResult = validateNormalizedMultisheetImport(
    baseImport({
      accounts: [SAMPLE_ACCOUNT],
      contacts: [
        {
          contact_email: "admin@customer-001.example.com",
          contact_role: "Owner",
          customer_id: "CUST-001",
        },
      ],
    }),
  );
  assert(badRoleResult.passed === true, "unsupported role should not block");
  assert(
    hasCode(badRoleResult.warnings, "CONTACT_UNSUPPORTED_ROLE"),
    "expected CONTACT_UNSUPPORTED_ROLE warning",
  );
  assert(
    !hasCode(badRoleResult.blockers, "CONTACT_UNSUPPORTED_ROLE"),
    "unsupported role must not be blocker",
  );
  console.log("  OK: unsupported contact_role is warning only");

  console.log("H. Signal orphan contact_email blocker...");
  const orphanSignalResult = validateNormalizedMultisheetImport(
    baseImport({
      accounts: [SAMPLE_ACCOUNT],
      contacts: [
        {
          contact_email: "admin@customer-001.example.com",
          contact_role: "Admin",
          customer_id: "CUST-001",
        },
      ],
      signals: [
        {
          contact_email: "ghost@customer-001.example.com",
          customer_id: "CUST-001",
          sent_at: "2026-06-01T10:00:00Z",
          template_or_type: "invite-reminder",
          channel: "email",
          status: "Delivered",
        },
      ],
    }),
  );
  assert(orphanSignalResult.passed === false, "orphan signal email should fail");
  assert(
    hasCode(orphanSignalResult.blockers, "SIGNAL_UNKNOWN_CONTACT_EMAIL"),
    "expected SIGNAL_UNKNOWN_CONTACT_EMAIL blocker",
  );
  console.log("  OK: orphan Signals.contact_email blocked");

  console.log("I. Signal orphan customer_id blocker...");
  const orphanCustomerResult = validateNormalizedMultisheetImport(
    baseImport({
      accounts: [SAMPLE_ACCOUNT],
      contacts: [
        {
          contact_email: "admin@customer-001.example.com",
          contact_role: "Admin",
          customer_id: "CUST-001",
        },
      ],
      signals: [
        {
          contact_email: "admin@customer-001.example.com",
          customer_id: "CUST-999",
          sent_at: "2026-06-01T10:00:00Z",
          template_or_type: "invite-reminder",
          channel: "email",
          status: "Delivered",
        },
      ],
    }),
  );
  assert(orphanCustomerResult.passed === false, "orphan signal customer_id should fail");
  assert(
    hasCode(orphanCustomerResult.blockers, "SIGNAL_UNKNOWN_CUSTOMER_ID") ||
      hasCode(orphanCustomerResult.blockers, "SIGNAL_CONTACT_CUSTOMER_MISMATCH"),
    "expected signal customer_id blocker",
  );
  console.log("  OK: orphan Signals.customer_id blocked");

  console.log("J. Repeated Signals.contact_email allowed...");
  const repeatSignalResult = validateNormalizedMultisheetImport(
    baseImport({
      accounts: [SAMPLE_ACCOUNT],
      contacts: [
        {
          contact_email: "admin@customer-001.example.com",
          contact_role: "Admin",
          customer_id: "CUST-001",
        },
      ],
      signals: [
        {
          contact_email: "admin@customer-001.example.com",
          customer_id: "CUST-001",
          sent_at: "2026-06-01T10:00:00Z",
          template_or_type: "a",
          channel: "email",
          status: "Delivered",
        },
        {
          contact_email: "admin@customer-001.example.com",
          customer_id: "CUST-001",
          sent_at: "2026-06-02T10:00:00Z",
          template_or_type: "b",
          channel: "email",
          status: "Delivered",
        },
      ],
    }),
  );
  assert(repeatSignalResult.passed === true, "repeated signal emails should pass");
  console.log("  OK: repeated signal contact_email allowed");

  console.log("K. Signals do not create contacts...");
  const signalsOnlyResult = validateNormalizedMultisheetImport(
    baseImport({
      accounts: [SAMPLE_ACCOUNT],
      contacts: [
        {
          contact_email: "admin@customer-001.example.com",
          contact_role: "Admin",
          customer_id: "CUST-001",
        },
      ],
      signals: [
        {
          contact_email: "newperson@customer-001.example.com",
          customer_id: "CUST-001",
          sent_at: "2026-06-01T10:00:00Z",
          template_or_type: "invite-reminder",
          channel: "email",
          status: "Delivered",
        },
      ],
    }),
  );
  assert(signalsOnlyResult.passed === false, "signal-only email must not pass");
  assert(
    hasCode(signalsOnlyResult.blockers, "SIGNAL_UNKNOWN_CONTACT_EMAIL"),
    "unknown signal email should block, not create contact",
  );
  console.log("  OK: signals do not create contacts");

  console.log("L. Safety — no SendGrid or customer send routes...");
  grepNoSendgridCallsInImportLibs();
  assert(
    !uploadPanel.includes("/api/send-customer-email"),
    "import UI must not call customer send route",
  );
  console.log("  OK: no SendGrid/customer-send wiring added");

  console.log("M. Provider importedContacts session state...");
  const providerSource = readRepoFile(
    "components/providers/customer-data-provider.tsx",
  );
  assert(
    providerSource.includes("importedContacts"),
    "provider must expose importedContacts state",
  );
  assert(
    providerSource.includes("setImportedContacts(payload.importedContacts)"),
    "apply must replace importedContacts from payload",
  );
  assert(
    providerSource.includes("ApplyUploadedDataPayload"),
    "applyUploadedCustomers must accept customers + importedContacts payload",
  );
  assert(
    providerSource.includes("setImportedContacts([])") &&
      providerSource.includes("restoreDemoData"),
    "restoreDemoData must clear importedContacts",
  );
  console.log("  OK: provider importedContacts state and apply payload");

  console.log("N. importedContacts sourced from Contacts sheet with replace semantics...");
  const multiContactImport = baseImport({
    accounts: [SAMPLE_ACCOUNT],
    contacts: [
      {
        contact_email: "admin@customer-001.example.com",
        contact_role: "Admin",
        customer_id: "CUST-001",
      },
      {
        contact_email: "  User@Customer-001.EXAMPLE.COM ",
        contact_role: "User",
        customer_id: "CUST-001",
      },
      {
        contact_email: "extra@customer-001.example.com",
        contact_role: "CSM",
        customer_id: "CUST-001",
        contact_name: "Extra Person",
        do_not_contact: "Yes",
      },
    ],
  });
  const builtContacts = buildImportedContactsFromNormalized(multiContactImport);
  assert(builtContacts.length === 3, "all Contacts sheet rows must be preserved");
  assert(
    builtContacts[1].contact_email === "user@customer-001.example.com",
    "importedContacts contact_email must be normalized",
  );
  assert(builtContacts[2].do_not_contact === true, "do_not_contact should be boolean");
  assert(
    builtContacts[2].customer_name === "Demo Customer 001",
    "customer_name should resolve from Accounts sheet",
  );
  const firstBatch = builtContacts.slice(0, 1);
  const replaced = replaceImportedContacts(firstBatch, builtContacts);
  assert(replaced.length === 3 && firstBatch.length === 1, "replace must not append");
  console.log("  OK: full Contacts sheet preserved with normalized emails");

  console.log("O. Validation returns importedContacts for apply...");
  const templateWorkbook = buildTargetMultisheetWorkbook();
  const validationResult = validateTargetMultisheetWorkbook(templateWorkbook);
  assert(validationResult.passed === true, "template workbook should pass validation");
  assert(
    Array.isArray(validationResult.importedContacts) &&
      validationResult.importedContacts.length > 0,
    "validation must return importedContacts for apply",
  );
  assert(
    validationResult.importedContacts!.length ===
      (validationResult.importSummary?.contactsCount ?? 0),
    "importedContacts count should match Contacts sheet count",
  );
  console.log("  OK: validation exposes importedContacts aligned with Contacts sheet");

  console.log("P. Excel import audit actions...");
  const auditSource = readRepoFile("lib/audit/ui-audit-events.ts");
  assert(
    auditSource.includes('"data.excel_import.validate"'),
    "excel_import.validate must be in UI audit allowlist",
  );
  assert(
    auditSource.includes('"data.excel_import.apply"'),
    "excel_import.apply must be in UI audit allowlist",
  );
  assert(
    uploadPanel.includes("data.excel_import.validate"),
    "option_c validate should emit data.excel_import.validate",
  );
  assert(
    uploadPanel.includes("data.excel_import.apply"),
    "option_c apply should emit data.excel_import.apply",
  );
  console.log("  OK: excel import audit actions wired for option_c");

  console.log("Q. Session export supports imported contacts...");
  const sessionExport = readRepoFile("lib/session-export.ts");
  assert(
    sessionExport.includes("buildImportedContactsExportCsv"),
    "session export must support imported contacts CSV",
  );
  assert(
    sessionExport.includes("contact_email") &&
      sessionExport.includes("do_not_contact"),
    "imported contact export must include safe fields only",
  );
  console.log("  OK: session export includes safe imported contact fields");

  console.log("R. Contacts display uses importedContacts when upload active...");
  const contactsTable = readRepoFile("components/customers/contacts-table.tsx");
  const customerContacts = readRepoFile("lib/customer-contacts.ts");
  assert(
    customerContacts.includes("buildContactsForDisplay"),
    "customer-contacts must expose buildContactsForDisplay",
  );
  assert(
    contactsTable.includes("buildContactsForDisplay"),
    "contacts-table must use buildContactsForDisplay",
  );
  assert(
    contactsTable.includes("importedContacts") &&
      contactsTable.includes("dataSource"),
    "contacts-table must read importedContacts and dataSource from provider",
  );
  assert(
    contactsTable.includes("contact_name") && contactsTable.includes("do_not_contact"),
    "contacts-table must display contact_name and do_not_contact",
  );
  assert(
    contactsTable.includes("exportImportedContactsCsv"),
    "contacts export must use importedContacts CSV when upload active",
  );

  const importedDisplay = buildContactsForDisplay({
    customers: [],
    importedContacts: builtContacts,
    dataSource: "upload",
  });
  assert(importedDisplay.source === "imported", "upload mode should use imported source");
  assert(
    importedDisplay.contacts.length === 3,
    "display should include all imported contact rows",
  );
  assert(
    importedDisplay.contacts.every(
      (contact) => contact.contact_email === contact.contact_email.toLowerCase(),
    ),
    "display contacts must keep normalized emails",
  );
  const emailSet = new Set(importedDisplay.contacts.map((c) => c.contact_email));
  assert(
    emailSet.size === importedDisplay.contacts.length,
    "display must be one row per unique contact_email",
  );

  const demoDisplay = buildContactsForDisplay({
    customers: [],
    importedContacts: [],
    dataSource: "demo",
  });
  assert(demoDisplay.source === "derived", "demo mode should use derived contacts");
  console.log("  OK: importedContacts drive Contacts tab; demo falls back to derived");

  console.log("S. Reports snapshot supports importedContacts...");
  const reportsSnapshot = buildReportsSnapshot({
    customers: [],
    importedContacts: builtContacts,
    dataSource: "upload",
    actionQueue: [],
    sendLogs: [],
    emailSequences: [],
    enrollments: [],
    rules: [],
    lastValidation: null,
  });
  assert(
    reportsSnapshot.contactJourney.totalContacts === 3,
    "reports contact count should use importedContacts in upload mode",
  );
  assert(
    reportsSnapshot.executiveOverview.totalContacts === 3,
    "executive overview contact count should use importedContacts",
  );
  console.log("  OK: reports use importedContacts counts without crashing");

  console.log("T. L-1B.5 audit, export, and copy polish...");
  assert(
    getUiAuditPermission("data.excel_import.validate") === "upload_customer_data",
    "excel_import.validate must map to upload_customer_data",
  );
  assert(
    getUiAuditPermission("data.excel_import.apply") === "upload_customer_data",
    "excel_import.apply must map to upload_customer_data",
  );

  const templateValidation = validateTargetMultisheetWorkbook(templateWorkbook);
  const auditMeta = buildExcelImportAuditMetadata(templateValidation);
  for (const key of EXCEL_IMPORT_AUDIT_COUNT_KEYS) {
    assert(
      key in auditMeta && typeof auditMeta[key] === "number",
      `audit metadata must include numeric ${key}`,
    );
  }
  assert(
    Object.keys(auditMeta).length === EXCEL_IMPORT_AUDIT_COUNT_KEYS.length,
    "audit metadata must contain counts-only keys (no extra fields)",
  );
  for (const value of Object.values(auditMeta)) {
    assert(typeof value === "number", "audit metadata values must be numbers only");
  }

  assert(
    sessionExport.includes("contact_name") &&
      sessionExport.includes("do_not_contact") &&
      sessionExport.includes("exportImportedContactsCsv"),
    "session export must support imported contact safe fields",
  );
  assert(
    contactsTable.includes('contactDataSource === "imported"') &&
      contactsTable.includes("exportImportedContactsCsv"),
    "upload mode contacts export must use importedContacts CSV",
  );
  assert(
    contactsTable.includes("derived contacts"),
    "demo mode contacts copy must mention derived contacts",
  );

  const staleUiPatterns = [
    "Download Current Upload Template",
    "Download Target Multi-Sheet Template",
    "first sheet only",
    "Extra contacts are not persisted",
    "not persisted yet",
    "Option A",
    "Option C",
    "single header row",
    "single-row header",
  ];
  const uiSources = [
    uploadPanel,
    contactsTable,
    readRepoFile("components/customers/multisheet-import-preview.tsx"),
    readRepoFile("components/customers/contacts-import-quality-preview.tsx"),
  ];
  for (const pattern of staleUiPatterns) {
    for (const source of uiSources) {
      assert(
        !source.includes(pattern),
        `user-facing UI must not include stale copy: ${pattern}`,
      );
    }
  }

  const reportsSnapshotSource = readRepoFile("lib/reports-snapshot.ts");
  assert(
    !reportsSnapshotSource.includes("Extra contacts beyond MVP rollup are not persisted"),
    "reports data gaps must not claim extra contacts are unpersisted",
  );

  const replaceAfterReupload = replaceImportedContacts(builtContacts, builtContacts);
  assert(
    replaceAfterReupload.length === builtContacts.length,
    "re-upload must replace importedContacts without doubling count",
  );

  console.log("  OK: audit counts-only, exports aligned, stale UI copy removed");

  console.log("\nAll single Excel import L-1B checks passed (L-1B.1 through L-1B.5).");
}

main();
