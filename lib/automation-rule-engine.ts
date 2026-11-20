import type {
  ConditionLogic,
  Customer,
  EditableAutomationRule,
  EmailTemplate,
  RuleCondition,
  RuleConditionGroup,
  RuleTestMatch,
} from "./types";
import {
  getTemplateTypeForChannel,
} from "./email-template-definitions";
import {
  CONDITION_OPERATORS,
  RULE_CONDITION_FIELDS,
  createConditionGroup,
  generateRuleId,
  groupId,
} from "./automation-rule-definitions";
import { normalizeAutomationRule } from "./automation-rule-migration";
import {
  computeActionSchedule,
  validateRuleTiming,
} from "./automation-rule-scheduling";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function fieldMeta(field: RuleCondition["field"]) {
  return RULE_CONDITION_FIELDS.find((f) => f.value === field);
}

function isWithinCooldown(customer: Customer, cooldownDays: number): boolean {
  if (cooldownDays <= 0 || !customer.last_email_sent_date?.trim()) return false;
  const lastSent = new Date(customer.last_email_sent_date);
  if (Number.isNaN(lastSent.getTime())) return false;
  const elapsed = Date.now() - lastSent.getTime();
  return elapsed >= 0 && elapsed < cooldownDays * MS_PER_DAY;
}

function evaluateCondition(customer: Customer, condition: RuleCondition): boolean {
  const meta = fieldMeta(condition.field);
  const raw = customer[condition.field];
  const value = condition.value.trim();

  if (!value) return false;

  if (meta?.type === "number") {
    const numValue = Number(raw);
    const compare = Number(value);
    if (Number.isNaN(numValue) || Number.isNaN(compare)) return false;

    switch (condition.operator) {
      case "equals":
        return numValue === compare;
      case "not_equals":
        return numValue !== compare;
      case "greater_than":
        return numValue > compare;
      case "greater_or_equal":
        return numValue >= compare;
      case "less_than":
        return numValue < compare;
      case "less_or_equal":
        return numValue <= compare;
      default:
        return false;
    }
  }

  const strValue = String(raw).trim();
  switch (condition.operator) {
    case "equals":
      return strValue === value;
    case "not_equals":
      return strValue !== value;
    default:
      return false;
  }
}

function evaluateConditionGroup(
  group: RuleConditionGroup,
  customer: Customer,
): boolean {
  if (group.conditions.length === 0) return false;
  const results = group.conditions.map((condition) =>
    evaluateCondition(customer, condition),
  );
  return group.logic === "AND"
    ? results.every(Boolean)
    : results.some(Boolean);
}

export function evaluateRuleConditions(
  rule: EditableAutomationRule,
  customer: Customer,
): boolean {
  const normalized = normalizeAutomationRule(rule);
  if (normalized.condition_groups.length === 0) return false;

  const groupResults = normalized.condition_groups.map((group) =>
    evaluateConditionGroup(group, customer),
  );

  return normalized.group_logic === "AND"
    ? groupResults.every(Boolean)
    : groupResults.some(Boolean);
}

export function evaluateRule(
  rule: EditableAutomationRule,
  customer: Customer,
): boolean {
  if (!rule.active) return false;
  if (isWithinCooldown(customer, rule.cooldownDays)) return false;
  return evaluateRuleConditions(rule, customer);
}

export function resolveRuleRecipient(
  rule: EditableAutomationRule,
  customer: Customer,
): string {
  switch (rule.recipientType) {
    case "CSM":
      return customer.owner;
    case "User":
      return customer.user_email;
    case "Admin":
    default:
      return customer.admin_email;
  }
}

export function formatConditionLabel(condition: RuleCondition): string {
  const field = fieldMeta(condition.field)?.label ?? condition.field;
  const op =
    CONDITION_OPERATORS.find((o) => o.value === condition.operator)?.label ??
    condition.operator;
  return `${field} ${op} ${condition.value}`;
}

export function formatLogicConnector(logic: ConditionLogic): string {
  return logic;
}

export interface RuleConditionGroupDisplay {
  title: string;
  logic: ConditionLogic;
  conditionLabels: string[];
}

export interface RulePlainEnglishSummary {
  intro: string;
  items: string[];
}

