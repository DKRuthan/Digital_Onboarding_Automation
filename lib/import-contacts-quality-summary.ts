import type { ImportedContactRow } from "./import-multisheet-parser";
import type { ImportIssue } from "./upload-validation";

export type ContactsImportQualitySummary = {
  totalContacts: number;
  adminContacts: number;
  userContacts: number;
  csmContacts: number;
  doNotContactContacts: number;
  accountsMissingAdmin: number;
  accountsWithNoContacts: number;
  duplicateContactEmails: number;
  duplicateContactRows: number;
  orphanContacts: number;
  orphanSignals: number;
  emailsAcrossAccounts: number;
  extraAdminNotPersisted: number;
  extraUserNotPersisted: number;
  extraCsmNotPersisted: number;
};

function countIssues(importIssues: ImportIssue[], code: string): number {
  return importIssues.filter((issue) => issue.code === code).length;
}

function countExtrasByRole(
  contacts: ImportedContactRow[],
  role: "Admin" | "User" | "CSM",
): number {
  const perAccount = new Map<string, number>();

  for (const row of contacts) {
    if (row.contact_role?.trim() !== role) continue;
    const customerId = row.customer_id?.trim();
    if (!customerId) continue;
    perAccount.set(customerId, (perAccount.get(customerId) ?? 0) + 1);
  }

  let extras = 0;
  for (const count of perAccount.values()) {
    if (count > 1) extras += count - 1;
  }
  return extras;
}

/**
 * Derive contact-level quality counts from parsed Contacts rows and cross-sheet issues.
 * Preview-only metadata — does not change validation pass/fail.
 */
export function buildContactsImportQualitySummary(
  contacts: ImportedContactRow[],
  importIssues: ImportIssue[],
): ContactsImportQualitySummary {
  let adminContacts = 0;
  let userContacts = 0;
  let csmContacts = 0;
  let doNotContactContacts = 0;

  for (const row of contacts) {
    const role = row.contact_role?.trim();
    if (role === "Admin") adminContacts += 1;
    else if (role === "User") userContacts += 1;
    else if (role === "CSM") csmContacts += 1;

    if (row.do_not_contact?.trim() === "Yes") {
      doNotContactContacts += 1;
    }
  }

  return {
    totalContacts: contacts.length,
    adminContacts,
    userContacts,
    csmContacts,
    doNotContactContacts,
    accountsMissingAdmin: countIssues(importIssues, "CONTACT_MISSING_ADMIN"),
    accountsWithNoContacts: countIssues(importIssues, "CONTACT_ACCOUNT_NO_CONTACTS"),
    duplicateContactEmails: countIssues(importIssues, "CONTACT_DUPLICATE_EMAIL"),
    duplicateContactRows: countIssues(importIssues, "CONTACT_DUPLICATE_EMAIL"),
    orphanContacts: countIssues(importIssues, "CONTACT_ORPHAN_CUSTOMER_ID"),
    orphanSignals:
      countIssues(importIssues, "SIGNAL_UNKNOWN_CONTACT_EMAIL") +
      countIssues(importIssues, "SIGNAL_UNKNOWN_CUSTOMER_ID") +
      countIssues(importIssues, "SIGNAL_CONTACT_CUSTOMER_MISMATCH"),
    emailsAcrossAccounts: countIssues(importIssues, "CONTACT_EMAIL_MULTI_ACCOUNT"),
    extraAdminNotPersisted: countExtrasByRole(contacts, "Admin"),
    extraUserNotPersisted: countExtrasByRole(contacts, "User"),
    extraCsmNotPersisted: countExtrasByRole(contacts, "CSM"),
  };
}
