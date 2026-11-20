import { createEmptyRule, generateRuleId } from "../lib/automation-rule-definitions";
import { cloneDefaultAutomationRules } from "../lib/automation-rules-storage";
import { buildActionQueue } from "../lib/automation-rules";
import { customers as demoCustomers } from "../lib/mock-data";
import {
  DUPLICATE_TRIGGER_NAME_WARNING,
  getDuplicateTriggerNameWarning,
  isRuleIdInUse,
  resolveRuleIdForCreate,
  validateAutomationRule,
  validateRuleIdForSave,
} from "../lib/automation-rule-engine";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

const defaults = cloneDefaultAutomationRules();

const empty = createEmptyRule();
assert(empty.active === false, "createEmptyRule().active must be false");
assert(Boolean(empty.id?.trim()), "createEmptyRule() must assign a non-empty id");
assert(
  empty.condition_groups.length === 1 &&
    empty.condition_groups[0].conditions.some(
      (c) => c.field === "invite_status" && c.value === "Pending",
    ),
  "createEmptyRule() must include invite_status equals Pending starter condition",
);

const idA = generateRuleId();
const idB = generateRuleId();
assert(idA !== idB, "generateRuleId() should produce distinct ids in quick succession");

assert(
  isRuleIdInUse(defaults[0].id, defaults),
  "isRuleIdInUse detects existing default rule id",
);
assert(
  !isRuleIdInUse("rule-does-not-exist", defaults),
  "isRuleIdInUse returns false for unused id",
);

const incompleteErrors = validateAutomationRule(empty, []);
assert(
  incompleteErrors.some((e) => e.includes("Recommended action")),
  "validation fails when recommendedAction is empty",
);
assert(
  incompleteErrors.some((e) => e.includes("Template")),
  "validation fails when template is missing for email channel",
);

const collisionDraft = { ...empty, id: defaults[0].id };
const resolved = resolveRuleIdForCreate(collisionDraft, defaults);
assert(
  resolved.id !== defaults[0].id,
  "resolveRuleIdForCreate regenerates id on collision",
);
assert(
  !isRuleIdInUse(resolved.id, defaults),
  "resolved create id must not collide with existing rules",
);

const createIdErrors = validateRuleIdForSave(
  { ...empty, id: defaults[0].id },
  defaults,
  "create",
);
assert(
  createIdErrors.length > 0,
  "validateRuleIdForSave blocks create when id still collides",
);

const editIdErrors = validateRuleIdForSave(
  defaults[0],
  defaults,
  "edit",
  defaults[0].id,
);
assert(editIdErrors.length === 0, "validateRuleIdForSave allows edit of existing rule");

const nameWarning = getDuplicateTriggerNameWarning(defaults[0], defaults);
assert(
  nameWarning === DUPLICATE_TRIGGER_NAME_WARNING,
  "duplicate name check returns warning for matching name",
);
assert(
  getDuplicateTriggerNameWarning(defaults[0], defaults, defaults[0].id) === null,
  "duplicate name check ignores the rule being edited",
);
assert(
  getDuplicateTriggerNameWarning(
    { ...empty, name: "Unique Smoke Test Name" },
    defaults,
  ) === null,
  "duplicate name check returns null when name is unique",
);

const queueBefore = buildActionQueue(demoCustomers, [...defaults, empty]).length;
const queueWithInactive = buildActionQueue(demoCustomers, [
  ...defaults,
  { ...empty, recommendedAction: "Test", template: "invite-reminder" },
]).length;
assert(
  queueBefore === queueWithInactive,
  "inactive custom trigger must not increase Action Queue row count",
);

console.log("OK: verify-automation-add-trigger-safety passed");