function formatConditionPlainEnglish(condition: RuleCondition): string {
  const field = fieldMeta(condition.field)?.label ?? condition.field;
  const value = condition.value.trim() || "[value required]";

  switch (condition.operator) {
    case "equals":
      return `${field} equals ${value}`;
    case "not_equals":
      return `${field} does not equal ${value}`;
    case "greater_than":
      return `${field} is greater than ${value}`;
    case "greater_or_equal":
      return `${field} is at least ${value}`;
    case "less_than":
      return `${field} is less than ${value}`;
    case "less_or_equal":
      return `${field} is at most ${value}`;
    default:
      return `${field} ${condition.operator} ${value}`;
  }
}

function formatGroupConditionsPlainEnglish(group: RuleConditionGroup): string {
  if (group.conditions.length === 0) {
    return "No conditions in this group.";
  }

  const connector = group.logic === "AND" ? " and " : " or ";
  const joined = group.conditions
    .map(formatConditionPlainEnglish)
    .join(connector);
  return joined.endsWith(".") ? joined : `${joined}.`;
}

/** Read-only plain-English summary for business users. Does not affect evaluation. */
export function getRulePlainEnglishSummary(
  rule: EditableAutomationRule,
): RulePlainEnglishSummary {
  const normalized = normalizeAutomationRule(rule);
  const groups = normalized.condition_groups;

  if (groups.length === 0) {
    return {
      intro: "This rule has no conditions yet.",
      items: [],
    };
  }

  const base = "This rule matches customers";

  if (groups.length === 1) {
    const group = groups[0];
    const intro =
      group.logic === "AND"
        ? `${base} where all of the following are true:`
        : `${base} where any of the following are true:`;

    const items = group.conditions.map((condition) => {
      const text = formatConditionPlainEnglish(condition);
      return text.endsWith(".") ? text : `${text}.`;
    });

    return { intro, items };
  }

  const intro =
    normalized.group_logic === "OR"
      ? `${base} where either:`
      : `${base} where all groups must match:`;

  return {
    intro,
    items: groups.map(formatGroupConditionsPlainEnglish),
  };
}

export function getRuleConditionGroupsDisplay(
  rule: EditableAutomationRule,
): {
  groupLogic: ConditionLogic;
  groupLogicSummary: string;
  groups: RuleConditionGroupDisplay[];
} {
  const normalized = normalizeAutomationRule(rule);

  return {
    groupLogic: normalized.group_logic,
    groupLogicSummary:
      normalized.group_logic === "AND"
        ? "ALL groups match (AND)"
        : "ANY group matches (OR)",
    groups: normalized.condition_groups.map((group, index) => ({
      title: `Group ${index + 1}`,
      logic: group.logic,
      conditionLabels: group.conditions.map(formatConditionLabel),
    })),
  };
}

/** One-line summary for compact lists (e.g. dashboard). */
export function formatRuleConditions(rule: EditableAutomationRule): string {
  const display = getRuleConditionGroupsDisplay(rule);
  if (display.groups.length === 0) return "No conditions";

  const groupSummaries = display.groups.map((group) => {
    const joined = group.conditionLabels.join(` ${group.logic} `);
    return display.groups.length > 1 ? `(${joined})` : joined;
  });

  return groupSummaries.join(` ${display.groupLogic} `);
}

export function testAutomationRule(
  rule: EditableAutomationRule,
  customers: Customer[],
): RuleTestMatch[] {
  return customers
    .filter((customer) => evaluateRuleConditions(rule, customer))
    .map((customer) => {
      const schedule = computeActionSchedule(rule, customer);
      return {
        customer_id: customer.customer_id,
        customer_name: customer.customer_name,
        recommended_action: rule.recommendedAction,
        recipient: resolveRuleRecipient(rule, customer),
        template: rule.template,
        scheduled_for: schedule.scheduled_for,
        schedule_status: schedule.schedule_status,
        timing_label: schedule.timing_label,
      };
    });
}

