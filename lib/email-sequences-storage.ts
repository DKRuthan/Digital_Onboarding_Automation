import type { EditableEmailSequence } from "./email-sequence-definitions";
import {
  cloneDefaultEmailSequences,
  cloneEmailSequence,
  EMAIL_SEQUENCES_STORAGE_KEY,
  normalizeSequenceKey,
} from "./email-sequence-definitions";

export { EMAIL_SEQUENCES_STORAGE_KEY };

export function cloneDefaultEmailSequencesFromStorage(): EditableEmailSequence[] {
  return cloneDefaultEmailSequences();
}

function isStoredSequenceShape(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const sequence = value as Record<string, unknown>;
  return (
    typeof sequence.id === "string" &&
    typeof sequence.key === "string" &&
    typeof sequence.name === "string"
  );
}

function normalizeStoredSequence(
  sequence: EditableEmailSequence,
): EditableEmailSequence {
  return {
    ...sequence,
    key: normalizeSequenceKey(sequence.key) || sequence.key,
    steps: Array.isArray(sequence.steps)
      ? sequence.steps.map((step) => ({ ...step }))
      : [],
    cooling_policy: {
      global_cooldown_days: sequence.cooling_policy?.global_cooldown_days ?? 7,
      same_template_cooldown_days:
        sequence.cooling_policy?.same_template_cooldown_days ?? 14,
      max_emails_per_contact_30_days:
        sequence.cooling_policy?.max_emails_per_contact_30_days ?? 5,
      max_emails_per_account_7_days:
        sequence.cooling_policy?.max_emails_per_account_7_days,
      max_emails_per_account_30_days:
        sequence.cooling_policy?.max_emails_per_account_30_days,
      max_contacts_per_account_per_period:
        sequence.cooling_policy?.max_contacts_per_account_per_period,
      internal_alerts_bypass_contact_cooldown:
        sequence.cooling_policy?.internal_alerts_bypass_contact_cooldown ??
        true,
    },
  };
}

export function loadStoredEmailSequences(): EditableEmailSequence[] | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(EMAIL_SEQUENCES_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    if (!parsed.every(isStoredSequenceShape)) return null;

    return (parsed as unknown as EditableEmailSequence[]).map(
      normalizeStoredSequence,
    );
  } catch {
    return null;
  }
}

export function saveStoredEmailSequences(
  sequences: EditableEmailSequence[],
): void {
  if (typeof window === "undefined") return;

  try {
    const normalized = sequences.map(normalizeStoredSequence);
    window.localStorage.setItem(
      EMAIL_SEQUENCES_STORAGE_KEY,
      JSON.stringify(normalized),
    );
  } catch {
    // Ignore quota / private mode errors in demo MVP.
  }
}

export function clearStoredEmailSequences(): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(EMAIL_SEQUENCES_STORAGE_KEY);
  } catch {
    // Ignore storage errors in demo MVP.
  }
}

export function normalizeEmailSequence(
  sequence: EditableEmailSequence,
): EditableEmailSequence {
  return normalizeStoredSequence(cloneEmailSequence(sequence));
}
