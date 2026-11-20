import { isValidCustomerEmail } from "./customer-data-quality";
import type { Customer, EditableAutomationRule } from "./types";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function rawEmailForRecipientType(
  customer: Customer,
  recipientType: EditableAutomationRule["recipientType"],
): string {
  switch (recipientType) {
    case "User":
      return customer.user_email?.trim() ?? "";
    case "CSM":
      return customer.owner?.trim() ?? "";
    case "Admin":
    default:
      return customer.admin_email?.trim() ?? "";
  }
}

/** Resolve contact_email for Activity Trigger queue rows (metadata only). */
export function resolveTriggerQueueContactEmail(
  customer: Customer,
  rule: EditableAutomationRule,
): string | undefined {
  const raw = rawEmailForRecipientType(customer, rule.recipientType);
  if (!raw || !isValidCustomerEmail(raw)) return undefined;
  return normalizeEmail(raw);
}

export function resolveTriggerQueueContactMetadata(
  customer: Customer,
  rule: EditableAutomationRule,
): {
  contact_email?: string;
  contact_role: EditableAutomationRule["recipientType"];
} {
  const contact_email = resolveTriggerQueueContactEmail(customer, rule);
  return contact_email
    ? { contact_email, contact_role: rule.recipientType }
    : { contact_role: rule.recipientType };
}
