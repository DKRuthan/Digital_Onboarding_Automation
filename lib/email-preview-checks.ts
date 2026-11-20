import type { ActionQueueItem, Customer, EmailTemplate } from "./types";
import { DEFAULT_EMAIL_TEMPLATES } from "./email-template-definitions";
import {
  resolveActionEmailPreview,
  resolveInternalSendEmailContent,
  validateTemplateForInternalSend,
} from "./action-email-preview";

/** Lightweight integration checks (no test runner in project). */
export function runEmailPreviewIntegrationChecks(): {
  passed: number;
  failed: string[];
} {
  const failed: string[] = [];

  function assert(condition: boolean, message: string) {
    if (!condition) failed.push(message);
  }

  const customer = {
    customer_id: "C-001",
    customer_name: "Acme Corp",
    account_owner: "Jane Admin",
    admin_email: "admin@acme.com",
    user_email: "user@acme.com",
    owner: "Alex CSM",
  } as Customer;

  const renewalItem = {
    id: "C-001-renewal-risk",
    customer_id: "C-001",
    customer_name: "Acme Corp",
    issue: "Renewal Risk",
    recommended_action: "Escalate to CSM",
    recipient: "Alex CSM",
    template: "renewal-risk",
    rule_id: "renewal-risk",
    recipient_type: "CSM",
  } as ActionQueueItem;

  const editedTemplates: EmailTemplate[] = DEFAULT_EMAIL_TEMPLATES.map(
    (template) =>
      template.key === "renewal-risk"
        ? {
            ...template,
            subject: "EDITED RENEWAL SUBJECT {{customer_name}}",
            body: "EDITED RENEWAL BODY for {{customer_name}}",
          }
        : template,
  );

  const editedPreview = resolveInternalSendEmailContent(
    renewalItem,
    customer,
    editedTemplates,
  );
  assert(
    editedPreview.ok &&
      editedPreview.subject.includes("EDITED RENEWAL SUBJECT") &&
      editedPreview.body.includes("EDITED RENEWAL BODY"),
    "Edited renewal-risk template should be used for internal send content",
  );

  const archivedTemplates = editedTemplates.map((template) =>
    template.key === "renewal-risk"
      ? { ...template, status: "archived" as const }
      : template,
  );
  const archivedValidation = validateTemplateForInternalSend(
    "renewal-risk",
    archivedTemplates,
  );
  assert(!archivedValidation.ok, "Archived template must block internal send");

  const draftTemplates = editedTemplates.map((template) =>
    template.key === "renewal-risk"
      ? { ...template, status: "draft" as const }
      : template,
  );
  const draftValidation = validateTemplateForInternalSend(
    "renewal-risk",
    draftTemplates,
  );
  assert(!draftValidation.ok, "Draft template must block internal send");

  const modalPreview = resolveActionEmailPreview(
    renewalItem,
    customer,
    editedTemplates,
  );
  assert(
    modalPreview.source === "library" &&
      modalPreview.subject.includes("EDITED RENEWAL SUBJECT"),
    "Confirmation/preview path should use Email Library template",
  );

  return {
    passed: 4 - failed.length,
    failed,
  };
}
