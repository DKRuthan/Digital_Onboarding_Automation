import { normalizeContactEmail } from "./import-contact-email";
import type { ImportedContactRow, NormalizedImport } from "./import-multisheet-parser";
import type { ImportedContact, ImportedContactRole } from "./types";

function normalizeContactRole(role: string): ImportedContactRole {
  const trimmed = role.trim();
  const lower = trimmed.toLowerCase();
  if (lower === "admin") return "Admin";
  if (lower === "user") return "User";
  if (lower === "csm") return "CSM";
  return trimmed;
}

function parseDoNotContact(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "yes";
}

/**
 * Map parsed Contacts sheet rows into session ImportedContact records.
 * Preserves every row from the workbook (no rollup drop).
 */
export function buildImportedContactsFromNormalized(
  normalized: Pick<NormalizedImport, "accounts" | "contacts">,
): ImportedContact[] {
  const customerNames = new Map(
    normalized.accounts
      .map((account) => [
        account.customer_id?.trim() ?? "",
        account.customer_name?.trim() ?? "",
      ] as const)
      .filter(([customerId]) => customerId.length > 0),
  );

  return normalized.contacts.map((row) => {
    const customerId = row.customer_id?.trim() ?? "";
    return {
      contact_email: normalizeContactEmail(row.contact_email),
      contact_role: normalizeContactRole(row.contact_role ?? ""),
      contact_name: row.contact_name?.trim() || undefined,
      do_not_contact: parseDoNotContact(row.do_not_contact),
      customer_id: customerId,
      customer_name: customerNames.get(customerId) || undefined,
      source: "excel_import" as const,
    };
  });
}

/** Replace semantics helper — returns a new array, never mutates prior state. */
export function replaceImportedContacts(
  _previous: ImportedContact[],
  next: ImportedContact[],
): ImportedContact[] {
  return [...next];
}

export type { ImportedContactRow };
