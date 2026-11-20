import type {
  ImportedAccountRow,
  ImportedContactRow,
  NormalizedImport,
} from "./import-multisheet-parser";
import {
  isValidContactEmail,
  normalizeContactEmail,
} from "./import-contact-email";
import type {
  AutomationStatus,
  Customer,
  InviteStatus,
  YesNo,
} from "./types";

export type ImportRollupWarning = {
  code: string;
  message: string;
  customer_id?: string;
  contact_email?: string;
};

export type ImportRollupResult = {
  customers: Customer[];
  warnings: ImportRollupWarning[];
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const INVITE_STATUSES: InviteStatus[] = ["Pending", "Accepted", "Expired"];
const YES_NO: YesNo[] = ["Yes", "No"];

function isValidEmail(value: string): boolean {
  return isValidContactEmail(value);
}

function normalizeRole(role: string): string {
  return role.trim().toLowerCase();
}

function parseDateOnly(value: string | undefined): Date | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

function parseNumberField(
  value: string | undefined,
  field: string,
  customerId: string,
  warnings: ImportRollupWarning[],
): number {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return 0;
  const num = Number(trimmed);
  if (!Number.isFinite(num)) {
    warnings.push({
      code: "invalid_number",
      message: `Invalid number for ${field}; using 0.`,
      customer_id: customerId,
    });
    return 0;
  }
  return num;
}

function daysBetween(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY);
}

function computeDaysSinceStart(
  account: ImportedAccountRow,
  now: Date,
  customerId: string,
  warnings: ImportRollupWarning[],
): number {
  const anchor =
    parseDateOnly(account.term_start_date) ??
    parseDateOnly(account.onboarding_start_date);

  if (!anchor) {
    warnings.push({
      code: "missing_start_date",
      message:
        "Missing term_start_date and onboarding_start_date; days_since_start set to 0.",
      customer_id: customerId,
    });
    return 0;
  }

  return Math.max(0, daysBetween(anchor, now));
}

function computeDaysToRenewal(
  account: ImportedAccountRow,
  now: Date,
  customerId: string,
  warnings: ImportRollupWarning[],
): number {
  const renewal = parseDateOnly(account.renewal_date);
  if (!renewal) {
    warnings.push({
      code: "missing_renewal_date",
      message: "Missing renewal_date; days_to_renewal set to 0.",
      customer_id: customerId,
    });
    return 0;
  }

  return daysBetween(now, renewal);
}

function parseInviteStatus(value: string | undefined): InviteStatus {
  const trimmed = value?.trim() ?? "";
  if (INVITE_STATUSES.includes(trimmed as InviteStatus)) {
    return trimmed as InviteStatus;
  }
  return "Pending";
}

function parseYesNo(value: string | undefined, fallback: YesNo): YesNo {
  const trimmed = value?.trim() ?? "";
  if (YES_NO.includes(trimmed as YesNo)) {
    return trimmed as YesNo;
  }
  return fallback;
}

function resolveOwnerFromAccount(account: ImportedAccountRow): string {
  const damEmail = account.owner_dam_email?.trim() ?? "";
  if (damEmail && isValidEmail(damEmail)) {
    return damEmail;
  }
  return account.owner_dam_name?.trim() ?? "";
}

function addWarning(
  warnings: ImportRollupWarning[],
  warning: ImportRollupWarning,
): void {
  warnings.push(warning);
}

function rollupContactsForAccount(
  customerId: string,
  contacts: ImportedContactRow[],
  warnings: ImportRollupWarning[],
): {
  admin_email: string;
  user_email: string;
  owner: string;
  account_owner_hint: string;
} {
  let adminEmail = "";
  let userEmail = "";
  let owner = "";
  let accountOwnerHint = "";
  let adminCount = 0;
  let userCount = 0;

  for (const contact of contacts) {
    const email = normalizeContactEmail(contact.contact_email ?? "");
    const role = normalizeRole(contact.contact_role ?? "");

    if (contact.do_not_contact?.trim().toLowerCase() === "yes") {
      addWarning(warnings, {
        code: "do_not_contact_not_stored",
        message:
          "do_not_contact=Yes is not stored on Customer[] yet; contact was still used for rollup.",
        customer_id: customerId,
        contact_email: email,
      });
    }

    if (role === "admin") {
      if (!email) continue;
      if (adminCount === 0) {
        adminEmail = email;
        accountOwnerHint = contact.contact_name?.trim() ?? "";
      } else {
        addWarning(warnings, {
          code: "multiple_admin_contacts",
          message: "Multiple Admin contacts found; first Admin email was used.",
          customer_id: customerId,
          contact_email: email,
        });
      }
      adminCount++;
      continue;
    }

    if (role === "user") {
      if (!email) continue;
      const normalizedAdmin = adminEmail ? normalizeContactEmail(adminEmail) : "";
      const normalizedUser = normalizeContactEmail(email);
      if (adminCount > 0 && normalizedUser === normalizedAdmin) {
        continue;
      }
      if (userCount === 0) {
        userEmail = email;
      } else {
        addWarning(warnings, {
          code: "multiple_user_contacts",
          message: "Multiple User contacts found; first distinct User email was used.",
          customer_id: customerId,
          contact_email: email,
        });
      }
      userCount++;
      continue;
    }

    if (role === "csm") {
      if (email && isValidEmail(email) && !owner) {
        owner = email;
      }
    }
  }

  if (adminCount === 0) {
    addWarning(warnings, {
      code: "missing_admin_contact",
      message: "No Admin contact found for this account.",
      customer_id: customerId,
    });
  }

  return {
    admin_email: adminEmail,
    user_email: userEmail,
    owner,
    account_owner_hint: accountOwnerHint,
  };
}

