import "server-only";

import {
  getImportPersistenceSql,
  requireImportPersistenceSql,
  type ImportPersistenceSql,
} from "@/lib/import-persistence/import-persistence-db";
import { mapPersistedAccountToCustomer } from "@/lib/import-persistence/import-persistence-mappers";
import type {
  InsertCustomerAccountInput,
  PersistedCustomerAccount,
} from "@/lib/import-persistence/import-persistence-types";
import type { Customer } from "@/lib/types";

function mapAccountRow(row: Record<string, unknown>): PersistedCustomerAccount {
  return row as unknown as PersistedCustomerAccount;
}

export async function deactivateActiveAccountsForWorkspace(
  workspaceId: string,
  tx?: ImportPersistenceSql,
): Promise<number> {
  const sql = tx ?? requireImportPersistenceSql();
  const rows = await sql`
    UPDATE customer_accounts
    SET is_active = false, updated_at = now()
    WHERE workspace_id = ${workspaceId}
      AND is_active = true
    RETURNING id
  `;
  return rows.length;
}

export async function insertCustomerAccounts(
  inputs: InsertCustomerAccountInput[],
  tx?: ImportPersistenceSql,
): Promise<void> {
  if (inputs.length === 0) return;
  const sql = tx ?? requireImportPersistenceSql();

  for (const input of inputs) {
    const { account, workspaceId, importBatchId } = input;
    await sql`
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
        ${importBatchId},
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
    `;
  }
}

export async function loadActiveCustomerAccounts(
  workspaceId: string,
): Promise<PersistedCustomerAccount[]> {
  const sql = getImportPersistenceSql();
  if (!sql) return [];

  const rows = await sql`
    SELECT *
    FROM customer_accounts
    WHERE workspace_id = ${workspaceId}
      AND is_active = true
    ORDER BY account_name ASC
  `;

  return rows.map((row) => mapAccountRow(row as Record<string, unknown>));
}

export function mapAccountRowToCustomer(
  account: PersistedCustomerAccount,
): Customer {
  return mapPersistedAccountToCustomer(account);
}
