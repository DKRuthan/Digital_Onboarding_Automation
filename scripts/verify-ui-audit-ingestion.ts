import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  UI_AUDIT_ACTIONS,
  buildUiAuditMetadata,
  getUiAuditPermission,
  hasForbiddenClientAuditFields,
  isAllowedUiAuditAction,
  parseUiAuditRequestBody,
} from "../lib/audit/ui-audit-events";

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

function main(): void {
  console.log("A. /api/audit-events route exists...");
  const routeSource = readFile("app/api/audit-events/route.ts");
  assert(routeSource.includes("export async function POST"), "POST handler exists");
  assert(routeSource.includes("writeAuditLog"), "route calls writeAuditLog");
  assert(routeSource.includes('source: "ui"'), "route stamps source ui");
  assert(routeSource.includes("buildUiAuditMetadata"), "route uses buildUiAuditMetadata");
  assert(routeSource.includes("requireApiPermission"), "route enforces permissions");
  assert(
    !routeSource.includes("body.actorUserId") &&
      !routeSource.includes("record.actor_user_id"),
    "route does not accept client actor fields",
  );

  console.log("B. UI action allowlist...");
  assert(UI_AUDIT_ACTIONS.length >= 40, "allowlist populated");
  assert(isAllowedUiAuditAction("queue.approve"), "queue.approve allowed");
  assert(isAllowedUiAuditAction("export.reports_csv"), "export.reports_csv allowed");
  assert(!isAllowedUiAuditAction("send.internal.success"), "API action not in UI list");

  console.log("C. Permission map...");
  assert(
    getUiAuditPermission("data.upload.apply") === "upload_customer_data",
    "upload maps to upload_customer_data",
  );
  assert(
    getUiAuditPermission("trigger.create") === "create_triggers",
    "trigger create maps correctly",
  );
  assert(
    getUiAuditPermission("send.internal.ui_click") === "send_internal_alert",
    "internal ui click maps correctly",
  );
  assert(
    getUiAuditPermission("export.reports_csv") === "export_reports",
    "export maps correctly",
  );

  console.log("D. Request body validation...");
  const unsupported = parseUiAuditRequestBody({
    action: "unknown.action",
    targetType: "test",
  });
  assert(!unsupported.ok && unsupported.error === "Unsupported audit action", "rejects unknown action");

  const forbidden = parseUiAuditRequestBody({
    action: "queue.approve",
    targetType: "action_queue_item",
    actor_user_id: "user_123",
  });
  assert(!forbidden.ok, "rejects client actor_user_id");

  const missingTarget = parseUiAuditRequestBody({ action: "queue.refresh" });
  assert(!missingTarget.ok, "rejects missing targetType");

  console.log("E. Metadata includes authoritative: false...");
  const meta = buildUiAuditMetadata({ selected_count: 2 });
  assert(meta.authoritative === false, "authoritative false");
  assert(meta.origin === "client_ui", "origin client_ui");

  console.log("F. Client helper does not send actor identity...");
  const clientSource = readFile("lib/audit/client-audit.ts");
  const bodyMatch = clientSource.match(/JSON\.stringify\(\{([\s\S]*?)\}\)/);
  const bodyPayload = bodyMatch?.[1] ?? "";
  for (const field of ["actor_user_id", "actorUserId", "actor_role", "actorRole", "workspace_id", "source"]) {
    assert(!bodyPayload.includes(field), `client fetch body must not include ${field}`);
  }
  assert(clientSource.includes("/api/audit-events"), "client posts to audit-events");
  assert(
    clientSource.includes("never throws") ||
      clientSource.includes("Non-blocking"),
    "client helper documented as non-blocking",
  );

  console.log("G. Server route rejects forbidden client fields in parser...");
  assert(
    hasForbiddenClientAuditFields({ actorRole: "Admin", action: "x" }),
    "detects forbidden actorRole",
  );

  console.log("H. Wired UI components reference recordClientAuditEvent...");
  const wiredFiles = [
    "components/customers/data-upload-panel.tsx",
    "components/automations/automations-page-content.tsx",
    "components/email-library/email-library-page-content.tsx",
    "components/sequences/sequences-page-content.tsx",
    "components/action-queue/action-queue-table.tsx",
    "components/action-queue/email-preview-modal.tsx",
    "components/reports/reports-page-content.tsx",
  ];
  for (const file of wiredFiles) {
    assert(
      readFile(file).includes("recordClientAuditEvent"),
      `${file} wires client audit`,
    );
  }

  console.log("I. Email preview audits queue.preview_opened...");
  const previewSource = readFile("components/action-queue/email-preview-modal.tsx");
  assert(previewSource.includes("queue.preview_opened"), "preview opened audited");
  assert(previewSource.includes("auto_previewed: true"), "auto_previewed metadata");

  console.log("J. safeAuditMetadata path used server-side...");
  assert(
    readFile("lib/audit/audit-log.ts").includes("safeAuditMetadata"),
    "audit-log sanitizes metadata",
  );

  console.log("K. No customer-send route added...");
  try {
    readFile("app/api/send-customer-email/route.ts");
    assert(false, "customer send route must not exist");
  } catch {
    // expected
  }

  console.log("OK: verify-ui-audit-ingestion passed");
}

main();
