import { isValidCustomerEmail } from "./customer-data-quality";
import type { Customer, ImportedContact } from "./types";

export type DerivedContactRole = "Admin" | "User" | "CSM" | string;

export type DerivedContactSource =
  | "admin_email"
  | "user_email"
  | "owner"
  | "excel_import";

export type ContactDisplaySource = "derived" | "excel_import";

export type DerivedContact = {
  contact_email: string;
  contact_name?: string;
  contact_role: DerivedContactRole;
  contact_source: DerivedContactSource;

  customer_id: string;
  customer_name: string;
  account_owner?: string;
  owner?: string;
  plan?: string;
  stage?: string;

  is_internal: boolean;
  is_valid_email: boolean;
  do_not_contact?: boolean;
  display_source?: ContactDisplaySource;

  tags?: string[];
  quality_issue_keys?: string[];
};

export type ContactDataSource = "imported" | "derived";

export type BuildContactsForDisplayInput = {
  customers: Customer[];
  importedContacts?: ImportedContact[];
  dataSource?: "demo" | "upload";
};

export type ContactsForDisplayResult = {
  contacts: DerivedContact[];
  source: ContactDataSource;
};

const SAME_ADMIN_USER_EMAIL_TAG = "Same email for Admin and User";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hasEmailValue(value: string | undefined | null): value is string {
  return Boolean(value?.trim());
}

function accountContext(customer: Customer) {
  return {
    customer_id: customer.customer_id,
    customer_name: customer.customer_name,
    account_owner: customer.account_owner,
    owner: customer.owner,
    plan: customer.plan,
    stage: customer.stage,
  };
}

function buildDerivedContact(
  customer: Customer,
  rawEmail: string,
  role: DerivedContactRole,
  source: DerivedContactSource,
  options?: {
    contact_name?: string;
    is_internal?: boolean;
    tags?: string[];
  },
): DerivedContact {
  return {
    contact_email: normalizeEmail(rawEmail),
    contact_name: options?.contact_name,
    contact_role: role,
    contact_source: source,
    ...accountContext(customer),
    is_internal: options?.is_internal ?? false,
    is_valid_email: isValidCustomerEmail(rawEmail),
    tags: options?.tags,
  };
}

/**
 * Derive contact/email records from a flat Customer row.
 * Does not mutate the customer. Primary operational identity is contact_email.
 */
export function deriveContactsFromCustomer(customer: Customer): DerivedContact[] {
  const contacts: DerivedContact[] = [];

  const adminRaw = customer.admin_email?.trim() ?? "";
  const userRaw = customer.user_email?.trim() ?? "";
  const adminNorm = adminRaw ? normalizeEmail(adminRaw) : "";
  const userNorm = userRaw ? normalizeEmail(userRaw) : "";
  const sameAdminAndUser =
    adminNorm.length > 0 && userNorm.length > 0 && adminNorm === userNorm;

  if (hasEmailValue(customer.admin_email)) {
    contacts.push(
      buildDerivedContact(customer, adminRaw, "Admin", "admin_email", {
        contact_name: customer.account_owner || customer.customer_name,
        tags: sameAdminAndUser ? [SAME_ADMIN_USER_EMAIL_TAG] : undefined,
      }),
    );
  }

  if (
    hasEmailValue(customer.user_email) &&
    (!adminNorm || userNorm !== adminNorm)
  ) {
    contacts.push(
      buildDerivedContact(customer, userRaw, "User", "user_email", {
        contact_name: userRaw.split("@")[0] || "Primary user",
      }),
    );
  }

  const ownerRaw = customer.owner?.trim() ?? "";
  if (ownerRaw && isValidCustomerEmail(ownerRaw)) {
    contacts.push(
      buildDerivedContact(customer, ownerRaw, "CSM", "owner", {
        contact_name: ownerRaw.split("@")[0] || ownerRaw,
        is_internal: true,
      }),
    );
  }

  return contacts;
}

/** Flatten derived contacts across all customers with account context on each row. */
export function deriveAllContacts(customers: Customer[]): DerivedContact[] {
  return customers.flatMap((customer) => deriveContactsFromCustomer(customer));
}

/** True when uploaded Excel session has imported contacts to display. */
export function usesImportedContactsSource(
  input: Pick<BuildContactsForDisplayInput, "importedContacts" | "dataSource">,
): boolean {
  return (
    input.dataSource === "upload" && (input.importedContacts?.length ?? 0) > 0
  );
}

