import type { SequenceEnrollment } from "./email-sequence-types";
import { normalizeCompletedSteps } from "./email-sequence-progression";

export const SEQUENCE_ENROLLMENTS_STORAGE_KEY =
  "onboarding-control-sequence-enrollments";

function isStoredEnrollmentShape(
  value: unknown,
): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const enrollment = value as Record<string, unknown>;
  return (
    typeof enrollment.id === "string" &&
    typeof enrollment.contact_email === "string" &&
    typeof enrollment.sequence_key === "string"
  );
}

function normalizeStoredEnrollment(
  enrollment: SequenceEnrollment,
): SequenceEnrollment {
  return {
    ...enrollment,
    contact_email: enrollment.contact_email.trim(),
    sequence_key: enrollment.sequence_key.trim(),
    completed_steps: normalizeCompletedSteps(enrollment.completed_steps),
    exit_reason: enrollment.exit_reason ?? null,
    account_context: { ...enrollment.account_context },
  };
}

export function loadStoredSequenceEnrollments(): SequenceEnrollment[] | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(SEQUENCE_ENROLLMENTS_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    if (parsed.length === 0) return [];
    if (!parsed.every(isStoredEnrollmentShape)) return null;

    return (parsed as unknown as SequenceEnrollment[]).map(
      normalizeStoredEnrollment,
    );
  } catch {
    return null;
  }
}

export function saveStoredSequenceEnrollments(
  enrollments: SequenceEnrollment[],
): void {
  if (typeof window === "undefined") return;

  try {
    const normalized = enrollments.map(normalizeStoredEnrollment);
    window.localStorage.setItem(
      SEQUENCE_ENROLLMENTS_STORAGE_KEY,
      JSON.stringify(normalized),
    );
  } catch {
    // Ignore quota / private mode errors in demo MVP.
  }
}

export function clearStoredSequenceEnrollments(): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(SEQUENCE_ENROLLMENTS_STORAGE_KEY);
  } catch {
    // Ignore storage errors in demo MVP.
  }
}
