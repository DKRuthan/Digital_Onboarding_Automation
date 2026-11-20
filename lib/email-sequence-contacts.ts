import type { Customer, RecipientType } from "./types";
import type { SequenceAccountContext, SequenceContact } from "./email-sequence-types";

function isValidEmail(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.includes("@");
}

/** Build account context from customer row (context only — not the recipient). */
export function buildSequenceAccountContext(
  customer: Customer,
): SequenceAccountContext {
  return {
    customer_id: customer.customer_id,
    customer_name: customer.customer_name,
    account_owner: customer.account_owner,
    seats_total: customer.seats_total,
    seats_assigned: customer.seats_assigned,
    usage_sessions: customer.usage_sessions,
    usage_threshold_percent: customer.usage_threshold_percent,
    renewal_date: customer.renewal_date,
  };
}

/**
 * Resolve contact(s) for sequence enrollment from account data + step recipient_type.
 * Returns one entry per eligible contact_email. Empty if none found.
 */
export function resolveSequenceContacts(
  customer: Customer,
  recipientType: RecipientType,
): SequenceContact[] {
  switch (recipientType) {
    case "Admin": {
      const email = customer.admin_email?.trim() ?? "";
      if (!isValidEmail(email)) return [];
      return [
        {
          contact_email: email,
          contact_name: customer.account_owner || customer.customer_name,
          contact_role: "Admin",
        },
      ];
    }
    case "User": {
      const email = customer.user_email?.trim() ?? "";
      if (!isValidEmail(email)) return [];
      return [
        {
          contact_email: email,
          contact_name: customer.user_email.split("@")[0] || "Primary user",
          contact_role: "User",
        },
      ];
    }
    case "CSM": {
      const owner = customer.owner?.trim() ?? "";
      if (!owner) return [];
      if (isValidEmail(owner)) {
        return [
          {
            contact_email: owner,
            contact_name: owner.split("@")[0] || customer.owner,
            contact_role: "CSM",
          },
        ];
      }
      return [
        {
          contact_email: owner,
          contact_name: owner,
          contact_role: "CSM",
        },
      ];
    }
    default:
      return [];
  }
}

/**
 * Invite Not Accepted: pending invite → admin (or invited admin email).
 * Seats Underassigned / No Usage: admin or user per rule recipient_type.
 * Renewal Risk: internal CSM — not a customer email sequence unless explicitly configured.
 */
export function resolveContactsForRuleEnrollment(
  customer: Customer,
  recipientType: RecipientType,
  ruleId?: string,
): SequenceContact[] {
  if (ruleId === "invite-not-accepted" && customer.invite_status === "Pending") {
    return resolveSequenceContacts(customer, "Admin");
  }
  return resolveSequenceContacts(customer, recipientType);
}
