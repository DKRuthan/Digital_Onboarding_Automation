import "server-only";

import {
  getImportPersistenceSql,
  requireImportPersistenceSql,
  type ImportPersistenceSql,
} from "@/lib/import-persistence/import-persistence-db";
import { mapPersistedContactToImportedContact } from "@/lib/import-persistence/import-persistence-mappers";
import type {
  InsertCustomerContactInput,
  PersistedCustomerContact,
} from "@/lib/import-persistence/import-persistence-types";
import { normalizeContactEmail } from "@/lib/import-contact-email";
import type { ImportedContact } from "@/lib/types";

function mapContactRow(row: Record<string, unknown>): PersistedCustomerContact {
  return row as unknown as PersistedCustomerContact;
}

export async function deactivateActiveContactsForWorkspace(
  workspaceId: string,
  tx?: ImportPersistenceSql,
): Promise<number> {
  const sql = tx ?? requireImportPersistenceSql();
  const rows = await sql`
    UPDATE customer_contacts
    SET is_active = false, updated_at = now()
    WHERE workspace_id = ${workspaceId}
      AND is_active = true
    RETURNING id
  `;
  return rows.length;
}

export async function insertCustomerContacts(
  inputs: InsertCustomerContactInput[],
  tx?: ImportPersistenceSql,
): Promise<void> {
  if (inputs.length === 0) return;
  const sql = tx ?? requireImportPersistenceSql();

  for (const input of inputs) {
    const email = normalizeContactEmail(input.contact.contact_email);
    await sql`
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
        ${input.workspaceId},
        ${input.importBatchId},
        ${input.contact.account_id},
        ${email},
        ${input.contact.contact_name ?? null},
        ${input.contact.contact_role ?? null},
        ${input.contact.do_not_contact},
        ${input.contact.source ?? "excel_import"},
        true
      )
    `;
  }
}

export async function loadActiveCustomerContacts(
  workspaceId: string,
): Promise<PersistedCustomerContact[]> {
  const sql = getImportPersistenceSql();
  if (!sql) return [];

  const rows = await sql`
    SELECT *
    FROM customer_contacts
    WHERE workspace_id = ${workspaceId}
      AND is_active = true
    ORDER BY contact_email ASC
  `;

  return rows.map((row) => mapContactRow(row as Record<string, unknown>));
}

export function mapContactRowToImportedContact(
  contact: PersistedCustomerContact,
  accountName?: string,
): ImportedContact {
  return mapPersistedContactToImportedContact(contact, accountName);
}
