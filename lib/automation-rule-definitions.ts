import type {
  AutomationChannel,
  ConditionLogic,
  ConditionOperator,
  EditableAutomationRule,
  RecipientType,
  RuleCondition,
  RuleConditionField,
  RuleConditionGroup,
} from "./types";
import { DEFAULT_TEMPLATE_KEYS } from "./email-template-definitions";
import {
  createAfterDelayTiming,
  createImmediateTiming,
  createWeeklyTiming,
  normalizeRuleTiming,
} from "./automation-rule-scheduling";

function conditionId() {
  return `cond-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function groupId() {
  return `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function ruleCondition(
  field: RuleConditionField,
  operator: ConditionOperator,
  value: string,
): RuleCondition {
  return { id: conditionId(), field, operator, value };
}

export function createConditionGroup(
  conditions: RuleCondition[],
  logic: ConditionLogic = "AND",
): RuleConditionGroup {
  return {
    id: groupId(),
    logic,
    conditions: conditions.map((condition) => ({ ...condition })),
  };
}

function baseRule(
  partial: Omit<
    EditableAutomationRule,
    "group_logic" | "condition_groups" | "cooldownDays" | "requiresApproval" | "timing"
  > & {
    condition_groups: RuleConditionGroup[];
    group_logic?: ConditionLogic;
    cooldownDays?: number;
    requiresApproval?: boolean;
    timing?: EditableAutomationRule["timing"];
  },
): EditableAutomationRule {
  return {
    group_logic: "AND",
    cooldownDays: 7,
    requiresApproval: true,
    timing: createImmediateTiming(),
    ...partial,
  };
}

function andGroup(conditions: RuleCondition[]): RuleConditionGroup[] {
  return [createConditionGroup(conditions, "AND")];
}

/** Default automation rules — seeded into session state on first load. */
export const DEFAULT_AUTOMATION_RULES: EditableAutomationRule[] = [
  baseRule({
    id: "invite-not-accepted",
    name: "Invite Not Accepted",
    description: "Admin invite still pending after the first week.",
    active: true,
    condition_groups: andGroup([
      ruleCondition("invite_status", "equals", "Pending"),
      ruleCondition("days_since_start", "greater_or_equal", "7"),
    ]),
    recommendedAction: "Send invite reminder email to admin",
    channel: "email",
    recipientType: "Admin",
    template: "invite-reminder",
    priority: 3,
    timing: createAfterDelayTiming(7, "days", "invite_sent_date"),
  }),
  baseRule({
    id: "no-usage",
    name: "No Usage",
    description: "No product usage detected after onboarding start.",
    active: true,
    condition_groups: andGroup([
      ruleCondition("usage_sessions", "equals", "0"),
      ruleCondition("days_since_start", "greater_or_equal", "7"),
    ]),
    recommendedAction: "Send getting-started guide to primary user",
    channel: "email",
    recipientType: "Admin",
    template: "getting-started",
    priority: 2,
    timing: createAfterDelayTiming(7, "days", "days_since_start"),
  }),
  baseRule({
    id: "low-usage",
    name: "Low Usage",
    description: "Usage is below 30% of the account threshold.",
    active: true,
    condition_groups: andGroup([
      ruleCondition("usage_threshold_percent", "less_than", "30"),
    ]),
    recommendedAction: "Send usage tips and best practices email",
    channel: "email",
    recipientType: "Admin",
    template: "usage-tips",
    priority: 4,
    timing: createWeeklyTiming("Wednesday", "10:00"),
  }),
  baseRule({
    id: "seats-underassigned",
    name: "Seats Underassigned",
    description: "Fewer than half of purchased seats are assigned.",
    active: true,
    condition_groups: andGroup([
      ruleCondition("seat_assignment_percent", "less_than", "50"),
    ]),
    recommendedAction: "Send seat assignment reminder to admin",
    channel: "email",
    recipientType: "Admin",
    template: "seat-assignment",
    priority: 5,
    timing: createAfterDelayTiming(3, "days", "days_since_start"),
  }),
  baseRule({
    id: "no-academy",
    name: "No Academy Visit",
    description: "Customer has not visited the academy resource.",
    active: true,
    condition_groups: andGroup([
      ruleCondition("academy_visited", "equals", "No"),
    ]),
    recommendedAction: "Send academy onboarding invite",
    channel: "email",
    recipientType: "Admin",
    template: "academy-invite",
    priority: 6,
    timing: createAfterDelayTiming(5, "days", "days_since_start"),
  }),
  baseRule({
    id: "no-webinar",
    name: "No Webinar Attended",
    description: "Customer has not attended a webinar.",
    active: true,
    condition_groups: andGroup([
      ruleCondition("webinar_attended", "equals", "No"),
    ]),
    recommendedAction: "Send upcoming webinar invitation",
    channel: "email",
    recipientType: "Admin",
    template: "webinar-invite",
    priority: 7,
    timing: createWeeklyTiming("Wednesday", "10:00"),
  }),
  baseRule({
    id: "renewal-risk",
    name: "Renewal Risk",
    description: "Renewal is near and usage is low — escalate to CSM.",
    active: true,
    condition_groups: andGroup([
      ruleCondition("days_to_renewal", "less_or_equal", "90"),
      ruleCondition("usage_threshold_percent", "less_than", "50"),
    ]),
    recommendedAction: "Escalate to CSM for renewal outreach",
    channel: "internal_alert",
    recipientType: "CSM",
    template: "renewal-risk",
    priority: 1,
    timing: createImmediateTiming(),
  }),
];

export const RULE_CONDITION_FIELDS: {
  value: RuleConditionField;
  label: string;
  type: "number" | "enum";
  options?: string[];
}[] = [
  {
    value: "invite_status",
    label: "Invite Status",
    type: "enum",
    options: ["Pending", "Accepted", "Expired"],
  },
  {
    value: "days_since_start",
    label: "Days Since Start",
    type: "number",
  },
  {
    value: "days_to_renewal",
    label: "Days To Renewal",
    type: "number",
  },
  {
    value: "usage_sessions",
    label: "Usage Sessions",
    type: "number",
  },
  {
    value: "usage_threshold_percent",
    label: "Usage Threshold %",
    type: "number",
  },
  {
    value: "seat_assignment_percent",
    label: "Seat Assignment %",
    type: "number",
  },
  {
    value: "academy_visited",
    label: "Academy Visited",
    type: "enum",
    options: ["Yes", "No"],
  },
  {
    value: "webinar_attended",
    label: "Webinar Attended",
    type: "enum",
    options: ["Yes", "No"],
  },
];

export const CONDITION_OPERATORS: {
  value: ConditionOperator;
  label: string;
  forTypes: ("number" | "enum")[];
}[] = [
  { value: "equals", label: "equals", forTypes: ["number", "enum"] },
  { value: "not_equals", label: "does not equal", forTypes: ["enum"] },
  {
    value: "greater_than",
    label: "is greater than",
    forTypes: ["number"],
  },
  {
    value: "greater_or_equal",
    label: "is greater than or equal to",
    forTypes: ["number"],
  },
  { value: "less_than", label: "is less than", forTypes: ["number"] },
  {
    value: "less_or_equal",
    label: "is less than or equal to",
    forTypes: ["number"],
  },
];

export const AUTOMATION_CHANNELS: { value: AutomationChannel; label: string }[] =
  [
    { value: "email", label: "Email" },
    { value: "internal_alert", label: "Internal Alert" },
    { value: "in_app", label: "In-App Task" },
  ];

export const RECIPIENT_TYPES: { value: RecipientType; label: string }[] = [
  { value: "Admin", label: "Admin" },
  { value: "CSM", label: "CSM / Owner" },
  { value: "User", label: "Primary User" },
];

export const KNOWN_TEMPLATES = [...DEFAULT_TEMPLATE_KEYS];

export function generateRuleId(): string {
  return `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function createEmptyCondition(): RuleCondition {
  return {
    id: conditionId(),
    field: "invite_status",
    operator: "equals",
    value: "",
  };
}

export function createEmptyRule(): EditableAutomationRule {
  return baseRule({
    id: generateRuleId(),
    name: "New Trigger",
    description: "",
    active: false,
    condition_groups: andGroup([
      ruleCondition("invite_status", "equals", "Pending"),
    ]),
    recommendedAction: "",
    channel: "email",
    recipientType: "Admin",
    template: "",
    priority: 5,
  });
}

export function cloneAutomationRule(rule: EditableAutomationRule): EditableAutomationRule {
  return {
    ...rule,
    timing: normalizeRuleTiming(rule.timing),
    condition_groups: rule.condition_groups.map((group) => ({
      ...group,
      conditions: group.conditions.map((condition) => ({ ...condition })),
    })),
  };
}
