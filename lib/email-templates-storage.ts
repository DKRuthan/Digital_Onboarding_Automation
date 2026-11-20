import type { EmailTemplate } from "./types";
import {
  cloneDefaultEmailTemplates,
  cloneEmailTemplate,
  EMAIL_TEMPLATES_STORAGE_KEY,
  normalizeTemplateKey,
} from "./email-template-definitions";
import { extractVariablesFromText } from "./email-template-engine";

export { EMAIL_TEMPLATES_STORAGE_KEY };

export function cloneDefaultEmailTemplatesFromStorage(): EmailTemplate[] {
  return cloneDefaultEmailTemplates();
}

function isStoredTemplateShape(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const template = value as Record<string, unknown>;
  return (
    typeof template.id === "string" &&
    typeof template.key === "string" &&
    typeof template.name === "string"
  );
}

function normalizeStoredTemplate(template: EmailTemplate): EmailTemplate {
  const combined = `${template.subject}\n${template.body}`;
  return {
    ...template,
    key: normalizeTemplateKey(template.key) || template.key,
    variables_used: extractVariablesFromText(combined),
    latest_change_note: template.latest_change_note ?? "",
  };
}

export function loadStoredEmailTemplates(): EmailTemplate[] | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(EMAIL_TEMPLATES_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    if (!parsed.every(isStoredTemplateShape)) return null;

    return (parsed as unknown as EmailTemplate[]).map(normalizeStoredTemplate);
  } catch {
    return null;
  }
}

export function saveStoredEmailTemplates(templates: EmailTemplate[]): void {
  if (typeof window === "undefined") return;

  try {
    const normalized = templates.map(normalizeStoredTemplate);
    window.localStorage.setItem(
      EMAIL_TEMPLATES_STORAGE_KEY,
      JSON.stringify(normalized),
    );
  } catch {
    // Ignore quota / private mode errors in demo MVP.
  }
}

export function clearStoredEmailTemplates(): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(EMAIL_TEMPLATES_STORAGE_KEY);
  } catch {
    // Ignore storage errors in demo MVP.
  }
}

export function normalizeEmailTemplate(template: EmailTemplate): EmailTemplate {
  return normalizeStoredTemplate(cloneEmailTemplate(template));
}
