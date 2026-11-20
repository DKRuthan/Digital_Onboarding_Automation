import type {
  ActionQueueItem,
  ActionWorkflowStatus,
  Customer,
  EditableAutomationRule,
  RecipientType,
  SendLog,
  WorkflowSummary,
} from "./types";
import type { EditableEmailSequence } from "./email-sequence-definitions";
import { buildSequenceActionQueueItems } from "./email-sequence-queue";
import type { SequenceEnrollment } from "./email-sequence-types";
import { buildActionQueue } from "./automation-rules";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const COMPLETED_SEND_STATUSES: ActionWorkflowStatus[] = [
  "Dry Run Complete",
  "Live Internal Alert Sent",
];

export function isCompletedInternalSendStatus(
  status: ActionWorkflowStatus,
): boolean {
  return COMPLETED_SEND_STATUSES.includes(status);
}

export function getRecipientType(
  ruleId: string,
  rules?: EditableAutomationRule[],
): RecipientType {
  const rule = rules?.find((r) => r.id === ruleId);
  if (rule) return rule.recipientType;
  if (ruleId === "renewal-risk") return "CSM";
  return "Admin";
}

export interface DuplicateRisk {
  blocked: boolean;
  warning: string | null;
}

/** Blocks actions when a customer email was sent in the last 7 days. */
export function checkDuplicateRisk(customer: Customer): DuplicateRisk {
  const hasPriorSend =
    customer.emails_sent_count > 0 || Boolean(customer.last_email_sent_date?.trim());

  let warning: string | null = null;

  if (hasPriorSend) {
    warning = `Prior sends: ${customer.emails_sent_count} email(s). Last "${customer.last_email_sent}" on ${customer.last_email_sent_date || "unknown date"}.`;
  }

  if (customer.last_email_sent_date?.trim()) {
    const lastSent = new Date(customer.last_email_sent_date);
    if (!Number.isNaN(lastSent.getTime())) {
      const elapsed = Date.now() - lastSent.getTime();
      if (elapsed >= 0 && elapsed < SEVEN_DAYS_MS) {
        return {
          blocked: true,
          warning: `Last email sent within 7 days (${customer.last_email_sent_date}). Blocked to prevent duplicate sends. Use Reset Status to override.`,
        };
      }
    }
  }

  return { blocked: false, warning };
}

export function resolveWorkflowStatus(
  actionId: string,
  customer: Customer,
  stored: Record<string, ActionWorkflowStatus>,
): ActionWorkflowStatus {
  if (stored[actionId]) return stored[actionId];
  const { blocked } = checkDuplicateRisk(customer);
  return blocked ? "Blocked" : "Needs Review";
}

export interface SequenceQueueContext {
  sequences: EditableEmailSequence[];
  enrollments: SequenceEnrollment[];
  sendLogs: SendLog[];
}

function enrichQueueItem(
  item: Omit<ActionQueueItem, "owner" | "workflow_status" | "duplicate_warning">,
  customer: Customer,
  workflowStatuses: Record<string, ActionWorkflowStatus>,
): ActionQueueItem {
  const duplicate = checkDuplicateRisk(customer);
  let workflow_status = resolveWorkflowStatus(
    item.id,
    customer,
    workflowStatuses,
  );

  if (
    duplicate.blocked &&
    workflow_status !== "Approved" &&
    workflow_status !== "Skipped" &&
    workflow_status !== "Test Sent" &&
    !isCompletedInternalSendStatus(workflow_status) &&
    workflowStatuses[item.id] !== "Blocked"
  ) {
    const stored = workflowStatuses[item.id];
    if (!stored || stored === "Needs Review" || stored === "Previewed") {
      workflow_status = "Blocked";
    }
  }

  return {
    ...item,
    owner: customer.owner,
    workflow_status,
    duplicate_warning: duplicate.warning,
  };
}

export function buildEnrichedActionQueue(
  customers: Customer[],
  workflowStatuses: Record<string, ActionWorkflowStatus>,
  rules: EditableAutomationRule[],
  sequenceContext?: SequenceQueueContext,
): ActionQueueItem[] {
  const customerMap = new Map(customers.map((c) => [c.customer_id, c]));
  const ruleBase = buildActionQueue(customers, rules);

  const ruleItems = ruleBase.map((item) => {
    const customer = customerMap.get(item.customer_id)!;
    return enrichQueueItem(item, customer, workflowStatuses);
  });

  if (!sequenceContext) {
    return ruleItems;
  }

  const sequenceBase = buildSequenceActionQueueItems({
    ...sequenceContext,
    customers,
  });

  const sequenceItems = sequenceBase.map((item) => {
    const customer = customerMap.get(item.customer_id)!;
    return enrichQueueItem(item, customer, workflowStatuses);
  });

  return [...ruleItems, ...sequenceItems];
}

export function computeWorkflowSummary(
  items: ActionQueueItem[],
): WorkflowSummary {
  return {
    needsReview: items.filter((i) => i.workflow_status === "Needs Review").length,
    testSent: items.filter((i) => i.workflow_status === "Test Sent").length,
    approved: items.filter((i) => i.workflow_status === "Approved").length,
    skipped: items.filter((i) => i.workflow_status === "Skipped").length,
    blocked: items.filter((i) => i.workflow_status === "Blocked").length,
  };
}

export function resetWorkflowStatusForItem(
  itemId: string,
  customer: Customer,
): ActionWorkflowStatus {
  const { blocked } = checkDuplicateRisk(customer);
  return blocked ? "Blocked" : "Needs Review";
}
