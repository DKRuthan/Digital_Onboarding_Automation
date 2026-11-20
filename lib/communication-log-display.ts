import type { SendLog } from "./types";
import { looksLikeEmail } from "./action-queue-display";

export type CommunicationLogSource =
  | "Sequence"
  | "Trigger"
  | "Test"
  | "Manual"
  | "Internal Alert"
  | "Unknown";

/** Display-only contact email — does not mutate log items. */
export function displayLogContactEmail(log: SendLog): string | null {
  if (log.contact_email?.trim()) {
    return log.contact_email.trim();
  }
  if (log.recipient?.trim() && looksLikeEmail(log.recipient)) {
    return log.recipient.trim();
  }
  return null;
}

export function displayLogContactEmailLabel(log: SendLog): string {
  return displayLogContactEmail(log) ?? "Contact email not resolved";
}

/** Non-email routing target when contact email is unresolved or differs. */
export function displayLogDeliveryTarget(log: SendLog): string | null {
  const recipient = log.recipient?.trim();
  if (!recipient) return null;
  if (looksLikeEmail(recipient)) {
    const contact = displayLogContactEmail(log);
    if (contact && recipient.toLowerCase() === contact.toLowerCase()) {
      return null;
    }
    return null;
  }
  return recipient;
}

export function displayLogRole(log: SendLog): string | null {
  return log.contact_role?.trim() ? log.contact_role.trim() : null;
}

export function isSequenceLog(log: SendLog): boolean {
  return Boolean(
    log.enrollment_id ||
      log.sequence_name?.trim() ||
      log.sequence_step_name?.trim() ||
      log.sequence_key?.trim(),
  );
}

export function displayLogSource(log: SendLog): CommunicationLogSource {
  if (log.status === "Simulated Sent" || log.send_mode === "logged_only") {
    if (isSequenceLog(log)) return "Sequence";
    if (log.issue?.trim() || log.action?.trim()) return "Trigger";
  }
  if (isSequenceLog(log)) return "Sequence";
  if (log.send_mode === "test" || log.status === "Test Sent") return "Test";
  if (
    log.send_mode === "dry_run" ||
    log.send_mode === "live" ||
    log.status === "Live Internal Alert Sent" ||
    log.status === "Dry Run Complete" ||
    log.status === "Internal Send Failed"
  ) {
    return "Internal Alert";
  }
  if (
    log.status === "Previewed" ||
    log.status === "Approved" ||
    log.status === "Skipped"
  ) {
    return "Manual";
  }
  if (log.issue?.trim() || log.action?.trim()) return "Trigger";
  return "Unknown";
}

export function displayLogSequenceStep(log: SendLog): string {
  if (isSequenceLog(log)) {
    const parts: string[] = [];
    if (log.sequence_name?.trim()) parts.push(log.sequence_name.trim());
    if (log.sequence_step_number != null) {
      const stepName = log.sequence_step_name?.trim() || "Step";
      parts.push(`Step ${log.sequence_step_number}: ${stepName}`);
    }
    if (parts.length > 0) return parts.join(" · ");
  }

  if (log.issue?.trim()) {
    return log.action?.trim()
      ? `${log.issue} — ${log.action}`
      : log.issue;
  }
  if (log.action?.trim()) return log.action;

  return "—";
}

export function logMatchesSearch(log: SendLog, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const haystack = [
    log.contact_email,
    log.recipient,
    log.customer_name,
    log.template,
    log.status,
    log.issue,
    log.action,
    log.sequence_name,
    log.note,
    log.subject,
    log.provider,
    log.action_queue_item_id,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(q);
}

export function displayLogRecipientType(log: SendLog): string | null {
  return log.recipient_type?.trim() || displayLogRole(log);
}

export function displayLogDeliveryStatus(log: SendLog): string {
  if (log.delivery_status?.trim()) return log.delivery_status.trim();
  if (log.status === "Simulated Sent" || log.send_mode === "logged_only") {
    return "Not Sent";
  }
  return "—";
}

export function displayLogProvider(log: SendLog): string {
  if (log.provider === "none" || log.status === "Simulated Sent") return "None";
  if (log.provider?.trim()) return log.provider;
  return "—";
}

export function displayLogActionReference(log: SendLog): string {
  if (log.action_queue_item_id?.trim()) {
    return log.action_queue_item_id.trim();
  }
  if (log.sequence_step_id?.trim()) {
    return log.sequence_step_id.trim();
  }
  if (log.sequence_step_number != null && log.sequence_step_name?.trim()) {
    return `Step ${log.sequence_step_number}: ${log.sequence_step_name.trim()}`;
  }
  return "—";
}

export function isActualProviderSendLog(log: SendLog): boolean {
  if (log.provider === "sendgrid") return true;
  if (log.send_mode === "live" && log.status === "Live Internal Alert Sent") {
    return true;
  }
  return false;
}

export function isSimulatedLedgerLog(log: SendLog): boolean {
  return log.status === "Simulated Sent" || log.send_mode === "logged_only";
}