function rollupAccountRow(
  account: ImportedAccountRow,
  contacts: ImportedContactRow[],
  now: Date,
  warnings: ImportRollupWarning[],
): Customer {
  const customerId = account.customer_id?.trim() ?? "";

  const contactRollup = rollupContactsForAccount(customerId, contacts, warnings);
  let owner = resolveOwnerFromAccount(account);
  if (contactRollup.owner) {
    owner = contactRollup.owner;
  }

  const accountOwner =
    account.account_owner?.trim() ||
    contactRollup.account_owner_hint ||
    account.customer_name?.trim() ||
    "";

  return {
    customer_id: customerId,
    customer_name: account.customer_name?.trim() ?? "",
    account_owner: accountOwner,
    admin_email: contactRollup.admin_email,
    user_email: contactRollup.user_email,
    role: "Admin",
    plan: account.plan?.trim() ?? "",
    engagement_model: "Tech Touch",
    stage: account.stage?.trim() ?? "",
    term_start_date: account.term_start_date?.trim() ?? "",
    renewal_date: account.renewal_date?.trim() ?? "",
    days_since_start: computeDaysSinceStart(account, now, customerId, warnings),
    days_to_renewal: computeDaysToRenewal(account, now, customerId, warnings),
    invite_sent_date: account.invite_sent_date?.trim() ?? "",
    invite_accepted_date: account.invite_accepted_date?.trim() ?? "",
    invite_status: parseInviteStatus(account.invite_status),
    seats_total: parseNumberField(
      account.seats_total,
      "seats_total",
      customerId,
      warnings,
    ),
    seats_assigned: parseNumberField(
      account.seats_assigned,
      "seats_assigned",
      customerId,
      warnings,
    ),
    seat_assignment_percent: parseNumberField(
      account.seat_assignment_percent,
      "seat_assignment_percent",
      customerId,
      warnings,
    ),
    graph_desktop_assigned: parseNumberField(
      account.graph_desktop_assigned,
      "graph_desktop_assigned",
      customerId,
      warnings,
    ),
    graph_browser_assigned: parseNumberField(
      account.graph_browser_assigned,
      "graph_browser_assigned",
      customerId,
      warnings,
    ),
    search_assigned: parseNumberField(
      account.search_assigned,
      "search_assigned",
      customerId,
      warnings,
    ),
    usage_sessions: parseNumberField(
      account.usage_sessions,
      "usage_sessions",
      customerId,
      warnings,
    ),
    usage_activities: parseNumberField(
      account.usage_activities,
      "usage_activities",
      customerId,
      warnings,
    ),
    active_users: parseNumberField(
      account.active_users,
      "active_users",
      customerId,
      warnings,
    ),
    last_usage_date: account.last_usage_date?.trim() ?? "",
    usage_threshold: parseNumberField(
      account.usage_threshold,
      "usage_threshold",
      customerId,
      warnings,
    ),
    usage_threshold_percent: parseNumberField(
      account.usage_threshold_percent,
      "usage_threshold_percent",
      customerId,
      warnings,
    ),
    use_case: account.use_case?.trim() ?? account.segment?.trim() ?? "",
    icp: account.icp?.trim() ?? "",
    academy_visited: parseYesNo(account.academy_visited, "No"),
    webinar_attended: parseYesNo(account.webinar_attended, "No"),
    last_email_sent: account.last_email_sent_type?.trim() ?? "",
    last_email_sent_date: account.last_email_sent_date?.trim() ?? "",
    emails_sent_count: parseNumberField(
      account.emails_sent_count,
      "emails_sent_count",
      customerId,
      warnings,
    ),
    next_recommended_action: account.next_recommended_action?.trim() ?? "",
    automation_status: "None" as AutomationStatus,
    owner,
    notes: account.notes?.trim() ?? "",
  };
}

/**
 * Roll up a parsed Option C import into the existing flat Customer[] model.
 * Does not validate upload rules or mutate app state.
 */
export function rollupNormalizedImportToCustomers(
  normalized: NormalizedImport,
  options?: { now?: Date },
): ImportRollupResult {
  const now = options?.now ?? new Date();
  const warnings: ImportRollupWarning[] = [];

  const accountIds = new Set(
    normalized.accounts
      .map((row) => row.customer_id?.trim() ?? "")
      .filter(Boolean),
  );

  const contactsByCustomerId = new Map<string, ImportedContactRow[]>();
  for (const contact of normalized.contacts) {
    const customerId = contact.customer_id?.trim() ?? "";
    if (!customerId) continue;

    if (!accountIds.has(customerId)) {
      addWarning(warnings, {
        code: "orphan_contact",
        message: "Contact references a customer_id not found on Accounts sheet.",
        customer_id: customerId,
        contact_email: contact.contact_email,
      });
      continue;
    }

    const existing = contactsByCustomerId.get(customerId) ?? [];
    existing.push(contact);
    contactsByCustomerId.set(customerId, existing);
  }

  const seenCustomerIds = new Set<string>();
  const customers: Customer[] = [];

  for (const account of normalized.accounts) {
    const customerId = account.customer_id?.trim() ?? "";
    if (!customerId) {
      addWarning(warnings, {
        code: "missing_customer_id",
        message: "Skipped Accounts row with empty customer_id.",
      });
      continue;
    }

    if (seenCustomerIds.has(customerId)) {
      addWarning(warnings, {
        code: "duplicate_account",
        message: "Duplicate customer_id on Accounts sheet; first row kept.",
        customer_id: customerId,
      });
      continue;
    }

    seenCustomerIds.add(customerId);
    customers.push(
      rollupAccountRow(
        account,
        contactsByCustomerId.get(customerId) ?? [],
        now,
        warnings,
      ),
    );
  }

  return { customers, warnings };
}