export function validateRuleTemplateSelection(
  rule: EditableAutomationRule,
  templates: EmailTemplate[],
): string[] {
  const errors: string[] = [];
  const normalized = normalizeAutomationRule(rule);

  if (normalized.channel === "in_app") {
    if (normalized.template.trim()) {
      errors.push(
        "In-app actions do not use email templates. Clear the template field.",
      );
    }
    return errors;
  }

  const key = normalized.template.trim();
  if (!key) {
    errors.push("Template is required for this channel.");
    return errors;
  }

  const requiredType = getTemplateTypeForChannel(normalized.channel);
  if (!requiredType) {
    errors.push(
      "This channel requires an approved Email Library template, but no template type is configured.",
    );
    return errors;
  }

  const template = templates.find((entry) => entry.key === key);
  if (!template) {
    errors.push(
      `Template "${key}" was not found in Email Library. Choose an approved template.`,
    );
    return errors;
  }

  if (template.status === "archived") {
    errors.push(
      `Template "${key}" is archived. Choose an approved template in Email Library.`,
    );
  } else if (template.status !== "approved") {
    errors.push(
      `Template "${key}" is ${template.status}. Approve it in Email Library before using it in a rule.`,
    );
  }

  if (template.type !== requiredType) {
    errors.push(
      `Template "${key}" is type "${template.type}", but ${normalized.channel} rules require an approved ${requiredType} template.`,
    );
  }

  return errors;
}

export const DUPLICATE_TRIGGER_NAME_WARNING =
  "A trigger with this name already exists. You can still save, but consider using a clearer name.";

export function isRuleIdInUse(
  id: string,
  existingRules: EditableAutomationRule[],
  excludeRuleId?: string,
): boolean {
  const trimmed = id.trim();
  if (!trimmed) return false;
  return existingRules.some(
    (rule) => rule.id === trimmed && rule.id !== excludeRuleId,
  );
}

/** Assign a fresh id on create when the draft id collides with an existing rule. */
export function resolveRuleIdForCreate(
  rule: EditableAutomationRule,
  existingRules: EditableAutomationRule[],
): EditableAutomationRule {
  let id = rule.id?.trim() || generateRuleId();
  if (!isRuleIdInUse(id, existingRules)) {
    return { ...rule, id };
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    id = generateRuleId();
    if (!isRuleIdInUse(id, existingRules)) {
      return { ...rule, id };
    }
  }

  return { ...rule, id };
}

export function validateRuleIdForSave(
  rule: EditableAutomationRule,
  existingRules: EditableAutomationRule[],
  mode: "create" | "edit",
  originalRuleId?: string,
): string[] {
  const errors: string[] = [];
  const id = rule.id?.trim();

  if (!id) {
    errors.push("Rule id is missing.");
    return errors;
  }

  if (mode === "create") {
    if (isRuleIdInUse(id, existingRules)) {
      errors.push(
        "Could not assign a unique trigger id. Close the modal and try Add Trigger again.",
      );
    }
    return errors;
  }

  const originalId = originalRuleId?.trim() || id;
  if (id !== originalId && isRuleIdInUse(id, existingRules, originalId)) {
    errors.push("Cannot save — this trigger id is already used by another rule.");
  }

  const duplicates = existingRules.filter((entry) => entry.id === id);
  if (duplicates.length > 1) {
    errors.push("Cannot save — duplicate trigger ids detected in local rules.");
  }

  return errors;
}

export function getDuplicateTriggerNameWarning(
  rule: EditableAutomationRule,
  existingRules: EditableAutomationRule[],
  excludeRuleId?: string,
): string | null {
  const name = rule.name.trim();
  if (!name) return null;

  const hasDuplicate = existingRules.some(
    (entry) =>
      entry.id !== excludeRuleId && entry.name.trim().toLowerCase() === name.toLowerCase(),
  );

  return hasDuplicate ? DUPLICATE_TRIGGER_NAME_WARNING : null;
}

/** Minimal shape checks for provider save — no Email Library context required. */
export function validateAutomationRuleShape(
  rule: EditableAutomationRule,
): string[] {
  const errors: string[] = [];
  const normalized = normalizeAutomationRule(rule);

  if (!normalized.id?.trim()) errors.push("Rule id is required.");
  if (!normalized.name.trim()) errors.push("Rule name is required.");
  if (!normalized.channel) errors.push("Channel is required.");
  if (!normalized.recipientType) errors.push("Recipient type is required.");
  if (normalized.condition_groups.length === 0) {
    errors.push("At least one condition group is required.");
  }

  return errors;
}

