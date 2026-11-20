import type {
  ActionQueueBase,
  Customer,
  DashboardStats,
  EditableAutomationRule,
} from "./types";
import {
  evaluateRule,
  isAtRiskRule,
  resolveRuleRecipient,
} from "./automation-rule-engine";
import { computeActionSchedule } from "./automation-rule-scheduling";
import { resolveTriggerQueueContactEmail } from "./trigger-queue-contact";

export function getMatchedRules(
  rules: EditableAutomationRule[],
  customer: Customer,
): EditableAutomationRule[] {
  return rules.filter(
    (rule) => rule.active && evaluateRule(rule, customer),
  );
}

export function buildActionQueue(
  customers: Customer[],
  rules: EditableAutomationRule[],
): ActionQueueBase[] {
  const items: ActionQueueBase[] = [];
  const activeRules = rules
    .filter((r) => r.active)
    .sort((a, b) => a.priority - b.priority);

  for (const customer of customers) {
    for (const rule of activeRules) {
      if (!evaluateRule(rule, customer)) continue;

      const schedule = computeActionSchedule(rule, customer);
      const contactEmail = resolveTriggerQueueContactEmail(customer, rule);

      items.push({
        id: `${customer.customer_id}-${rule.id}`,
        customer_id: customer.customer_id,
        customer_name: customer.customer_name,
        issue: rule.name,
        recommended_action: rule.recommendedAction,
        recipient: resolveRuleRecipient(rule, customer),
        template: rule.template,
        automation_status: customer.automation_status,
        rule_id: rule.id,
        recipient_type: rule.recipientType,
        scheduled_for: schedule.scheduled_for,
        schedule_status: schedule.schedule_status,
        timing_type: schedule.timing_type,
        timing_label: schedule.timing_label,
        source: "rule",
        channel: rule.channel,
        template_key: rule.template,
        ...(contactEmail ? { contact_email: contactEmail } : {}),
      });
    }
  }

  return items;
}

export function computeDashboardStats(
  customers: Customer[],
  rules: EditableAutomationRule[],
): DashboardStats {
  const actionQueue = buildActionQueue(customers, rules);
  const atRiskIds = new Set<string>();

  for (const customer of customers) {
    if (
      rules.some(
        (rule) =>
          rule.active && isAtRiskRule(rule) && evaluateRule(rule, customer),
      )
    ) {
      atRiskIds.add(customer.customer_id);
    }
  }

  return {
    totalCustomers: customers.length,
    atRiskCustomers: atRiskIds.size,
    pendingInvites: customers.filter((c) => c.invite_status === "Pending")
      .length,
    lowUsageAccounts: customers.filter((c) => c.usage_threshold_percent < 30)
      .length,
    seatsUnderassigned: customers.filter((c) => c.seat_assignment_percent < 50)
      .length,
    actionsInQueue: actionQueue.length,
  };
}
