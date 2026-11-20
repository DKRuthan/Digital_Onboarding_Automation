import "server-only";

import { findActiveBatchForWorkspace } from "@/lib/import-persistence/import-batch-repository";
import {
  loadActiveCustomerAccounts,
  mapAccountRowToCustomer,
} from "@/lib/import-persistence/customer-account-repository";
import {
  loadActiveCustomerContacts,
  mapContactRowToImportedContact,
} from "@/lib/import-persistence/customer-contact-repository";
import {
  getImportPersistenceSql,
  ImportPersistenceUnavailableError,
} from "@/lib/import-persistence/import-persistence-db";
import { shouldPersistImport } from "@/lib/import-persistence/import-persistence-env";
import {
  enrichCustomersWithContacts,
  mapPersistedBatchToSummary,
} from "@/lib/import-persistence/import-persistence-mappers";
import { runApplyImportInTransaction } from "@/lib/import-persistence/import-persistence-transaction";
import type {
  ActiveImportState,
  ApplyImportPersistenceInput,
  ApplyImportPersistenceResult,
} from "@/lib/import-persistence/import-persistence-types";
import { loadValidationResultForBatch } from "@/lib/import-persistence/import-validation-repository";

function logImportPersistenceError(message: string, error?: unknown): void {
  if (error instanceof Error) {
    console.error(`[import-persistence] ${message}:`, error.message);
    return;
  }
  console.error(`[import-persistence] ${message}`);
}

type ApplyImportFailureCode = Extract<
  ApplyImportPersistenceResult,
  { ok: false }
>["code"];

function disabledApplyResult(
  code: ApplyImportFailureCode,
  message: string,
): ApplyImportPersistenceResult {
  return { ok: false, code, message };
}

export async function ensureWorkspace(
  workspaceId: string,
  name?: string,
): Promise<void> {
  const sql = getImportPersistenceSql();
  if (!sql) {
    throw new ImportPersistenceUnavailableError();
  }

  const workspaceName = name?.trim() || workspaceId;
  await sql`
    INSERT INTO workspaces (id, name)
    VALUES (${workspaceId}, ${workspaceName})
    ON CONFLICT (id) DO NOTHING
  `;
}

/**
 * Load the active applied import for a workspace.
 * Returns null when persistence is disabled, unconfigured, or no active batch exists.
 */
export async function loadActiveImportForWorkspace(
  workspaceId: string,
): Promise<ActiveImportState | null> {
  if (!shouldPersistImport()) {
    return null;
  }

  const sql = getImportPersistenceSql();
  if (!sql) {
    return null;
  }

  try {
    await ensureWorkspace(workspaceId);

    const batch = await findActiveBatchForWorkspace(workspaceId);
    if (!batch) {
      return null;
    }

    const [accountRows, contactRows, validationSummary] = await Promise.all([
      loadActiveCustomerAccounts(workspaceId),
      loadActiveCustomerContacts(workspaceId),
      loadValidationResultForBatch(batch.id, workspaceId),
    ]);

    const accountNameById = new Map(
      accountRows.map((row) => [row.account_id, row.account_name]),
    );

    const importedContacts = contactRows.map((row) =>
      mapContactRowToImportedContact(
        row,
        accountNameById.get(row.account_id),
      ),
    );

    const customers = enrichCustomersWithContacts(
      accountRows.map((row) => mapAccountRowToCustomer(row)),
      importedContacts,
    );

    return {
      batch: mapPersistedBatchToSummary(batch),
      customers,
      importedContacts,
      validationSummary,
    };
  } catch (error) {
    logImportPersistenceError("loadActiveImportForWorkspace failed", error);
    return null;
  }
}

/**
 * Apply a validated import atomically via Neon `sql.transaction([...])`.
 * Not called by the UI — server-only until I-5 wiring.
 */
export async function applyImportForWorkspace(
  input: ApplyImportPersistenceInput,
): Promise<ApplyImportPersistenceResult> {
  if (!shouldPersistImport()) {
    return disabledApplyResult(
      "PERSISTENCE_DISABLED",
      "Import persistence is disabled. Set IMPORT_PERSISTENCE_ENABLED=true and DATABASE_URL.",
    );
  }

  const sql = getImportPersistenceSql();
  if (!sql) {
    return disabledApplyResult(
      "DATABASE_NOT_CONFIGURED",
      "DATABASE_URL is not configured for import persistence.",
    );
  }

  const { validationResult } = input;
  if (!validationResult.passed) {
    return disabledApplyResult(
      "VALIDATION_NOT_PASSED",
      "Cannot apply import — validation did not pass.",
    );
  }

  const customers = validationResult.customers ?? [];
  const importedContacts = validationResult.importedContacts ?? [];

  try {
    const importBatchId = await runApplyImportInTransaction(sql, input);

    return {
      ok: true,
      importBatchId,
      customers,
      importedContacts,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      /unique|constraint|duplicate/i.test(error.message)
    ) {
      return disabledApplyResult(
        "CONSTRAINT_VIOLATION",
        "Import apply failed due to a database constraint violation.",
      );
    }

    logImportPersistenceError("applyImportForWorkspace failed", error);
    return disabledApplyResult(
      "TRANSACTION_FAILED",
      "Import apply failed — transaction rolled back.",
    );
  }
}
