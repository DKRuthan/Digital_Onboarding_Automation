import type { ActionQueueItem } from "./types";

const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function looksLikeEmail(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && EMAIL_LIKE.test(trimmed);
}

/** Display-only contact email — does not mutate queue items. */
export function displayContactEmail(item: ActionQueueItem): string | null {
  if (item.contact_email?.trim()) {
    return item.contact_email.trim();
  }
  if (item.recipient?.trim() && looksLikeEmail(item.recipient)) {
    return item.recipient.trim();
  }
  return null;
}

export function displayContactEmailLabel(item: ActionQueueItem): string {
  return displayContactEmail(item) ?? "Contact email not resolved";
}

/** Display-only role from existing row fields. */
export function displayContactRole(item: ActionQueueItem): string | null {
  return item.recipient_type ?? null;
}

/**
 * Internal routing target when it differs from the visible contact email
 * (e.g. CSM name for internal alerts).
 */
export function displayDeliveryTarget(item: ActionQueueItem): string | null {
  const recipient = item.recipient?.trim();
  if (!recipient) return null;

  const contact = displayContactEmail(item);
  if (contact && recipient.toLowerCase() === contact.toLowerCase()) {
    return null;
  }

  return recipient;
}

export function isSequenceRow(item: ActionQueueItem): boolean {
  return item.source === "sequence_enrollment";
}

export function triggerSequenceLabel(item: ActionQueueItem): string {
  if (isSequenceRow(item)) {
    return item.sequence_name ?? item.issue;
  }
  return item.issue;
}

export function stepLabel(item: ActionQueueItem): string {
  if (isSequenceRow(item) && item.sequence_step_number != null) {
    const name = item.sequence_step_name ?? "Step";
    return `Step ${item.sequence_step_number}: ${name}`;
  }
  if (!isSequenceRow(item)) {
    return "One-off action";
  }
  return "—";
}
