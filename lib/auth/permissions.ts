/**
 * RBAC permission model — server-side enforcement via lib/auth/api-auth.ts (J-5B).
 */

export type OperatorRole = "Admin" | "Operator" | "Viewer" | "Developer";

export type Permission =
  | "view_dashboard"
  | "upload_customer_data"
  | "edit_triggers"
  | "create_triggers"
  | "edit_templates"
  | "manage_sequences"
  | "approve_queue_actions"
  | "send_internal_alert"
  | "send_test_email"
  | "export_reports"
  | "manage_settings"
  | "view_audit_logs"
  | "manage_users";

export const ALL_PERMISSIONS: readonly Permission[] = [
  "view_dashboard",
  "upload_customer_data",
  "edit_triggers",
  "create_triggers",
  "edit_templates",
  "manage_sequences",
  "approve_queue_actions",
  "send_internal_alert",
  "send_test_email",
  "export_reports",
  "manage_settings",
  "view_audit_logs",
  "manage_users",
] as const;

const VALID_OPERATOR_ROLES: readonly OperatorRole[] = [
  "Admin",
  "Operator",
  "Viewer",
  "Developer",
];

/** Default Operator role permissions from Phase J architecture. */
export const DEFAULT_OPERATOR_PERMISSIONS: readonly Permission[] = [
  "view_dashboard",
  "upload_customer_data",
  "edit_triggers",
  "create_triggers",
  "edit_templates",
  "manage_sequences",
  "approve_queue_actions",
  "send_internal_alert",
  "export_reports",
] as const;

/** Demo/local mode permissions when AUTH_ENABLED=false — full operator-equivalent access. */
export const DEFAULT_DEMO_PERMISSIONS: readonly Permission[] =
  DEFAULT_OPERATOR_PERMISSIONS;

const ROLE_PERMISSIONS: Record<OperatorRole, readonly Permission[]> = {
  Admin: ALL_PERMISSIONS,
  Operator: DEFAULT_OPERATOR_PERMISSIONS,
  Viewer: ["view_dashboard", "export_reports"],
  Developer: ALL_PERMISSIONS,
};

/** Missing or invalid Clerk publicMetadata.role values fall back to Viewer. */
export function normalizeOperatorRole(value: unknown): OperatorRole {
  if (typeof value !== "string") return "Viewer";
  const trimmed = value.trim();
  if (VALID_OPERATOR_ROLES.includes(trimmed as OperatorRole)) {
    return trimmed as OperatorRole;
  }
  return "Viewer";
}

export function getPermissionsForRole(role: OperatorRole): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export function roleHasPermission(
  role: OperatorRole,
  permission: Permission,
): boolean {
  return getPermissionsForRole(role).includes(permission);
}

/** Permissions for demo mode when API auth is disabled. */
export function getDemoPermissions(): Permission[] {
  return [...DEFAULT_DEMO_PERMISSIONS];
}
