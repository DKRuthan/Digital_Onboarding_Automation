import { displayContactEmail, looksLikeEmail } from "@/lib/action-queue-display";
import type { ActionQueueItem, Customer, SendLog } from "@/lib/types";

export const SIMULATED_LOG_STATUS = "Simulated Sent" as const;
export const SIMULATED_LOG_SEND_MODE = "logged_only" as const;
export const SIMULATED_LOG_DELIVERY_STATUS = "Not Sent";
export const SIMULATED_LOG_PROVIDER = "none";
export const SIMULATED_LOG_CREATED_BY_MODE = "operator_simulation";
export const SIMULATED_LOG_REASON =
  "Simulated log created. No email was sent.";

export type BuildSimulatedLogInput = {
  item: ActionQueueItem;
  customer: Customer;
  subject: string;
  templateId?: string;
  triggerName?: string;
};

export function buildSimulatedLogIdempotencyKey(input: {
  action_queue_item_id: string;
  template_id?: string;
  template_key?: string;
  recipient_email: string;
  send_mode?: string;
}): string {
  const templatePart =
    input.template_id?.trim() || input.template_key?.trim() || "";
  const recipient = input.recipient_email.trim().toLowerCase();
  const mode = input.send_mode?.trim() || SIMULATED_LOG_SEND_MODE;
  return `${input.action_queue_item_id}|${templatePart}|${recipient}|${mode}`;
}

export function simulatedLogIdempotencyKeyFromLog(log: SendLog): string | null {
  if (!log.action_queue_item_id?.trim()) return null;
  const recipient =
    log.contact_email?.trim() ||
    (log.recipient?.trim() && looksLikeEmail(log.recipient)
      ? log.recipient.trim()
      : "");
  if (!recipient) return null;
  return buildSimulatedLogIdempotencyKey({
    action_queue_item_id: log.action_queue_item_id,
    template_id: log.template_id,
    template_key: log.template,
    recipient_email: recipient,
    send_mode: log.send_mode || SIMULATED_LOG_SEND_MODE,
  });
}

export function isSimulatedCommunicationLog(log: SendLog): boolean {
  return (
    log.status === SIMULATED_LOG_STATUS ||
    log.send_mode === SIMULATED_LOG_SEND_MODE
  );
}

export function isDuplicateSimulatedLog(
  existingLogs: SendLog[],
  candidate: SendLog,
): boolean {
  const candidateKey =
    candidate.idempotency_key?.trim() ||
    simulatedLogIdempotencyKeyFromLog(candidate);
  if (!candidateKey) return false;

  return existingLogs.some((log) => {
    if (!isSimulatedCommunicationLog(log)) return false;
    const existingKey =
      log.idempotency_key?.trim() || simulatedLogIdempotencyKeyFromLog(log);
    return existingKey === candidateKey;
  });
}

export function buildSimulatedCommunicationLog(
  input: BuildSimulatedLogInput,
): SendLog {
  const contactEmail = displayContactEmail(input.item);
  const recipientEmail = contactEmail ?? input.item.recipient.trim();
  const idempotency_key = buildSimulatedLogIdempotencyKey({
    action_queue_item_id: input.item.id,
    template_id: input.templateId,
    template_key: input.item.template,
    recipient_email: recipientEmail,
  });

  return {
    id: `LOG-SIM-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    date: new Date().toISOString(),
    customer_name: input.item.customer_name,
    customer_id: input.item.customer_id,
    issue: input.item.issue,
    action: input.item.recommended_action,
    recipient: recipientEmail,
    template: input.item.template,
    status: SIMULATED_LOG_STATUS,
    note: SIMULATED_LOG_REASON,
    error: "",
    send_mode: SIMULATED_LOG_SEND_MODE,
    enrollment_id: input.item.enrollment_id,
    contact_email: contactEmail ?? undefined,
    contact_role: input.item.recipient_type,
    recipient_type: input.item.recipient_type,
    account_owner: input.item.owner,
    source_type: input.item.source,
    trigger_id: input.item.rule_id,
    trigger_name: input.triggerName,
    sequence_key: input.item.sequence_key,
    sequence_name: input.item.sequence_name,
    sequence_step_id: input.item.sequence_step_id,
    sequence_step_number: input.item.sequence_step_number,
    sequence_step_name: input.item.sequence_step_name,
    template_id: input.templateId,
    subject: input.subject,
    delivery_status: SIMULATED_LOG_DELIVERY_STATUS,
    provider: SIMULATED_LOG_PROVIDER,
    provider_message_id: undefined,
    action_queue_item_id: input.item.id,
    workflow_status_at_send: input.item.workflow_status,
    created_by_mode: SIMULATED_LOG_CREATED_BY_MODE,
    reason: SIMULATED_LOG_REASON,
    idempotency_key,
    conflict_status: input.item.conflict_status,
    conflict_reason: input.item.conflict_reason ?? undefined,
  };
}
