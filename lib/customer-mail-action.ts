import { renderEmailTemplate } from "./email-template-engine";
import { checkDuplicateRisk } from "./action-workflow";
import { isValidContactEmail, normalizeContactEmail } from "./import-contact-email";
import { isQueueConflictClear } from "./types";
import type { ActionQueueItem, Customer, EmailTemplate, ImportedContact, SendLog } from "./types";

type MailContext = {
  dataSource: "demo" | "upload";
  customer: Customer;
  contacts: ImportedContact[];
  templates: EmailTemplate[];
  logs: SendLog[];
};

export type CustomerMailDraft = {
  to: string;
  subject: string;
  text: string;
};

type Review = { draft: CustomerMailDraft; reason?: never } | { draft?: never; reason: string };

function isExampleDomain(email: string): boolean {
  const domain = email.split("@")[1] || "";
  return /(?:^|\.)(?:example\.(?:com|net|org)|test|example|invalid|localhost)$/.test(domain);
}

/** Only explicit imported, addressable customer contacts can receive live mail. */
export function reviewCustomerMail(item: ActionQueueItem, context: MailContext): Review {
  if (context.dataSource !== "upload") return { reason: "Import your accounts and contacts in Customer Data to send a real email." };
  if (item.workflow_status !== "Approved") return { reason: "Review and approve this action first." };
  if (item.channel !== "email" || !["Admin", "User"].includes(item.recipient_type)) {
    return { reason: "Choose a customer email action." };
  }
  if (item.schedule_status !== "due_now") return { reason: "This action is scheduled for later." };
  if (!isQueueConflictClear(item.conflict_status) || checkDuplicateRisk(context.customer).blocked) {
    return { reason: "The contact is subject to a cooldown or conflict." };
  }
  const to = normalizeContactEmail(item.recipient);
  if (!isValidContactEmail(to) || isExampleDomain(to) || (item.contact_email && normalizeContactEmail(item.contact_email) !== to)) {
    return { reason: "This action needs a real, matching customer email address." };
  }
  const matches = context.contacts.filter(contact => normalizeContactEmail(contact.contact_email) === to);
  if (matches.some(contact => contact.do_not_contact !== false)) return { reason: "This address is marked Do Not Contact or its contact preference is missing." };
  if (matches.length !== 1 || matches[0].customer_id !== item.customer_id || matches[0].contact_role !== item.recipient_type) {
    return { reason: "Import a unique contact with this email, role and account in Customer Data." };
  }
  const template = context.templates.find(entry => entry.key === item.template);
  if (!template || template.type !== "customer_email" || template.status !== "approved") {
    return { reason: "Choose an approved customer email template in Email Templates." };
  }
  const recentCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  if (context.logs.some(log => log.status === "Accepted by SendGrid" && normalizeContactEmail(log.recipient) === to && Date.parse(log.date) >= recentCutoff)) {
    return { reason: "SendGrid already accepted an email for this contact in the past seven days." };
  }
  const {subject, body, unresolvedVariables} = renderEmailTemplate(template, context.customer, item);
  if (!subject.trim() || !body.trim() || unresolvedVariables.length || /\{\{[^}]*\}\}/.test(subject + body)) {
    return { reason: "Fill in the missing template fields before sending." };
  }
  if (/https?:\/\/[^/\s]*\bexample\.(com|net|org)\b/i.test(subject + "\n" + body)) {
    return { reason: "Replace the example link in Email Templates before sending." };
  }
  return { draft: { to, subject: subject.trim(), text: body.trim() } };
}

/** Immediate schedules change on render; only recurring calendar occurrences need a date discriminator. */
export async function customerMailRequestId(item: ActionQueueItem, email: string): Promise<string> {
  const occurrence = item.timing_type === "weekly" || item.timing_type === "monthly" ? item.scheduled_for.slice(0, 10) : "";
  const identity = JSON.stringify(["queue-mail-v1", item.customer_id, item.id, normalizeContactEmail(email), occurrence]);
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity))).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}
