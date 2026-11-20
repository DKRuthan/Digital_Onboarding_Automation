import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isAuditDatabaseConfigured,
  isAuditEnabled,
} from "../lib/audit/audit-env";
import {
  AUDIT_LOG_CSV_COLUMNS,
  exportAuditLogsCsv,
} from "../lib/audit/audit-export-csv";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

const ROOT = join(import.meta.dirname ?? __dirname, "..");

function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const savedEnv = { ...process.env };

function withEnv(
  overrides: Record<string, string | undefined>,
  fn: () => void,
): void {
  process.env = { ...savedEnv, ...overrides };
  try {
    fn();
  } finally {
    process.env = { ...savedEnv };
  }
}

async function main(): Promise<void> {
  console.log("A. audit read helper exists...");
  const readSource = readFile("lib/audit/audit-read.ts");
  assert(readSource.includes("listAuditLogs"), "listAuditLogs exported");
  assert(readSource.includes("isAuditReadConfigured"), "isAuditReadConfigured exported");
  assert(readSource.includes('"server-only"'), "server-only import");

  console.log("B. API route /api/audit-logs exists...");
  const routeSource = readFile("app/api/audit-logs/route.ts");
  assert(routeSource.includes("export async function GET"), "GET handler");
  assert(routeSource.includes("view_audit_logs"), "requires view_audit_logs");
  assert(routeSource.includes("listAuditLogs"), "uses listAuditLogs");
  assert(routeSource.includes('format === "csv"'), "supports CSV export");

  console.log("C. read helper uses SELECT only...");
  assert(readSource.includes("SELECT"), "SELECT query present");
  assert(!readSource.match(/\bUPDATE\b/i), "no UPDATE in audit-read");
  assert(!readSource.match(/\bDELETE\b/i), "no DELETE in audit-read");

  console.log("D. disabled/not-configured safe results...");
  withEnv({ AUDIT_ENABLED: "false", DATABASE_URL: "postgres://x" }, () => {
    assert(!isAuditEnabled(), "disabled when AUDIT_ENABLED false");
    assert(!isAuditEnabled() || !isAuditDatabaseConfigured(), "not read-ready when disabled");
  });
  withEnv({ AUDIT_ENABLED: "true", DATABASE_URL: "" }, () => {
    assert(isAuditEnabled(), "enabled flag true");
    assert(!isAuditDatabaseConfigured(), "db not configured without url");
  });

  console.log("E. CSV export excludes secrets and metadata...");
  const csv = exportAuditLogsCsv([
    {
      id: "1",
      created_at: "2026-01-01T00:00:00.000Z",
      action: "queue.approve",
      result: "success",
      source: "ui",
      severity: "info",
      actor_role: "Admin",
      target_type: "action_queue_item",
      target_id: "aq-1",
      permission: "approve_queue_actions",
      send_mode: null,
      request_id: "req-1",
    },
  ]);
  assert(csv.includes("created_at"), "CSV has header");
  assert(!csv.includes("metadata"), "CSV excludes metadata column");
  assert(!csv.includes("body"), "CSV excludes body");
  assert(!csv.includes("deliverTo"), "CSV excludes deliverTo");
  for (const column of AUDIT_LOG_CSV_COLUMNS) {
    assert(csv.includes(column), `CSV includes ${column}`);
  }

  console.log("F. UI handles disabled/not-configured state...");
  const uiSource = readFile("components/reports/audit-logs-report-section.tsx");
  assert(uiSource.includes("Audit enabled"), "status card for enabled");
  assert(uiSource.includes("Database configured"), "status card for DB");
  assert(uiSource.includes("Rows shown"), "status card for row count");
  assert(uiSource.includes("view_audit_logs"), "uses view_audit_logs permission");
  assert(uiSource.includes("message"), "shows server message");
  assert(uiSource.includes("/api/audit-logs"), "fetches audit logs API");

  console.log("G. Reports page includes audit section...");
  const reportsSource = readFile("components/reports/reports-page-content.tsx");
  assert(reportsSource.includes("AuditLogsReportSection"), "reports wires audit section");

  console.log("H. no customer-send route added...");
  try {
    readFile("app/api/send-customer-email/route.ts");
    assert(false, "customer send route must not exist");
  } catch {
    // expected
  }

  console.log("OK: verify-audit-read-export passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
