import type {
  ActionQueueItem,
  Customer,
  EmailTemplate,
  EmailTemplateType,
} from "./types";
import { renderEmailTemplate } from "./email-template-engine";

export interface EmailPreviewContent {
  subject: string;
  body: string;
}

export type ActionEmailPreviewSource = "library" | "legacy" | "generic";

export interface ResolvedActionEmailPreview extends EmailPreviewContent {
  templateKey: string;
  source: ActionEmailPreviewSource;
  libraryTemplate?: EmailTemplate;
}

export interface InternalSendTemplateValidation {
  ok: boolean;
  error?: string;
  template?: EmailTemplate;
}

const legacyTemplates: Record<
  string,
  (customer: Customer, item: ActionQueueItem) => EmailPreviewContent
> = {
  "invite-reminder": (c) => ({
    subject: `Reminder: Accept your ${c.customer_name} platform invite`,
    body: `Hi ${c.account_owner},\n\nWe noticed your admin invite for ${c.customer_name} is still pending.\n\nBest,\nOnboarding Team`,
  }),
  "getting-started": (c) => ({
    subject: `Get started with your ${c.plan} account`,
    body: `Hi ${c.account_owner},\n\nYour ${c.customer_name} account was set up ${c.days_since_start} days ago.\n\nBest,\nOnboarding Team`,
  }),
  "usage-tips": (c) => ({
    subject: `Tips to increase adoption at ${c.customer_name}`,
    body: `Hi ${c.account_owner},\n\nWe noticed ${c.customer_name} has ${c.usage_sessions} usage sessions.\n\nBest,\nCustomer Success`,
  }),
  "seat-assignment": (c) => ({
    subject: `Action needed: Assign remaining seats at ${c.customer_name}`,
    body: `Hi ${c.account_owner},\n\nOnly ${c.seats_assigned} of ${c.seats_total} seats are assigned.\n\nBest,\nOnboarding Team`,
  }),
  "academy-invite": (c) => ({
    subject: `You're invited: ${c.customer_name} Academy onboarding`,
    body: `Hi ${c.account_owner},\n\nJoin the Digital Onboarding Academy for ${c.customer_name}.\n\nBest,\nEnablement Team`,
  }),
  "webinar-invite": (c) => ({
    subject: `Join our live webinar — built for ${c.customer_name}`,
    body: `Hi ${c.account_owner},\n\nSave your seat for the next product webinar.\n\nBest,\nEvents Team`,
  }),
  "renewal-risk": (c, item) => ({
    subject: `[CSM Action] Renewal risk: ${c.customer_name}`,
    body: `Hi ${item.recipient},\n\n${c.customer_name} is flagged for renewal risk.\n\n${item.recommended_action}\n\nBest,\nAutomation System`,
  }),
};

function findLibraryTemplate(
  templateKey: string,
  templates: EmailTemplate[],
): EmailTemplate | undefined {
  return templates.find((template) => template.key === templateKey);
}

/** Preview for queue modals — prefers non-archived Email Library templates. */
export function resolveActionEmailPreview(
  item: ActionQueueItem,
  customer: Customer,
  templates: EmailTemplate[],
): ResolvedActionEmailPreview {
  const libraryTemplate = templates.find(
    (template) =>
      template.key === item.template && template.status !== "archived",
  );

  if (libraryTemplate) {
    const rendered = renderEmailTemplate(libraryTemplate, customer, item);
    return {
      subject: rendered.subject,
      body: rendered.body,
      templateKey: item.template,
      source: "library",
      libraryTemplate,
    };
  }

  const legacy = legacyTemplates[item.template];
  if (legacy) {
    const content = legacy(customer, item);
    return {
      ...content,
      templateKey: item.template,
      source: "legacy",
    };
  }

  return {
    subject: `Action required: ${item.issue}`,
    body: `Hi ${customer.account_owner},\n\n${item.recommended_action}\n\n— Onboarding Team`,
    templateKey: item.template,
    source: "generic",
  };
}

/** @deprecated Use resolveActionEmailPreview for library-aware previews. */
export function getEmailPreview(
  item: ActionQueueItem,
  customer: Customer,
  templates: EmailTemplate[] = [],
): EmailPreviewContent {
  return resolveActionEmailPreview(item, customer, templates);
}

export function getEmailTemplateByKey(
  key: string,
  templates: EmailTemplate[],
): EmailTemplate | undefined {
  return findLibraryTemplate(key, templates);
}

export function validateTemplateForInternalSend(
  templateKey: string,
  templates: EmailTemplate[],
  requiredType: EmailTemplateType = "internal_alert",
): InternalSendTemplateValidation {
  const template = findLibraryTemplate(templateKey, templates);

  if (!template) {
    return {
      ok: false,
      error: `Template "${templateKey}" was not found in Email Library. Add or restore it before internal send.`,
    };
  }

  if (template.status === "archived") {
    return {
      ok: false,
      error: `Template "${templateKey}" is archived. Unarchive or choose an approved template.`,
    };
  }

  if (template.status !== "approved") {
    return {
      ok: false,
      error: `Template "${templateKey}" is ${template.status}. Approve it in Email Library before internal send.`,
    };
  }

  if (template.type !== requiredType) {
    return {
      ok: false,
      error: `Template "${templateKey}" is type "${template.type}", not "${requiredType}". Internal send requires an approved internal alert template.`,
    };
  }

  return { ok: true, template };
}

export type InternalSendEmailContentResult =
  | {
      ok: true;
      subject: string;
      body: string;
      template: EmailTemplate;
    }
  | {
      ok: false;
      error: string;
    };

/** Subject/body for internal SendGrid payload — Email Library is the source of truth. */
export function resolveInternalSendEmailContent(
  item: ActionQueueItem,
  customer: Customer,
  templates: EmailTemplate[],
): InternalSendEmailContentResult {
  const validation = validateTemplateForInternalSend(item.template, templates);
  if (!validation.ok || !validation.template) {
    return { ok: false, error: validation.error ?? "Invalid template" };
  }

  const rendered = renderEmailTemplate(validation.template, customer, item);
  return {
    ok: true,
    subject: rendered.subject,
    body: rendered.body,
    template: validation.template,
  };
}

export function getInternalSendTemplateError(
  item: ActionQueueItem,
  templates: EmailTemplate[],
): string | undefined {
  const result = validateTemplateForInternalSend(item.template, templates);
  return result.ok ? undefined : result.error;
}
