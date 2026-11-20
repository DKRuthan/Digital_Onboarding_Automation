import "server-only";

import { randomUUID } from "node:crypto";
import type { NeonQueryFunctionInTransaction } from "@neondatabase/serverless";
import type { ImportPersistenceSql } from "@/lib/import-persistence/import-persistence-db";
import {
  buildCreateBatchInputFromValidation,
  buildValidationResultInput,
  mapCustomerToAccountInsert,
  mapImportedContactToInsert,
  mapValidationIssuesToPersisted,
  truncateIssueMessage,
} from "@/lib/import-persistence/import-persistence-mappers";
import type { ApplyImportPersistenceInput } from "@/lib/import-persistence/import-persistence-types";

/** Transaction-scoped query function from Neon `sql.transaction(txn => [...])`. */
export type ImportPersistenceTxn = NeonQueryFunctionInTransaction<false, false>;

/**
 * Final apply order (atomic via Neon `sql.transaction` query array):
 * 1. ensure workspace
 * 2. supersede previous active batch
 * 3. deactivate previous active accounts
 * 4. deactivate previous active contacts
 * 5. insert new import batch (applied + active, pre-generated id)
 * 6. insert new accounts
 * 7. insert new contacts
 * 8. insert validation summary
 * 9. insert row issues
 *
 * Neon HTTP transactions are non-interactive: all queries are submitted as one
 * array. Batch id is pre-generated so child rows can reference it in the same tx.
 */
