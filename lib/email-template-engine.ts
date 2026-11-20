import type {
  ActionQueueItem,
  Customer,
  EmailTemplate,
  RenderedEmailPreview,
} from "./types";
import {
  ALLOWED_TEMPLATE_VARIABLES,
  normalizeTemplateKey,
} from "./email-template-definitions";

const VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;

const ALLOWED_VARIABLE_NAMES = new Set(
  ALLOWED_TEMPLATE_VARIABLES.map((v) => v.replace(/[{}]/g, "")),
);

export function extractVariablesFromText(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(VARIABLE_PATTERN)) {
    found.add(`{{${match[1]}}}`);
  }
  return [...found];
}

export function findUnknownVariables(text: string): string[] {
  const unknown: string[] = [];
  for (const match of text.matchAll(VARIABLE_PATTERN)) {
    const token = `{{${match[1]}}}`;
    if (!ALLOWED_VARIABLE_NAMES.has(match[1])) {
      unknown.push(token);
    }
  }
  return [...new Set(unknown)];
}

function buildVariableMap(
  customer: Customer,
  item?: ActionQueueItem,
): Record<string, string> {
  return {
    customer_name: customer.customer_name,
    admin_name: customer.account_owner,
    owner_name: customer.owner,
    seats_total: String(customer.seats_total),
    seats_assigned: String(customer.seats_assigned),
    usage_sessions: String(customer.usage_sessions),
    days_since_start: String(customer.days_since_start),
    days_to_renewal: String(customer.days_to_renewal),
    academy_link: "https://academy.example.com/onboarding",
    webinar_link: "https://events.example.com/webinar",
    recommended_action: item?.recommended_action ?? "",
    recipient: item?.recipient ?? customer.owner,
  };
}

export function renderEmailTemplateText(
  text: string,
  customer: Customer,
  item?: ActionQueueItem,
): { rendered: string; unresolvedVariables: string[] } {
  const vars = buildVariableMap(customer, item);
  const unresolved = new Set<string>();

  const rendered = text.replace(VARIABLE_PATTERN, (match, key: string) => {
    const value = vars[key];
    if (value === undefined || value === "") {
      if (!ALLOWED_VARIABLE_NAMES.has(key)) {
        unresolved.add(match);
      }
      return match;
    }
    return value;
  });

  for (const match of text.matchAll(VARIABLE_PATTERN)) {
    const key = match[1];
    if (ALLOWED_VARIABLE_NAMES.has(key) && !vars[key]) {
      unresolved.add(`{{${key}}}`);
    }
  }

  return { rendered, unresolvedVariables: [...unresolved] };
}

export function renderEmailTemplate(
  template: Pick<EmailTemplate, "subject" | "body">,
  customer: Customer,
  item?: ActionQueueItem,
): RenderedEmailPreview {
  const subjectResult = renderEmailTemplateText(template.subject, customer, item);
  const bodyResult = renderEmailTemplateText(template.body, customer, item);

  return {
    subject: subjectResult.rendered,
    body: bodyResult.rendered,
    unresolvedVariables: [
      ...new Set([
        ...subjectResult.unresolvedVariables,
        ...bodyResult.unresolvedVariables,
      ]),
    ],
  };
}

export function validateEmailTemplate(
  template: EmailTemplate,
  allTemplates: EmailTemplate[],
): string[] {
  const errors: string[] = [];

  if (!template.name.trim()) errors.push("Name is required.");
  if (!template.key.trim()) errors.push("Key is required.");
  if (!template.subject.trim()) errors.push("Subject is required.");
  if (!template.body.trim()) errors.push("Body is required.");
  if (!template.sender_name.trim()) errors.push("Sender is required.");

  const normalizedKey = normalizeTemplateKey(template.key);
  if (template.key.trim() && !normalizedKey) {
    errors.push("Key must contain letters or numbers.");
  }

  const duplicate = allTemplates.find(
    (entry) =>
      entry.id !== template.id &&
      normalizeTemplateKey(entry.key) === normalizedKey &&
      normalizedKey.length > 0,
  );
  if (duplicate) {
    errors.push(`Template key "${normalizedKey}" is already used by "${duplicate.name}".`);
  }

  const combined = `${template.subject}\n${template.body}`;
  const unknown = findUnknownVariables(combined);
  if (unknown.length > 0) {
    errors.push(
      `Unknown variables: ${unknown.join(", ")}. Use only allowed variables.`,
    );
  }

  return errors;
}

export function duplicateEmailTemplate(
  source: EmailTemplate,
  existing: EmailTemplate[],
): EmailTemplate {
  const baseKey = source.key.replace(/-variation(-\d+)?$/, "");
  const prefix = `${baseKey}-variation`;
  const variationCount = existing.filter((template) => {
    if (normalizeTemplateKey(template.key) === prefix) return true;
    return new RegExp(`^${escapeRegExp(baseKey)}-variation-\\d+$`).test(
      template.key,
    );
  }).length;

  const newKey = variationCount === 0 ? prefix : `${prefix}-${variationCount + 1}`;
  const now = new Date().toISOString();

  return {
    ...cloneTemplateFields(source),
    id: `tpl-${Date.now().toString(36)}`,
    key: newKey,
    name: `${source.name} - Variation`,
    status: "draft",
    version: 1,
    latest_change_note: "",
    created_at: now,
    updated_at: now,
  };
}

function cloneTemplateFields(template: EmailTemplate): EmailTemplate {
  return {
    ...template,
    variables_used: [...template.variables_used],
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isTemplateSelectableInAutomation(
  template: EmailTemplate,
): boolean {
  return template.status === "approved";
}
