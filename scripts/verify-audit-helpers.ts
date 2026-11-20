import {
  getDefaultWorkspaceId,
  isAuditEnabled,
  shouldPersistAudit,
} from "../lib/audit/audit-env";
import { AUDIT_ACTIONS, isAllowedAuditAction } from "../lib/audit/audit-types";
import {
  AUDIT_METADATA_MAX_BYTES,
  hashAuditValue,
  redactSensitiveKeys,
  safeAuditMetadata,
  truncateAuditString,
} from "../lib/audit/safe-audit-metadata";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
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

function main(): void {
  console.log("A. isAuditEnabled false by default...");
  withEnv({ AUDIT_ENABLED: undefined }, () => {
    assert(!isAuditEnabled(), "default off");
  });
  withEnv({ AUDIT_ENABLED: "false" }, () => {
    assert(!isAuditEnabled(), "explicit false");
  });

  console.log("B. shouldPersistAudit requires enabled + DATABASE_URL...");
  withEnv({ AUDIT_ENABLED: "false", DATABASE_URL: "postgres://x" }, () => {
    assert(!shouldPersistAudit(), "disabled skips persist");
  });
  withEnv({ AUDIT_ENABLED: "true", DATABASE_URL: "" }, () => {
    assert(!shouldPersistAudit(), "missing url skips persist");
  });
  withEnv(
    { AUDIT_ENABLED: "true", DATABASE_URL: "postgres://example" },
    () => {
      assert(shouldPersistAudit(), "enabled + url persists");
    },
  );

  console.log("C. getDefaultWorkspaceId from env...");
  withEnv({ DEFAULT_WORKSPACE_ID: "ws_staging_001" }, () => {
    assert(
      getDefaultWorkspaceId() === "ws_staging_001",
      "uses DEFAULT_WORKSPACE_ID",
    );
  });
  withEnv({ DEFAULT_WORKSPACE_ID: "" }, () => {
    assert(
      getDefaultWorkspaceId() === "ws_unconfigured",
      "fallback when unset",
    );
  });

  console.log("D. safeAuditMetadata redacts sensitive keys...");
  const redacted = safeAuditMetadata({
    apiKey: "secret-key",
    SENDGRID_API_KEY: "sg-key",
    CLERK_SECRET_KEY: "clerk",
    DATABASE_URL: "postgres://x",
    token: "abc",
    note: "ok",
  });
  assert(redacted.apiKey === "[redacted]", "apiKey redacted");
  assert(redacted.SENDGRID_API_KEY === "[redacted]", "sendgrid redacted");
  assert(redacted.note === "ok", "safe fields kept");

  console.log("E. body/html-like content redacted...");
  const bodyRedacted = safeAuditMetadata({
    body: "x".repeat(1000),
    template_html: "<p>hello</p>",
    customers: [{ id: "1" }, { id: "2" }],
  });
  assert(
    String(bodyRedacted.body).includes("redacted"),
    "body field redacted",
  );
  assert(
    String(bodyRedacted.customers).includes("redacted"),
    "customers array redacted",
  );

  console.log("F. metadata size cap (~4 KB)...");
  const manyFields: Record<string, unknown> = { action_summary: "export" };
  for (let i = 0; i < 200; i++) {
    manyFields[`field_${i}`] = "x".repeat(80);
  }
  const huge = safeAuditMetadata(manyFields);
  assert(
    Buffer.byteLength(JSON.stringify(huge), "utf8") <= AUDIT_METADATA_MAX_BYTES,
    "metadata under cap",
  );
  assert(huge._audit_truncated === true, "truncation flag");

  console.log("G. truncateAuditString...");
  assert(truncateAuditString("hello", 3) === "hel…", "truncates with ellipsis");

  console.log("H. hashAuditValue deterministic...");
  withEnv({ AUDIT_HASH_SALT: "test-salt" }, () => {
    const a = hashAuditValue("1.2.3.4");
    const b = hashAuditValue("1.2.3.4");
    assert(a === b, "hash stable");
    assert(a.length === 64, "sha256 hex length");
  });

  console.log("I. nested redactSensitiveKeys...");
  const nested = redactSensitiveKeys({
    outer: { api_key: "hidden", label: "visible" },
  });
  assert(
    (nested.outer as Record<string, unknown>).api_key === "[redacted]",
    "nested secret redacted",
  );

  console.log("J. J-6C API action allowlist...");
  const j6cActions = [
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
  for (const action of j6cActions) {
    assert(isAllowedAuditAction(action), `allowed ${action}`);
    assert(AUDIT_ACTIONS.includes(action), `listed ${action}`);
  }
  assert(!isAllowedAuditAction("queue.approve"), "ui action not in J-6B list");

  console.log("K. writeAuditLog no-op guard (isAuditEnabled gate)...");
  withEnv({ AUDIT_ENABLED: "false", DATABASE_URL: "postgres://x" }, () => {
    assert(!shouldPersistAudit(), "writeAuditLog would no-op when disabled");
  });

  console.log("OK: verify-audit-helpers passed");
}

main();
