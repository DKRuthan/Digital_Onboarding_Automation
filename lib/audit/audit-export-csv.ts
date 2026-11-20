/** Safe audit row shape for export (no secrets). */
export type AuditLogRow = {
  id: string;
  created_at: string;
  action: string;
  result: string;
  source: string;
  severity: string;
  actor_role: string | null;
  target_type: string;
  target_id: string | null;
  permission: string | null;
  send_mode: string | null;
  request_id: string | null;
};

export const AUDIT_LOG_CSV_COLUMNS = [
  "created_at",
  "action",
  "result",
  "source",
  "severity",
  "actor_role",
  "target_type",
  "target_id",
  "permission",
  "send_mode",
  "request_id",
] as const;

function escapeCsvCell(value: string | null | undefined): string {
  const text = value ?? "";
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Builds a CSV string from safe audit columns only (no metadata, secrets, or emails). */
export function exportAuditLogsCsv(rows: AuditLogRow[]): string {
  const header = AUDIT_LOG_CSV_COLUMNS.join(",");
  const lines = rows.map((row) =>
    AUDIT_LOG_CSV_COLUMNS.map((column) => escapeCsvCell(row[column])).join(","),
  );
  return [header, ...lines].join("\n");
}