export function buildApplyImportTransactionQueries(
  txn: ImportPersistenceTxn,
  input: ApplyImportPersistenceInput,
  batchId: string,
) {
  const { validationResult, workspaceId } = input;
  const workspaceName = input.workspaceName?.trim() || workspaceId;
  const customers = validationResult.customers ?? [];
  const importedContacts = validationResult.importedContacts ?? [];

  const batchInput = buildCreateBatchInputFromValidation({
    workspaceId,
    validationResult,
    sourceFilename: input.sourceFilename,
    uploadedBy: input.uploadedBy,
    status: "applied",
    isActive: true,
  });

  const validationInput = buildValidationResultInput(
    workspaceId,
    batchId,
    validationResult,
  );
  const issues = mapValidationIssuesToPersisted(validationResult);

  const queries = [
    txn`
      INSERT INTO workspaces (id, name)
      VALUES (${workspaceId}, ${workspaceName})
      ON CONFLICT (id) DO NOTHING
    `,
    txn`
      UPDATE import_batches
      SET
        is_active = false,
        status = 'superseded',
        superseded_at = now()
      WHERE workspace_id = ${workspaceId}
        AND is_active = true
    `,
    txn`
      UPDATE customer_accounts
      SET is_active = false, updated_at = now()
      WHERE workspace_id = ${workspaceId}
        AND is_active = true
    `,
    txn`
      UPDATE customer_contacts
      SET is_active = false, updated_at = now()
      WHERE workspace_id = ${workspaceId}
        AND is_active = true
    `,
    txn`
      INSERT INTO import_batches (
        id,
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
        applied_at
      ) VALUES (
        ${batchId},
        ${batchInput.workspaceId},
        ${batchInput.status},
        ${batchInput.headerMode},
        ${batchInput.sourceFilename ?? null},
        ${batchInput.uploadedBy ?? null},
        ${batchInput.validationPassed},
        ${batchInput.accountCount},
        ${batchInput.contactCount},
        ${batchInput.blockerCount},
        ${batchInput.warningCount},
        ${batchInput.infoCount},
        true,
        now()
      )
    `,
  ];

  for (const customer of customers) {
    const account = mapCustomerToAccountInsert(customer);
    queries.push(
      txn`
        INSERT INTO customer_accounts (
          workspace_id,
          import_batch_id,
          account_id,
          account_name,
          plan,
          journey_stage,
          use_case,
          primary_icp,
          term_start_date,
          activation_start_date,
          activation_window_end_date,
          renewal_date,
          seats_purchased,
          search_seats_assigned,
          graph_browser_seats_assigned,
          graph_desktop_seats_assigned,
          search_active_users,
          graph_browser_active_users,
          graph_desktop_active_users,
          total_active_seats,
          total_sessions,
          onboarding_completed,
          onboarding_date,
          onboarding_age_days,
          near_threshold,
          active_users_7d,
          total_sessions_7d,
          active_users_15d,
          total_sessions_15d,
          active_users_30d,
          total_sessions_30d,
          active_users_100d,
          total_sessions_100d,
          invite_status,
          invite_sent_date,
          invite_accepted_date,
          notes,
          is_active
        ) VALUES (
          ${workspaceId},
          ${batchId},
          ${account.account_id},
          ${account.account_name},
          ${account.plan},
          ${account.journey_stage},
          ${account.use_case},
          ${account.primary_icp},
          ${account.term_start_date},
          ${account.activation_start_date},
          ${account.activation_window_end_date},
          ${account.renewal_date},
          ${account.seats_purchased},
          ${account.search_seats_assigned},
          ${account.graph_browser_seats_assigned},
          ${account.graph_desktop_seats_assigned},
          ${account.search_active_users},
          ${account.graph_browser_active_users},
          ${account.graph_desktop_active_users},
          ${account.total_active_seats},
          ${account.total_sessions},
          ${account.onboarding_completed},
          ${account.onboarding_date},
          ${account.onboarding_age_days},
          ${account.near_threshold},
          ${account.active_users_7d},
          ${account.total_sessions_7d},
          ${account.active_users_15d},
          ${account.total_sessions_15d},
          ${account.active_users_30d},
          ${account.total_sessions_30d},
          ${account.active_users_100d},
          ${account.total_sessions_100d},
          ${account.invite_status},
          ${account.invite_sent_date},
          ${account.invite_accepted_date},
          ${account.notes},
          true
        )
      `,
    );
  }

  for (const contact of importedContacts) {
    const row = mapImportedContactToInsert(contact);
    queries.push(
      txn`
        INSERT INTO customer_contacts (
          workspace_id,
          import_batch_id,
          account_id,
          contact_email,
          contact_name,
          contact_role,
          do_not_contact,
          source,
          is_active
        ) VALUES (
          ${workspaceId},
          ${batchId},
          ${row.account_id},
          ${row.contact_email},
          ${row.contact_name ?? null},
          ${row.contact_role ?? null},
          ${row.do_not_contact},
          ${row.source ?? "excel_import"},
          true
        )
      `,
    );
  }

  queries.push(
    txn`
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
        ${validationInput.workspaceId},
        ${validationInput.importBatchId},
        ${validationInput.passed},
        ${validationInput.headerMode},
        ${validationInput.formatLabel ?? null},
        ${validationInput.accountCount},
        ${validationInput.contactCount},
        ${validationInput.signalCount},
        ${validationInput.blockerCount},
        ${validationInput.warningCount},
        ${validationInput.infoCount},
        ${validationInput.duplicateContactEmailCount},
        ${validationInput.orphanContactCount},
        ${validationInput.orphanSignalCount}
      )
    `,
  );

  for (const issue of issues) {
    queries.push(
      txn`
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
          ${workspaceId},
          ${batchId},
          ${issue.severity},
          ${issue.code},
          ${truncateIssueMessage(issue.message)},
          ${issue.sheet_name},
          ${issue.row_number},
          ${issue.account_id},
          ${issue.contact_email}
        )
      `,
    );
  }

  return queries;
}

/**
 * Run apply import inside a single Neon HTTP transaction (non-interactive).
 * Uses pre-generated batch id — see buildApplyImportTransactionQueries.
 */
export async function runApplyImportInTransaction(
  sql: ImportPersistenceSql,
  input: ApplyImportPersistenceInput,
): Promise<string> {
  const batchId = randomUUID();

  await sql.transaction((txn) =>
    buildApplyImportTransactionQueries(txn, input, batchId),
  );

  return batchId;
}
