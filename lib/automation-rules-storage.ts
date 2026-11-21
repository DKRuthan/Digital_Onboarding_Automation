import { workspaceStorage } from "./browser-workspace-storage";
import type { EditableAutomationRule } from "./types";
import {
  cloneAutomationRule,
  DEFAULT_AUTOMATION_RULES,
} from "./automation-rule-definitions";
import {
  migrateAutomationRule,
  migrateAutomationRules,
  normalizeAutomationRule,
} from "./automation-rule-migration";

export const AUTOMATION_RULES_STORAGE_KEY =
  "onboarding-control-automation-rules";

export function cloneDefaultAutomationRules(): EditableAutomationRule[] {
  return DEFAULT_AUTOMATION_RULES.map(cloneAutomationRule);
}

function isStoredRuleShape(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const rule = value as Record<string, unknown>;
  return typeof rule.id === "string" && typeof rule.name === "string";
}

export function loadStoredAutomationRules(): EditableAutomationRule[] | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = workspaceStorage.getItem(AUTOMATION_RULES_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    if (!parsed.every(isStoredRuleShape)) return null;

    const migrated = migrateAutomationRules(parsed);
    if (migrated.length === 0) return null;

    return migrated.map(normalizeAutomationRule);
  } catch {
    return null;
  }
}

export function saveStoredAutomationRules(
  rules: EditableAutomationRule[],
): void {
  if (typeof window === "undefined") return;

  try {
    const normalized = rules.map(normalizeAutomationRule);
    workspaceStorage.setItem(
      AUTOMATION_RULES_STORAGE_KEY,
      JSON.stringify(normalized),
    );
  } catch {
    // Ignore quota / private mode errors in demo MVP.
  }
}

export function clearStoredAutomationRules(): void {
  if (typeof window === "undefined") return;

  try {
    workspaceStorage.removeItem(AUTOMATION_RULES_STORAGE_KEY);
  } catch {
    // Ignore storage errors in demo MVP.
  }
}

export { migrateAutomationRule, normalizeAutomationRule };
