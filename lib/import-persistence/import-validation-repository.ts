import "server-only";

import {
  getImportPersistenceSql,
  requireImportPersistenceSql,
  type ImportPersistenceSql,
} from "@/lib/import-persistence/import-persistence-db";
import { truncateIssueMessage } from "@/lib/import-persistence/import-persistence-mappers";
import type {
  PersistedImportIssue,
  PersistedImportValidationResult,
  SaveImportRowIssuesInput,
  SaveImportValidationResultInput,
} from "@/lib/import-persistence/import-persistence-types";

function mapValidationRow(
  row: Record<string, unknown>,
): PersistedImportValidationResult {
  return row as unknown as PersistedImportValidationResult;
}

function mapIssueRow(row: Record<string, unknown>): PersistedImportIssue {
  return {
    severity: row.severity as PersistedImportIssue["severity"],
    code: String(row.code ?? ""),
    message: String(row.message ?? ""),
    sheet_name: row.sheet_name ? String(row.sheet_name) : null,
    row_number:
      typeof row.row_number === "number" ? row.row_number : null,
    account_id: row.account_id ? String(row.account_id) : null,
    contact_email: row.contact_email ? String(row.contact_email) : null,
  };
}

export async function saveImportValidationResult(
  input: SaveImportValidationResultInput,
  tx?: ImportPersistenceSql,
): Promise<string> {
  const sql = tx ?? requireImportPersistenceSql();
  const rows = await sql`
    INSERT INTO import_validation_results (
      workspace_id,
      import_batch_id,
      passed,
      header_mode,
      format_label,
      account_count,
      contact_count,
      signal_count,
      blocker_count,
      warning_count,
      info_count,
      duplicate_contact_email_count,
      orphan_contact_count,
      orphan_signal_count
    ) VALUES (
      ${input.workspaceId},
      ${input.importBatchId},
      ${input.passed},
      ${input.headerMode},
      ${input.formatLabel ?? null},
      ${input.accountCount},
      ${input.contactCount},
      ${input.signalCount},
      ${input.blockerCount},
      ${input.warningCount},
      ${input.infoCount},
      ${input.duplicateContactEmailCount},
      ${input.orphanContactCount},
      ${input.orphanSignalCount}
    )
    RETURNING id
  `;

  const id = rows[0]?.id;
  if (!id || typeof id !== "string") {
    throw new Error("Failed to save import validation result — no id returned");
  }
  return id;
}

export async function saveImportRowIssues(
  input: SaveImportRowIssuesInput,
  tx?: ImportPersistenceSql,
): Promise<void> {
  if (input.issues.length === 0) return;
  const sql = tx ?? requireImportPersistenceSql();

  for (const issue of input.issues) {
    await sql`
      INSERT INTO import_row_issues (
        workspace_id,
        import_batch_id,
        severity,
        code,
        message,
        sheet_name,
        row_number,
        account_id,
        contact_email
      ) VALUES (
        ${input.workspaceId},
        ${input.importBatchId},
        ${issue.severity},
        ${issue.code},
        ${truncateIssueMessage(issue.message)},
        ${issue.sheet_name},
        ${issue.row_number},
        ${issue.account_id},
        ${issue.contact_email}
      )
    `;
  }
}

export async function loadValidationResultForBatch(
  batchId: string,
  workspaceId: string,
): Promise<PersistedImportValidationResult | null> {
  const sql = getImportPersistenceSql();
  if (!sql) return null;

  const rows = await sql`
    SELECT *
    FROM import_validation_results
    WHERE import_batch_id = ${batchId}
      AND workspace_id = ${workspaceId}
    ORDER BY created_at DESC
    LIMIT 1
  `;

  const row = rows[0];
  return row ? mapValidationRow(row as Record<string, unknown>) : null;
}

export async function loadIssuesForBatch(
  batchId: string,
  workspaceId: string,
): Promise<PersistedImportIssue[]> {
  const sql = getImportPersistenceSql();
  if (!sql) return [];

  const rows = await sql`
    SELECT severity, code, message, sheet_name, row_number, account_id, contact_email
    FROM import_row_issues
    WHERE import_batch_id = ${batchId}
      AND workspace_id = ${workspaceId}
    ORDER BY created_at ASC
  `;

  return rows.map((row) => mapIssueRow(row as Record<string, unknown>));
}
