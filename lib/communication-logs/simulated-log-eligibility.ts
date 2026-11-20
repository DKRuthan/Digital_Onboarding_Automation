import { resolveActionEmailPreview } from "@/lib/email-templates";
import { isSequenceCustomerFacingItem } from "@/lib/email-sequence-queue";
import { displayContactEmail } from "@/lib/action-queue-display";
import {
  canSendInternalAction,
  isEligibleInternalRecipient,
} from "@/lib/internal-send";
import type {
  ActionQueueItem,
  Customer,
  EditableAutomationRule,
  EmailTemplate,
} from "@/lib/types";
import { isQueueConflictClear } from "@/lib/types";

export type SimulatedLogEligibilityResult =
  | { eligible: true; item: ActionQueueItem; subject: string; templateId?: string }
  | { eligible: false; item: ActionQueueItem; reason: string };

export type SimulatedLogEligibilityContext = {
  customers: Customer[];
  emailTemplates: EmailTemplate[];
  automationRules: EditableAutomationRule[];
};

function resolveTriggerName(
  item: ActionQueueItem,
  rules: EditableAutomationRule[],
): string | undefined {
  if (item.source === "sequence_enrollment") {
    return item.sequence_name?.trim() || undefined;
  }
  return rules.find((rule) => rule.id === item.rule_id)?.name;
}

function resolveTemplateId(
  item: ActionQueueItem,
  templates: EmailTemplate[],
): string | undefined {
  return templates.find((template) => template.key === item.template)?.id;
}

export function isCustomerFacingQueueItem(
  item: ActionQueueItem,
  customer: Customer,
): boolean {
  if (isSequenceCustomerFacingItem(item)) return true;
  if (isEligibleInternalRecipient(item.recipient, customer)) return false;
  return Boolean(displayContactEmail(item));
}

export function evaluateSimulatedLogEligibility(
  item: ActionQueueItem,
  context: SimulatedLogEligibilityContext,
): SimulatedLogEligibilityResult {
  const customer = context.customers.find(
    (entry) => entry.customer_id === item.customer_id,
  );
  if (!customer) {
    return { eligible: false, item, reason: "Customer not found." };
  }

  if (item.workflow_status !== "Approved") {
    return {
      eligible: false,
      item,
      reason: "Action must be Approved before creating a simulated log.",
    };
  }

  if (item.schedule_status !== "due_now") {
    return {
      eligible: false,
      item,
      reason: "Action is scheduled for later and is not eligible yet.",
    };
  }

  if (!isQueueConflictClear(item.conflict_status)) {
    return {
      eligible: false,
      item,
      reason: "Action has an active conflict block.",
    };
  }

  if (canSendInternalAction(item, customer)) {
    return {
      eligible: false,
      item,
      reason: "Internal alert actions use Send via SendGrid, not simulated logs.",
    };
  }

  if (!isCustomerFacingQueueItem(item, customer)) {
    return {
      eligible: false,
      item,
      reason: "Not a customer-facing communication action.",
    };
  }

  const contactEmail = displayContactEmail(item);
  if (!contactEmail) {
    return {
      eligible: false,
      item,
      reason: "Contact email is not resolved for this action.",
    };
  }

  const preview = resolveActionEmailPreview(
    item,
    customer,
    context.emailTemplates,
  );
  if (!preview.subject?.trim()) {
    return {
      eligible: false,
      item,
      reason: "Template subject could not be resolved.",
    };
  }

  return {
    eligible: true,
    item,
    subject: preview.subject.trim(),
    templateId: resolveTemplateId(item, context.emailTemplates),
  };
}

export function partitionSimulatedLogEligibility(
  items: ActionQueueItem[],
  context: SimulatedLogEligibilityContext,
): {
  eligible: Array<{
    item: ActionQueueItem;
    subject: string;
    templateId?: string;
    triggerName?: string;
  }>;
  blocked: Array<{ item: ActionQueueItem; reason: string }>;
} {
  const eligible: Array<{
    item: ActionQueueItem;
    subject: string;
    templateId?: string;
    triggerName?: string;
  }> = [];
  const blocked: Array<{ item: ActionQueueItem; reason: string }> = [];

  for (const item of items) {
    const result = evaluateSimulatedLogEligibility(item, context);
    if (result.eligible) {
      eligible.push({
        item: result.item,
        subject: result.subject,
        templateId: result.templateId,
        triggerName: resolveTriggerName(result.item, context.automationRules),
      });
    } else {
      blocked.push({ item: result.item, reason: result.reason });
    }
  }

  return { eligible, blocked };
}
