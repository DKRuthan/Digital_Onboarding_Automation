import "server-only";

import {
  getImportPersistenceSql,
  requireImportPersistenceSql,
  type ImportPersistenceSql,
} from "@/lib/import-persistence/import-persistence-db";
import type {
  CreateImportBatchInput,
  PersistedImportBatch,
} from "@/lib/import-persistence/import-persistence-types";

function mapBatchRow(row: Record<string, unknown>): PersistedImportBatch {
  return row as unknown as PersistedImportBatch;
}

export async function createImportBatch(
  input: CreateImportBatchInput,
  tx?: ImportPersistenceSql,
): Promise<string> {
  const sql = tx ?? requireImportPersistenceSql();

  const rows = await sql`
    INSERT INTO import_batches (
      workspace_id,
      status,
      header_mode,
      source_filename,
      uploaded_by,
      validation_passed,
      account_count,
      contact_count,
      blocker_count,
      warning_count,
      info_count,
      is_active,
      validated_at,
      applied_at
    ) VALUES (
      ${input.workspaceId},
      ${input.status},
      ${input.headerMode},
      ${input.sourceFilename ?? null},
      ${input.uploadedBy ?? null},
      ${input.validationPassed},
      ${input.accountCount},
      ${input.contactCount},
      ${input.blockerCount},
      ${input.warningCount},
      ${input.infoCount},
      ${input.isActive ?? false},
      ${input.status === "validated" || input.status === "failed" ? new Date() : null},
      ${input.appliedAt || input.status === "applied" ? new Date() : null}
    )
    RETURNING id
  `;

  const batchId = rows[0]?.id;
  if (!batchId || typeof batchId !== "string") {
    throw new Error("Failed to create import batch — no id returned");
  }
  return batchId;
}

export async function markPreviousActiveBatchesSuperseded(
  workspaceId: string,
  tx?: ImportPersistenceSql,
): Promise<number> {
  const sql = tx ?? requireImportPersistenceSql();
  const rows = await sql`
    UPDATE import_batches
    SET
      is_active = false,
      status = 'superseded',
      superseded_at = now()
    WHERE workspace_id = ${workspaceId}
      AND is_active = true
    RETURNING id
  `;
  return rows.length;
}

export async function markBatchApplied(
  batchId: string,
  workspaceId: string,
  tx?: ImportPersistenceSql,
): Promise<void> {
  const sql = tx ?? requireImportPersistenceSql();
  await sql`
    UPDATE import_batches
    SET
      status = 'applied',
      is_active = true,
      validation_passed = true,
      applied_at = now()
    WHERE id = ${batchId}
      AND workspace_id = ${workspaceId}
  `;
}

export async function findActiveBatchForWorkspace(
  workspaceId: string,
): Promise<PersistedImportBatch | null> {
  const sql = getImportPersistenceSql();
  if (!sql) return null;

  const rows = await sql`
    SELECT *
    FROM import_batches
    WHERE workspace_id = ${workspaceId}
      AND is_active = true
    ORDER BY created_at DESC
    LIMIT 1
  `;

  const row = rows[0];
  return row ? mapBatchRow(row as Record<string, unknown>) : null;
}

export async function listImportBatchesForWorkspace(
  workspaceId: string,
  limit = 50,
): Promise<PersistedImportBatch[]> {
  const sql = getImportPersistenceSql();
  if (!sql) return [];

  const rows = await sql`
    SELECT *
    FROM import_batches
    WHERE workspace_id = ${workspaceId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;

  return rows.map((row) => mapBatchRow(row as Record<string, unknown>));
}
