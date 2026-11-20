import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AUDIT_ACTIONS } from "../lib/audit/audit-types";
import { isAuditEnabled, shouldPersistAudit } from "../lib/audit/audit-env";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

const ROOT = join(import.meta.dirname ?? __dirname, "..");

function readRoute(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function extractPostHandler(source: string): string {
  const start = source.indexOf("export async function POST");
  return start >= 0 ? source.slice(start) : source;
}

function extractGetHandler(source: string): string {
  const start = source.indexOf("export async function GET");
  return start >= 0 ? source.slice(start) : source;
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

const ROUTES = [
  "app/api/internal-send-config/route.ts",
  "app/api/send-approved-internal/route.ts",
  "app/api/send-test-email/route.ts",
] as const;

const REQUIRED_ACTIONS = [
  "auth.session.denied",
  "auth.permission.denied",
  "api.env_gate.blocked",
  "api.validation.blocked",
  "config.internal_send.read",
  "send.internal.attempt",
  "send.internal.dry_run",
  "send.internal.success",
  "send.internal.error",
  "send.test.attempt",
  "send.test.success",
  "send.test.error",
] as const;

function main(): void {
  console.log("A. All three API routes reference audit helpers...");
  for (const routePath of ROUTES) {
    const source = readRoute(routePath);
    assert(
      source.includes("@/lib/audit/api-route-audit") ||
        source.includes("recordApiPermissionDenied") ||
        source.includes("recordAuditLog"),
      `${routePath} must import/use audit helpers`,
    );
    assert(
      source.includes("recordApiPermissionDenied"),
      `${routePath} must record auth denials`,
    );
  }

  console.log("B. Expected audit action constants exist...");
  for (const action of REQUIRED_ACTIONS) {
    assert(
      (AUDIT_ACTIONS as readonly string[]).includes(action),
      `AUDIT_ACTIONS must include ${action}`,
    );
  }

  console.log("C. Route files reference expected audit actions...");
  const configRoute = readRoute(ROUTES[0]);
  assert(
    configRoute.includes("recordConfigInternalSendRead"),
    "internal-send-config audits config read",
  );

  const internalRoute = readRoute(ROUTES[1]);
  const auditHelper = readRoute("lib/audit/api-route-audit.ts");
  assert(
    internalRoute.includes("recordApiEnvGateBlocked"),
    "send-approved-internal audits env gate",
  );
  assert(
    internalRoute.includes("recordApiValidationBlocked"),
    "send-approved-internal audits validation",
  );
  assert(
    internalRoute.includes("recordInternalSendAttempt"),
    "send-approved-internal audits attempt",
  );
  assert(
    internalRoute.includes("recordInternalSendOutcome"),
    "send-approved-internal audits outcomes",
  );
  for (const action of [
    "api.env_gate.blocked",
    "api.validation.blocked",
    "send.internal.attempt",
    "send.internal.dry_run",
    "send.internal.success",
    "send.internal.error",
  ]) {
    assert(auditHelper.includes(action), `api-route-audit must define ${action}`);
  }

  const testRoute = readRoute(ROUTES[2]);
  assert(testRoute.includes("recordApiEnvGateBlocked"), "test route audits env gate");
  assert(testRoute.includes("recordApiValidationBlocked"), "test route audits validation");
  assert(testRoute.includes("recordTestSendAttempt"), "test route audits attempt");
  assert(testRoute.includes("recordTestSendOutcome"), "test route audits outcomes");
  for (const action of [
    "send.test.attempt",
    "send.test.success",
    "send.test.error",
  ]) {
    assert(auditHelper.includes(action), `api-route-audit must define ${action}`);
  }
  assert(
    auditHelper.includes("config.internal_send.read"),
    "api-route-audit defines config read action",
  );

  console.log("D. Guard order preserved (session → permission → env → validation → execute)...");
  const internalHandler = extractPostHandler(internalRoute);
  const internalGuardOrder =
    internalHandler.indexOf("requireApiPermission") <
      internalHandler.indexOf("isInternalSendApiEnabled") &&
    internalHandler.indexOf("isInternalSendApiEnabled") <
      internalHandler.indexOf("validateInternalSendRequest") &&
    internalHandler.indexOf("validateInternalSendRequest") <
      internalHandler.indexOf("recordInternalSendAttempt") &&
    internalHandler.indexOf("recordInternalSendAttempt") <
      internalHandler.indexOf("sendInternalAlertViaSendGrid");

  assert(internalGuardOrder, "internal send guard order intact");

  const testHandler = extractPostHandler(testRoute);
  const testGuardOrder =
    testHandler.indexOf("requireApiPermission") <
      testHandler.indexOf("isTestSendApiEnabled") &&
    testHandler.indexOf("isTestSendApiEnabled") <
      testHandler.indexOf("REQUIRED_FIELDS") &&
    testHandler.indexOf("recordTestSendAttempt") <
      testHandler.indexOf("sendTestEmailViaSendGrid");

  assert(testGuardOrder, "test send guard order intact");

  const configHandler = extractGetHandler(configRoute);
  assert(
    configHandler.indexOf("requireApiPermission") <
      configHandler.indexOf("recordConfigInternalSendRead"),
    "config route auth before audit success",
  );

  console.log("E. Sensitive keys not passed in route metadata helpers...");
  const metaStart = internalRoute.indexOf("function internalSendAttemptMetadata");
  const postStart = internalRoute.indexOf("export async function POST");
  assert(metaStart >= 0 && postStart > metaStart, "internal metadata helper found");
  const internalMetaFn = internalRoute.slice(metaStart, postStart);
  assert(
    internalMetaFn.includes("recipient_type_label"),
    "internal route uses recipient_type_label not raw recipient",
  );
  const metaReturnBlock = internalMetaFn.slice(
    internalMetaFn.indexOf("return {"),
    internalMetaFn.lastIndexOf("};"),
  );
  assert(
    !metaReturnBlock.includes("deliverTo") &&
      !metaReturnBlock.match(/\b(body|subject|recipient|contact_email|admin_email|user_email):\s/),
    "internal metadata return must not include sensitive fields",
  );
  const testAttemptBlock = testHandler.slice(
    testHandler.indexOf("recordTestSendAttempt"),
    testHandler.indexOf("sendTestEmailViaSendGrid"),
  );
  assert(
    !testAttemptBlock.includes("body") && !testAttemptBlock.includes("subject"),
    "test route attempt metadata must not include body/subject",
  );
  assert(
    readRoute("lib/audit/audit-log.ts").includes("safeAuditMetadata"),
    "audit pipeline uses safeAuditMetadata sanitizer",
  );

  console.log("F. No customer-send route added...");
  try {
    readRoute("app/api/send-customer-email/route.ts");
    assert(false, "customer send route must not exist");
  } catch {
    // expected — route does not exist
  }

  console.log("G. Audit no-op when AUDIT_ENABLED=false...");
  withEnv({ AUDIT_ENABLED: "false", DATABASE_URL: "postgres://x" }, () => {
    assert(!isAuditEnabled(), "audit disabled");
    assert(!shouldPersistAudit(), "recordAuditLog would no-op when disabled");
  });

  console.log("OK: verify-api-audit-logging passed");
}

main();
