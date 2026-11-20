import type {
  ConditionLogic,
  EditableAutomationRule,
  RuleCondition,
  RuleConditionGroup,
} from "./types";
import { createConditionGroup } from "./automation-rule-definitions";
import { normalizeRuleTiming } from "./automation-rule-scheduling";
import type { RuleTiming } from "./types";

type LegacyRule = Partial<EditableAutomationRule> & {
  conditions?: RuleCondition[];
  conditionLogic?: ConditionLogic;
  condition_groups?: RuleConditionGroup[];
  group_logic?: ConditionLogic;
  timing?: RuleTiming;
};

function cloneConditions(conditions: RuleCondition[]): RuleCondition[] {
  return conditions.map((condition) => ({ ...condition }));
}

function cloneGroups(groups: RuleConditionGroup[]): RuleConditionGroup[] {
  return groups.map((group) => ({
    ...group,
    conditions: cloneConditions(group.conditions),
  }));
}

/** Converts legacy flat rules to grouped format. Idempotent for grouped rules. */
export function migrateAutomationRule(rule: unknown): EditableAutomationRule | null {
  if (!rule || typeof rule !== "object") return null;

  const legacy = rule as LegacyRule;
  if (typeof legacy.id !== "string" || typeof legacy.name !== "string") {
    return null;
  }

  const base = legacy as EditableAutomationRule;

  if (
    Array.isArray(base.condition_groups) &&
    base.condition_groups.length > 0 &&
    (base.group_logic === "AND" || base.group_logic === "OR")
  ) {
    return {
      ...base,
      group_logic: base.group_logic,
      condition_groups: cloneGroups(base.condition_groups),
      timing: normalizeRuleTiming(base.timing),
    };
  }

  const flatConditions = Array.isArray(legacy.conditions)
    ? cloneConditions(legacy.conditions)
    : [];

  const groupLogic = legacy.conditionLogic === "OR" ? "OR" : "AND";

  return {
    ...base,
    group_logic: "AND",
    condition_groups: [
      createConditionGroup(
        flatConditions.length > 0 ? flatConditions : [],
        groupLogic,
      ),
    ],
    timing: normalizeRuleTiming(base.timing),
  };
}

export function migrateAutomationRules(
  rules: unknown[],
): EditableAutomationRule[] {
  return rules
    .map((rule) => migrateAutomationRule(rule))
    .filter((rule): rule is EditableAutomationRule => rule !== null);
}

export function normalizeAutomationRule(
  rule: EditableAutomationRule,
): EditableAutomationRule {
  return migrateAutomationRule(rule) ?? rule;
}
