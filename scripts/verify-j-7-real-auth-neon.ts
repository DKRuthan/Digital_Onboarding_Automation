/**
 * Phase J-7 — real Clerk + Neon verification (manual env required).
 *
 * Preconditions (process.env or loaded .env.local via Next dev):
 *   AUTH_ENABLED=true
 *   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY
 *   DATABASE_URL, DEFAULT_WORKSPACE_ID, AUDIT_ENABLED=true
 *
 * Optional:
 *   J7_BASE_URL — app base URL (default http://localhost:3000)
 *
 * Live API/session tests require a running server with auth enabled.
 * Role-by-role browser checks remain manual (Clerk sign-in).
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";
import {
  getPermissionsForRole,
  roleHasPermission,
} from "../lib/auth/permissions";
import { isClerkAuthActive } from "../lib/auth/session";
import {
  getDefaultWorkspaceId,
  isAuditEnabled,
  shouldPersistAudit,
} from "../lib/audit/audit-env";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

function warn(message: string): void {
  console.warn(`WARN: ${message}`);
}

const FORBIDDEN_METADATA_PATTERNS = [
  /sendgrid_api_key/i,
  /clerk_secret/i,
  /database_url/i,
  /\bSG\.[A-Za-z0-9_-]{10,}/,
  /<html[\s>]/i,
  /"body"\s*:\s*"/i,
  /authoritative"\s*:\s*true/i,
];

const REQUIRED_ENV = [
  "AUTH_ENABLED",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "DATABASE_URL",
  "DEFAULT_WORKSPACE_ID",
  "AUDIT_ENABLED",
] as const;

function envStatus(key: string): string {
  const v = process.env[key]?.trim();
  if (!v) return "missing";
  if (key.includes("KEY") || key === "CLERK_SECRET_KEY" || key === "DATABASE_URL") {
    return `set (${v.length} chars)`;
  }
  return v === "true" || v === "false" ? v : `set (${v.length} chars)`;
}

async function fetchStatus(
  baseUrl: string,
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: string }> {
  const res = await fetch(`${baseUrl}${path}`, init);
  const body = await res.text();
  return { status: res.status, body };
}

async function checkPreconditions(): Promise<boolean> {
  console.log("A. J-7 environment preconditions...");
  let allOk = true;
  for (const key of REQUIRED_ENV) {
    const status = envStatus(key);
    console.log(`   ${key}: ${status}`);
    if (status === "missing") allOk = false;
  }

  if (process.env.AUTH_ENABLED?.trim().toLowerCase() !== "true") allOk = false;
  if (process.env.AUDIT_ENABLED?.trim().toLowerCase() !== "true") allOk = false;

  assert(isClerkAuthActive(), "Clerk auth must be active (AUTH_ENABLED + Clerk keys)");
  assert(isAuditEnabled(), "AUDIT_ENABLED must be true");
  assert(shouldPersistAudit(), "DATABASE_URL required when AUDIT_ENABLED=true");

  console.log("   Send gates (should stay off for J-7):");
  console.log(
    `   INTERNAL_SEND_API_ENABLED: ${envStatus("INTERNAL_SEND_API_ENABLED")}`,
  );
  console.log(
    `   SENDGRID_TEST_SEND_ENABLED: ${envStatus("SENDGRID_TEST_SEND_ENABLED")}`,
  );

  return allOk;
}

async function checkRbacMatrix(): Promise<void> {
  console.log("B. RBAC matrix (static)...");
  assert(roleHasPermission("Admin", "view_audit_logs"), "Admin has view_audit_logs");
  assert(roleHasPermission("Developer", "view_audit_logs"), "Developer has view_audit_logs");
  assert(!roleHasPermission("Operator", "view_audit_logs"), "Operator lacks view_audit_logs");
  assert(!roleHasPermission("Viewer", "view_audit_logs"), "Viewer lacks view_audit_logs");
  assert(!roleHasPermission("Operator", "send_test_email"), "Operator lacks send_test_email");
  assert(
    getPermissionsForRole("Viewer").length === 2,
    "Viewer has view_dashboard + export_reports only",
  );
}

async function checkNoCustomerSendRoute(): Promise<void> {
  console.log("C. No customer-send route...");
  const routePath = join(process.cwd(), "app/api/send-customer-email/route.ts");
  assert(!existsSync(routePath), "/api/send-customer-email must not exist");
}

async function checkUnauthenticatedApi(baseUrl: string): Promise<void> {
  console.log("D. Unauthenticated API → 401 (live server)...");
  const routes: Array<{ method: string; path: string; body?: string }> = [
    { method: "GET", path: "/api/internal-send-config" },
    { method: "POST", path: "/api/send-approved-internal", body: "{}" },
    { method: "POST", path: "/api/send-test-email", body: "{}" },
    {
      method: "POST",
      path: "/api/audit-events",
      body: JSON.stringify({ action: "queue.refresh", targetType: "action_queue" }),
    },
    { method: "GET", path: "/api/audit-logs" },
  ];

  for (const route of routes) {
    const { status } = await fetchStatus(baseUrl, route.path, {
      method: route.method,
      headers: route.body ? { "Content-Type": "application/json" } : undefined,
      body: route.body,
    });
    assert(status === 401, `${route.method} ${route.path} → 401 (got ${status})`);
  }
}

async function checkNeonSchemaAndRows(): Promise<void> {
  console.log("E. Neon audit_logs table + row hygiene...");
  const dbUrl = process.env.DATABASE_URL!.trim();
  const sql = neon(dbUrl);
  const workspaceId = getDefaultWorkspaceId();

  const tableCheck = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'audit_logs'
    ) AS exists
  `;
  assert(Boolean(tableCheck[0]?.exists), "audit_logs table must exist (apply migration)");

  const rows = await sql`
    SELECT id, workspace_id, actor_user_id, actor_role, action, result,
           source, metadata_json, permission, send_mode, created_at
    FROM audit_logs
    WHERE workspace_id = ${workspaceId}
    ORDER BY created_at DESC
    LIMIT 100
  `;

  console.log(`   Rows for workspace ${workspaceId}: ${rows.length}`);
  if (rows.length === 0) {
    warn(
      "No audit rows yet — trigger API/UI/denied events via browser before re-run",
    );
    return;
  }

  const actions = new Set<string>();
  for (const row of rows) {
    actions.add(String(row.action));
    const metaStr = JSON.stringify(row.metadata_json ?? {});
    for (const pattern of FORBIDDEN_METADATA_PATTERNS) {
      assert(!pattern.test(metaStr), `metadata must not match ${pattern} (action=${row.action})`);
    }
    if (row.source === "ui") {
      const meta = row.metadata_json as Record<string, unknown>;
      assert(meta.authoritative === false, "UI rows must have authoritative:false");
      assert(meta.origin === "client_ui", "UI rows must have origin:client_ui");
    }
  }

  console.log(`   Recent actions: ${[...actions].slice(0, 15).join(", ")}`);
}

async function checkDashboardRedirect(baseUrl: string): Promise<void> {
  console.log("F. Unauthenticated dashboard redirect (live server)...");
  const res = await fetch(`${baseUrl}/`, { redirect: "manual" });
  const location = res.headers.get("location") ?? "";
  assert(
    res.status === 307 || res.status === 302 || res.status === 308,
    `GET / should redirect unauthenticated (got ${res.status})`,
  );
  assert(
    location.includes("sign-in"),
    `redirect should target sign-in (location=${location})`,
  );
}

async function main(): Promise<void> {
  console.log("Phase J-7 real Clerk + Neon verification\n");

  let preconditionsMet = true;
  try {
    for (const key of REQUIRED_ENV) {
      if (!process.env[key]?.trim()) preconditionsMet = false;
    }
    if (process.env.AUTH_ENABLED?.trim().toLowerCase() !== "true") {
      preconditionsMet = false;
    }
    if (process.env.AUDIT_ENABLED?.trim().toLowerCase() !== "true") {
      preconditionsMet = false;
    }
  } catch {
    preconditionsMet = false;
  }

  if (!preconditionsMet) {
    console.error("\nBLOCKED: J-7 live verification preconditions not met.\n");
    console.error("Required in .env.local (or process env):");
    for (const key of REQUIRED_ENV) {
      console.error(`  ${key}=${envStatus(key)}`);
    }
    console.error("\nAlso required:");
    console.error("  - Clerk test users with publicMetadata.role set");
    console.error("  - db/migrations/001_create_audit_logs.sql applied manually");
    console.error("  - Dev server running with auth-enabled env (npm run dev)");
    console.error("\nManual browser checklist (after env configured):");
    console.error("  1. Sign in as Admin → Reports shows Audit Logs; CSV export works");
    console.error("  2. Sign in as Operator → no Audit Logs section; ops workflow works");
    console.error("  3. Sign in as Viewer → read-only; mutations disabled");
    console.error("  4. Trigger API send (403 gate) + UI audit event; verify Neon rows");
    process.exit(2);
  }

  await checkPreconditions();
  await checkRbacMatrix();
  await checkNoCustomerSendRoute();

  const baseUrl = (process.env.J7_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

  try {
    await checkDashboardRedirect(baseUrl);
    await checkUnauthenticatedApi(baseUrl);
  } catch (err) {
    console.error(
      "\nLive server checks failed. Start dev server with auth-enabled env:",
    );
    console.error("  npm run dev");
    throw err;
  }

  await checkNeonSchemaAndRows();

  console.log("\nOK: verify-j-7-real-auth-neon passed (automated scope).");
  console.log(
    "Manual: complete role-by-role browser verification per phase-j-auth-architecture.md J-7.",
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
