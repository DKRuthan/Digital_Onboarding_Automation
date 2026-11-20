import "server-only";

import { getAuditSql } from "@/lib/audit/audit-db";
import {
  getDefaultWorkspaceId,
  isAuditDatabaseConfigured,
  isAuditEnabled,
} from "@/lib/audit/audit-env";
import type { AuditLogRow } from "@/lib/audit/audit-export-csv";
import type { AuditEventRow } from "@/lib/audit/audit-types";
import { safeAuditMetadata } from "@/lib/audit/safe-audit-metadata";

export { exportAuditLogsCsv, type AuditLogRow } from "@/lib/audit/audit-export-csv";

export const DEFAULT_AUDIT_READ_LIMIT = 100;

export type ListAuditLogsParams = {
  limit?: number;
  action?: string;
  source?: string;
  severity?: string;
  result?: string;
  actorUserId?: string;
  from?: string;
  to?: string;
};

export type AuditLogsListResult = {
  configured: boolean;
  enabled: boolean;
  rows: AuditLogRow[];
  message?: string;
};

/** True when audit reads can reach Neon (enabled + DATABASE_URL). */
export function isAuditReadConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isAuditEnabled(env) && isAuditDatabaseConfigured(env);
}

function clampLimit(limit?: number): number {
  const value = limit ?? DEFAULT_AUDIT_READ_LIMIT;
  return Math.min(Math.max(1, value), DEFAULT_AUDIT_READ_LIMIT);
}

function parseDateBoundary(value?: string): Date | null {
  if (!value?.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function mapDbRow(row: AuditEventRow): AuditLogRow {
  return {
    id: row.id,
    created_at: row.created_at,
    action: row.action,
    result: row.result,
    source: row.source,
    severity: row.severity,
    actor_role: row.actor_role,
    target_type: row.target_type,
    target_id: row.target_id,
    permission: row.permission,
    send_mode: row.send_mode,
    request_id: row.request_id,
  };
}

function applyFilters(
  rows: AuditEventRow[],
  params: ListAuditLogsParams,
): AuditEventRow[] {
  const fromDate = parseDateBoundary(params.from);
  const toDate = parseDateBoundary(params.to);

  return rows.filter((row) => {
    if (params.action && row.action !== params.action) return false;
    if (params.source && row.source !== params.source) return false;
    if (params.severity && row.severity !== params.severity) return false;
    if (params.result && row.result !== params.result) return false;
    if (params.actorUserId && row.actor_user_id !== params.actorUserId) {
      return false;
    }
    if (fromDate) {
      const created = new Date(row.created_at);
      if (created < fromDate) return false;
    }
    if (toDate) {
      const created = new Date(row.created_at);
      if (created > toDate) return false;
    }
    return true;
  });
}

function notConfiguredMessage(enabled: boolean): AuditLogsListResult {
  if (!enabled) {
    return {
      configured: false,
      enabled: false,
      rows: [],
      message:
        "Audit logging is not enabled. Set AUDIT_ENABLED=true to enable audit persistence.",
    };
  }

  return {
    configured: false,
    enabled: true,
    rows: [],
    message:
      "Audit database is not configured. Set DATABASE_URL and apply db/migrations/001_create_audit_logs.sql manually.",
  };
}

/**
 * Read-only audit log listing. Returns empty rows with a message when not configured.
 * Never throws — DB errors are logged server-side only.
 */
export async function listAuditLogs(
  params: ListAuditLogsParams = {},
): Promise<AuditLogsListResult> {
  const enabled = isAuditEnabled();
  if (!enabled || !isAuditDatabaseConfigured()) {
    return notConfiguredMessage(enabled);
  }

  const sql = getAuditSql();
  if (!sql) {
    return {
      configured: false,
      enabled: true,
      rows: [],
      message: "Audit database connection is unavailable.",
    };
  }

  const workspaceId = getDefaultWorkspaceId();
  const fetchLimit = clampLimit(params.limit);

  try {
    const rawRows = (await sql`
      SELECT
        id,
        workspace_id,
        actor_user_id,
        actor_role,
        action,
        target_type,
        target_id,
        result,
        metadata_json,
        source,
        severity,
        auth_required,
        permission,
        send_mode,
        request_id,
        ip_hash,
        user_agent,
        created_at
      FROM audit_logs
      WHERE workspace_id = ${workspaceId}
      ORDER BY created_at DESC
      LIMIT ${fetchLimit}
    `) as AuditEventRow[];

    const filtered = applyFilters(rawRows, params);

    // metadata_json is read but not exposed — sanitizer run defensively on any future use
    for (const row of filtered) {
      if (row.metadata_json && typeof row.metadata_json === "object") {
        safeAuditMetadata(row.metadata_json as Record<string, unknown>);
      }
    }

    return {
      configured: true,
      enabled: true,
      rows: filtered.map(mapDbRow),
    };
  } catch (error) {
    console.error(
      "[audit] listAuditLogs failed:",
      error instanceof Error ? error.message : error,
    );
    return {
      configured: true,
      enabled: true,
      rows: [],
      message:
        "Unable to read audit logs. Confirm the audit_logs table exists (manual migration).",
    };
  }
}
