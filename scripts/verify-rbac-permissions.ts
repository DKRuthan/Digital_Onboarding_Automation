import {
  forbiddenResponse,
  requireApiPermission,
} from "../lib/auth/api-auth";
import {
  ALL_PERMISSIONS,
  DEFAULT_DEMO_PERMISSIONS,
  DEFAULT_OPERATOR_PERMISSIONS,
  getDemoPermissions,
  getPermissionsForRole,
  normalizeOperatorRole,
  roleHasPermission,
} from "../lib/auth/permissions";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

const savedEnv = { ...process.env };

async function withEnvAsync(
  overrides: Record<string, string | undefined>,
  fn: () => void | Promise<void>,
): Promise<void> {
  process.env = { ...savedEnv, ...overrides };
  try {
    await fn();
  } finally {
    process.env = { ...savedEnv };
  }
}

function assertSamePermissions(
  actual: readonly string[],
  expected: readonly string[],
  label: string,
): void {
  assert(
    actual.length === expected.length &&
      expected.every((permission) => actual.includes(permission)),
    label,
  );
}

async function main(): Promise<void> {
  console.log("A. Admin has all 13 permissions...");
  assert(
    getPermissionsForRole("Admin").length === ALL_PERMISSIONS.length,
    "Admin permission count",
  );
  for (const permission of ALL_PERMISSIONS) {
    assert(roleHasPermission("Admin", permission), `Admin has ${permission}`);
  }

  console.log("B. Developer has all 13 permissions...");
  for (const permission of ALL_PERMISSIONS) {
    assert(
      roleHasPermission("Developer", permission),
      `Developer has ${permission}`,
    );
  }

  console.log("C. Operator has expected operational permissions...");
  assertSamePermissions(
    getPermissionsForRole("Operator"),
    DEFAULT_OPERATOR_PERMISSIONS,
    "Operator permissions match DEFAULT_OPERATOR_PERMISSIONS",
  );
  assert(
    !roleHasPermission("Operator", "send_test_email"),
    "Operator lacks send_test_email",
  );
  assert(
    roleHasPermission("Operator", "send_internal_alert"),
    "Operator has send_internal_alert",
  );

  console.log("D. Viewer only has view_dashboard and export_reports...");
  const viewerPermissions = getPermissionsForRole("Viewer");
  assert(viewerPermissions.length === 2, "Viewer has two permissions");
  assert(
    roleHasPermission("Viewer", "view_dashboard"),
    "Viewer has view_dashboard",
  );
  assert(
    roleHasPermission("Viewer", "export_reports"),
    "Viewer has export_reports",
  );
  assert(
    !roleHasPermission("Viewer", "send_internal_alert"),
    "Viewer lacks send_internal_alert",
  );
  assert(
    !roleHasPermission("Viewer", "send_test_email"),
    "Viewer lacks send_test_email",
  );

  console.log("E. invalid role normalizes to Viewer...");
  assert(normalizeOperatorRole("invalid") === "Viewer", "invalid string");
  assert(normalizeOperatorRole("") === "Viewer", "empty string");
  assert(normalizeOperatorRole(null) === "Viewer", "null");
  assert(normalizeOperatorRole(undefined) === "Viewer", "undefined");
  assert(normalizeOperatorRole(42) === "Viewer", "number");

  console.log("F. valid roles normalize correctly...");
  assert(normalizeOperatorRole("Admin") === "Admin", "Admin");
  assert(normalizeOperatorRole(" Operator ") === "Operator", "Operator trimmed");
  assert(normalizeOperatorRole("Viewer") === "Viewer", "Viewer");
  assert(normalizeOperatorRole("Developer") === "Developer", "Developer");

  console.log("G. demo mode permissions...");
  assertSamePermissions(
    getDemoPermissions(),
    DEFAULT_DEMO_PERMISSIONS,
    "demo permissions match operator-equivalent set",
  );

  console.log("H. forbiddenResponse shape...");
  {
    const response = forbiddenResponse();
    assert(response.status === 403, "forbidden status is 403");
    const body = (await response.json()) as { success: boolean; error: string };
    assert(body.success === false, "forbidden success false");
    assert(body.error === "Forbidden", "forbidden error message");
  }

  console.log("I. requireApiPermission auth-off returns ok...");
  await withEnvAsync({ AUTH_ENABLED: "false" }, async () => {
    const result = await requireApiPermission("send_internal_alert");
    assert(result.ok === true, "requireApiPermission ok when auth disabled");
    if (result.ok) {
      assert(result.authRequired === false, "authRequired false");
      assert(result.userId === null, "userId null");
      assert(result.role === null, "role null");
      assertSamePermissions(
        result.permissions,
        DEFAULT_DEMO_PERMISSIONS,
        "auth-off permissions are demo permissions",
      );
    }
  });

  console.log(
    "J. requireApiPermission auth-on without session returns 401...",
  );
  await withEnvAsync(
    {
      AUTH_ENABLED: "true",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_x",
      CLERK_SECRET_KEY: "sk_test_x",
    },
    async () => {
      const result = await requireApiPermission("view_dashboard");
      assert(result.ok === false, "no session fails");
      if (!result.ok) {
        assert(result.response.status === 401, "401 without session");
      }
    },
  );

  console.log("OK: verify-rbac-permissions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