export function validateAutomationRule(
  rule: EditableAutomationRule,
  emailTemplates: EmailTemplate[] = [],
): string[] {
  const errors: string[] = [];

  errors.push(
    ...validateRuleTiming(rule.timing ?? { type: "immediate" }),
  );

  const normalized = normalizeAutomationRule(rule);

  if (!normalized.name.trim()) errors.push("Rule name is required.");
  if (!normalized.recommendedAction.trim()) {
    errors.push("Recommended action label is required.");
  }
  if (!normalized.channel) errors.push("Channel is required.");
  if (normalized.cooldownDays < 0) {
    errors.push("Cooldown days cannot be negative.");
  }
  if (normalized.condition_groups.length === 0) {
    errors.push("At least one condition group is required.");
  }

  for (const [groupIndex, group] of normalized.condition_groups.entries()) {
    if (group.conditions.length === 0) {
      errors.push(`Group ${groupIndex + 1}: at least one condition is required.`);
    }

    for (const [conditionIndex, condition] of group.conditions.entries()) {
      const label = `Group ${groupIndex + 1}, condition ${conditionIndex + 1}`;
      if (!condition.field) errors.push(`${label}: field is required.`);
      if (!condition.operator) errors.push(`${label}: operator is required.`);
      if (!condition.value.trim()) errors.push(`${label}: value is required.`);
    }
  }

  errors.push(...validateRuleTemplateSelection(normalized, emailTemplates));

  return errors;
}

function cloneConditionWithNewId(condition: RuleCondition): RuleCondition {
  return {
    ...condition,
    id: `cond-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
  };
}

export function duplicateAutomationRule(
  rule: EditableAutomationRule,
  existingRules: EditableAutomationRule[],
): EditableAutomationRule {
  const normalized = normalizeAutomationRule(rule);

  return {
    ...normalized,
    id: `${normalized.id}-copy-${Date.now().toString(36)}`,
    name: buildDuplicateRuleName(normalized, existingRules),
    active: false,
    condition_groups: normalized.condition_groups.map((group) =>
      createConditionGroup(
        group.conditions.map(cloneConditionWithNewId),
        group.logic,
      ),
    ),
  };
}

function getBaseRuleName(name: string): string {
  return name.replace(/\s-\sVariation(\s\d+)?$/, "").trim();
}

function buildDuplicateRuleName(
  source: EditableAutomationRule,
  existingRules: EditableAutomationRule[],
): string {
  const base = getBaseRuleName(source.name);
  const prefix = `${base} - Variation`;

  const variationCount = existingRules.filter((rule) => {
    if (rule.name === prefix) return true;
    const match = rule.name.match(
      new RegExp(`^${escapeRegExp(base)} - Variation (\\d+)$`),
    );
    return Boolean(match);
  }).length;

  if (variationCount === 0) return prefix;
  return `${prefix} ${variationCount + 1}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function countRuleCustomerMatches(
  rule: EditableAutomationRule,
  customers: Customer[],
): number {
  if (rule.active) {
    return customers.filter((customer) => evaluateRule(rule, customer)).length;
  }

  return customers.filter((customer) =>
    evaluateRule({ ...rule, active: true }, customer),
  ).length;
}

export function getActiveRules(rules: EditableAutomationRule[]) {
  return rules.filter((r) => r.active);
}

const AT_RISK_RULE_IDS = new Set(["renewal-risk", "no-usage", "low-usage"]);

export function isAtRiskRule(rule: EditableAutomationRule): boolean {
  return AT_RISK_RULE_IDS.has(rule.id) || rule.template === "renewal-risk";
}

export function createEmptyConditionGroup(
  logic: ConditionLogic = "AND",
): RuleConditionGroup {
  return createConditionGroup(
    [
      {
        id: `cond-${Date.now().toString(36)}`,
        field: "invite_status",
        operator: "equals",
        value: "",
      },
    ],
    logic,
  );
}

export function duplicateConditionGroup(
  group: RuleConditionGroup,
): RuleConditionGroup {
  return {
    id: groupId(),
    logic: group.logic,
    conditions: group.conditions.map(cloneConditionWithNewId),
  };
}