function normalizeImportedRole(role: string): DerivedContactRole {
  const trimmed = role.trim();
  const lower = trimmed.toLowerCase();
  if (lower === "admin") return "Admin";
  if (lower === "user") return "User";
  if (lower === "csm") return "CSM";
  return trimmed;
}

function mapImportedContactToDisplay(
  imported: ImportedContact,
  customerMap: Map<string, Customer>,
): DerivedContact {
  const customer = customerMap.get(imported.customer_id);
  const role = normalizeImportedRole(String(imported.contact_role ?? ""));

  return {
    contact_email: imported.contact_email.trim().toLowerCase(),
    contact_name: imported.contact_name,
    contact_role: role,
    contact_source: "excel_import",
    customer_id: imported.customer_id,
    customer_name:
      imported.customer_name?.trim() ||
      customer?.customer_name ||
      imported.customer_id,
    account_owner: customer?.account_owner,
    owner: customer?.owner,
    plan: customer?.plan,
    stage: customer?.stage,
    is_internal: role.toLowerCase() === "csm",
    is_valid_email: isValidCustomerEmail(imported.contact_email),
    do_not_contact: imported.do_not_contact,
    display_source: "excel_import",
  };
}

function dedupeContactsByEmail(contacts: DerivedContact[]): DerivedContact[] {
  const seen = new Set<string>();
  const result: DerivedContact[] = [];

  for (const contact of contacts) {
    if (seen.has(contact.contact_email)) continue;
    seen.add(contact.contact_email);
    result.push(contact);
  }

  return result;
}

/**
 * Contacts / Emails tab source selector.
 * Uploaded Excel mode uses importedContacts; demo mode uses derived rollup contacts.
 */
export function buildContactsForDisplay(
  input: BuildContactsForDisplayInput,
): ContactsForDisplayResult {
  if (usesImportedContactsSource(input)) {
    const customerMap = new Map(
      input.customers.map((customer) => [customer.customer_id, customer]),
    );
    const contacts = dedupeContactsByEmail(
      input.importedContacts!.map((imported) =>
        mapImportedContactToDisplay(imported, customerMap),
      ),
    );
    return { contacts, source: "imported" };
  }

  return {
    contacts: deriveAllContacts(input.customers),
    source: "derived",
  };
}

export function displayContactToImportedExport(
  contact: DerivedContact,
): ImportedContact {
  return {
    contact_email: contact.contact_email,
    contact_role: contact.contact_role,
    contact_name: contact.contact_name,
    do_not_contact: contact.do_not_contact ?? false,
    customer_id: contact.customer_id,
    customer_name: contact.customer_name,
    source: "excel_import",
  };
}

/** Primary contact for an account: Admin, then User, then CSM. */
export function getPrimaryContactForCustomer(
  customer: Customer,
): DerivedContact | null {
  const contacts = deriveContactsFromCustomer(customer);
  const priority: DerivedContactRole[] = ["Admin", "User", "CSM"];

  for (const role of priority) {
    const match = contacts.find((contact) => contact.contact_role === role);
    if (match) return match;
  }

  return null;
}

/** Find all derived contacts matching an email across customers (case-insensitive). */
export function findContactByEmail(
  customers: Customer[],
  email: string,
): DerivedContact[] {
  const target = normalizeEmail(email);
  if (!target) return [];

  return deriveAllContacts(customers).filter(
    (contact) => contact.contact_email === target,
  );
}

/** Derived contacts for one customer filtered by role. */
export function getContactsForCustomerRole(
  customer: Customer,
  role: DerivedContactRole,
): DerivedContact[] {
  return deriveContactsFromCustomer(customer).filter(
    (contact) => contact.contact_role === role,
  );
}

/** Stable key: contact_email + account + role. */
export function computeDerivedContactKey(contact: DerivedContact): string {
  return `${contact.contact_email}::${contact.customer_id}::${contact.contact_role}`;
}

/**
 * Contact emails that appear on more than one customer account.
 * Same email used for Admin and User on one account is not a cross-account duplicate.
 */
export function getDuplicateContactEmails(
  customers: Customer[],
): Map<string, DerivedContact[]> {
  const byEmail = new Map<string, DerivedContact[]>();

  for (const contact of deriveAllContacts(customers)) {
    const existing = byEmail.get(contact.contact_email) ?? [];
    existing.push(contact);
    byEmail.set(contact.contact_email, existing);
  }

  const duplicates = new Map<string, DerivedContact[]>();

  for (const [email, contacts] of byEmail) {
    const customerIds = new Set(contacts.map((entry) => entry.customer_id));
    if (customerIds.size > 1) {
      duplicates.set(email, contacts);
    }
  }

  return duplicates;
}
