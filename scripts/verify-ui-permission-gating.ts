import {
  ALL_PERMISSIONS,
  DEFAULT_DEMO_PERMISSIONS,
  getDemoPermissions,
  type Permission,
} from "../lib/auth/permissions";
import {
  canRolePerform,
  getEffectivePermissionsForAuthState,
  permissionDeniedTitle,
  permissionsInclude,
} from "../lib/auth/permission-ui";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

function assertCanPerform(
  role: "Viewer" | "Operator" | "Admin" | "Developer",
  permission: Permission,
  expected: boolean,
): void {
  assert(
    canRolePerform(role, permission) === expected,
    `${role} ${expected ? "should have" : "should lack"} ${permission}`,
  );
}

function main(): void {
  console.log("A. permissionDeniedTitle format...");
  assert(
    permissionDeniedTitle("upload_customer_data") ===
      "Requires upload_customer_data permission",
    "permissionDeniedTitle",
  );

  console.log("B. Viewer is read-only except view/export...");
  assertCanPerform("Viewer", "view_dashboard", true);
  assertCanPerform("Viewer", "export_reports", true);
  assertCanPerform("Viewer", "upload_customer_data", false);
  assertCanPerform("Viewer", "edit_triggers", false);
  assertCanPerform("Viewer", "create_triggers", false);
  assertCanPerform("Viewer", "edit_templates", false);
  assertCanPerform("Viewer", "manage_sequences", false);
  assertCanPerform("Viewer", "approve_queue_actions", false);
  assertCanPerform("Viewer", "send_internal_alert", false);
  assertCanPerform("Viewer", "send_test_email", false);

  console.log("C. Operator can operate but not send test email...");
  assertCanPerform("Operator", "upload_customer_data", true);
  assertCanPerform("Operator", "edit_triggers", true);
  assertCanPerform("Operator", "create_triggers", true);
  assertCanPerform("Operator", "edit_templates", true);
  assertCanPerform("Operator", "manage_sequences", true);
  assertCanPerform("Operator", "approve_queue_actions", true);
  assertCanPerform("Operator", "send_internal_alert", true);
  assertCanPerform("Operator", "export_reports", true);
  assertCanPerform("Operator", "send_test_email", false);
  assertCanPerform("Operator", "manage_users", false);

  console.log("D. Admin and Developer have all permissions...");
  for (const permission of ALL_PERMISSIONS) {
    assertCanPerform("Admin", permission, true);
    assertCanPerform("Developer", permission, true);
  }

  console.log("E. Auth-off demo permissions keep operational actions enabled...");
  const demoPermissions = getDemoPermissions();
  assert(
    demoPermissions.length === DEFAULT_DEMO_PERMISSIONS.length,
    "demo permission count",
  );
  for (const permission of [
    "upload_customer_data",
    "edit_triggers",
    "create_triggers",
    "approve_queue_actions",
    "send_internal_alert",
    "export_reports",
  ] as Permission[]) {
    assert(
      permissionsInclude(demoPermissions, permission),
      `demo mode includes ${permission}`,
    );
  }
  assert(
    !permissionsInclude(demoPermissions, "send_test_email"),
    "demo mode lacks send_test_email (operator-equivalent)",
  );

  const authOffPermissions = getEffectivePermissionsForAuthState(false, null);
  assert(
    permissionsInclude(authOffPermissions, "upload_customer_data"),
    "auth-off effective permissions allow upload",
  );
  assert(
    permissionsInclude(authOffPermissions, "approve_queue_actions"),
    "auth-off effective permissions allow approve",
  );

  console.log("F. Auth-on Viewer effective permissions...");
  const viewerPermissions = getEffectivePermissionsForAuthState(true, "Viewer");
  assert(
    permissionsInclude(viewerPermissions, "export_reports"),
    "auth-on Viewer can export",
  );
  assert(
    !permissionsInclude(viewerPermissions, "upload_customer_data"),
    "auth-on Viewer cannot upload",
  );

  console.log("All UI permission gating checks passed.");
}

main();
