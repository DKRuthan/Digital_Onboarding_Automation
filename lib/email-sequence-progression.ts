import type { EditableEmailSequence, EditableSequenceStep } from "./email-sequence-definitions";
import { computeStepScheduledFor } from "./email-sequence-preview";
import type {
  CompletedStepRecord,
  CompletedStepStatus,
  SequenceEnrollment,
  StepCompletionSource,
} from "./email-sequence-types";
import { getActiveStepCount, getFirstActiveStep } from "./email-sequence-enrollment";

export type {
  CompletedStepRecord,
  CompletedStepStatus,
  StepCompletionSource,
};

export function isCompletedStepRecord(value: unknown): value is CompletedStepRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.step_id === "string" &&
    typeof record.step_number === "number" &&
    typeof record.step_name === "string" &&
    (record.status === "completed" || record.status === "skipped") &&
    typeof record.completed_at === "string" &&
    typeof record.completion_source === "string"
  );
}

export function normalizeCompletedSteps(value: unknown): CompletedStepRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isCompletedStepRecord).map((record) => ({ ...record }));
}

export function getActiveSteps(sequence: EditableEmailSequence): EditableSequenceStep[] {
  return sequence.steps.filter((step) => step.active);
}

export function getActiveStepAtNumber(
  sequence: EditableEmailSequence,
  stepNumber: number,
): EditableSequenceStep | null {
  const activeSteps = getActiveSteps(sequence);
  return activeSteps[stepNumber - 1] ?? null;
}

export function getCurrentStepForEnrollment(
  enrollment: SequenceEnrollment,
  sequence: EditableEmailSequence,
): EditableSequenceStep | null {
  return getActiveStepAtNumber(sequence, enrollment.current_step_number);
}

export function formatEnrollmentProgressLabel(
  enrollment: SequenceEnrollment,
  sequence: EditableEmailSequence,
): string {
  const total = getActiveStepCount(sequence);
  const currentStep = getCurrentStepForEnrollment(enrollment, sequence);
  const stepName = currentStep?.step_name ?? "Unknown step";
  return `Step ${enrollment.current_step_number} of ${total}: ${stepName}`;
}

export function canProgressEnrollment(
  enrollment: SequenceEnrollment | undefined,
): boolean {
  return enrollment?.enrollment_status === "active";
}

export interface ProgressStepInput {
  status: CompletedStepStatus;
  completion_source: StepCompletionSource;
  notes?: string;
}

export type ProgressEnrollmentResult =
  | { ok: true; enrollment: SequenceEnrollment }
  | { ok: false; error: string };

function validateProgressable(
  enrollment: SequenceEnrollment,
  sequence: EditableEmailSequence | undefined,
): string | null {
  if (!sequence) return "Sequence definition not found.";
  if (enrollment.enrollment_status !== "active") {
    return "Only active enrollments can progress steps.";
  }
  const currentStep = getCurrentStepForEnrollment(enrollment, sequence);
  if (!currentStep) {
    return "Current step is not valid for this sequence.";
  }
  return null;
}

export function progressEnrollmentStep(
  enrollment: SequenceEnrollment,
  sequence: EditableEmailSequence,
  input: ProgressStepInput,
): ProgressEnrollmentResult {
  const validationError = validateProgressable(enrollment, sequence);
  if (validationError) return { ok: false, error: validationError };

  const activeSteps = getActiveSteps(sequence);
  const currentStep = getCurrentStepForEnrollment(enrollment, sequence)!;
  const now = new Date().toISOString();

  const record: CompletedStepRecord = {
    step_id: currentStep.id,
    step_number: enrollment.current_step_number,
    step_name: currentStep.step_name,
    status: input.status,
    completed_at: now,
    completion_source: input.completion_source,
    notes: input.notes?.trim() || undefined,
  };

  const completed_steps = [...enrollment.completed_steps, record];
  const nextStepNumber = enrollment.current_step_number + 1;
  const nextStep = activeSteps[nextStepNumber - 1];

  if (nextStep) {
    const enrolledAt = new Date(enrollment.enrolled_at);
    return {
      ok: true,
      enrollment: {
        ...enrollment,
        completed_steps,
        current_step_number: nextStepNumber,
        next_step_due_at: computeStepScheduledFor(enrolledAt, nextStep).toISOString(),
        enrollment_status: "active",
      },
    };
  }

  return {
    ok: true,
    enrollment: {
      ...enrollment,
      completed_steps,
      enrollment_status: "completed",
      exit_reason: "All sequence steps completed.",
    },
  };
}

export function completeEnrollmentStep(
  enrollment: SequenceEnrollment,
  sequence: EditableEmailSequence,
  options?: {
    completion_source?: StepCompletionSource;
    notes?: string;
  },
): ProgressEnrollmentResult {
  return progressEnrollmentStep(enrollment, sequence, {
    status: "completed",
    completion_source: options?.completion_source ?? "manual",
    notes: options?.notes,
  });
}

export function skipEnrollmentStep(
  enrollment: SequenceEnrollment,
  sequence: EditableEmailSequence,
  reason?: string,
): ProgressEnrollmentResult {
  return progressEnrollmentStep(enrollment, sequence, {
    status: "skipped",
    completion_source: "skipped",
    notes: reason?.trim() || "Step skipped manually.",
  });
}

export function finalizeEnrollmentManually(
  enrollment: SequenceEnrollment,
): ProgressEnrollmentResult {
  if (enrollment.enrollment_status !== "active") {
    return { ok: false, error: "Only active enrollments can be completed." };
  }
  return {
    ok: true,
    enrollment: {
      ...enrollment,
      enrollment_status: "completed",
      exit_reason: "Completed manually by user.",
    },
  };
}

export function moveEnrollmentToStep(
  enrollment: SequenceEnrollment,
  sequence: EditableEmailSequence,
  targetStepNumber: number,
): ProgressEnrollmentResult {
  const validationError = validateProgressable(enrollment, sequence);
  if (validationError) return { ok: false, error: validationError };

  const activeSteps = getActiveSteps(sequence);
  if (targetStepNumber < 1 || targetStepNumber > activeSteps.length) {
    return { ok: false, error: "Target step number is out of range." };
  }
  if (targetStepNumber <= enrollment.current_step_number) {
    return {
      ok: false,
      error: "Can only move forward to a later step.",
    };
  }

  const targetStep = activeSteps[targetStepNumber - 1];
  const enrolledAt = new Date(enrollment.enrolled_at);

  return {
    ok: true,
    enrollment: {
      ...enrollment,
      current_step_number: targetStepNumber,
      next_step_due_at: computeStepScheduledFor(enrolledAt, targetStep).toISOString(),
    },
  };
}

export function formatCompletionSourceLabel(
  source: StepCompletionSource,
): string {
  switch (source) {
    case "manual":
      return "Manual";
    case "internal_dry_run":
      return "Internal dry run";
    case "internal_live_send":
      return "Internal live send";
    case "skipped":
      return "Skipped";
    default:
      return source;
  }
}

export function formatCompletedStepStatusLabel(
  status: CompletedStepStatus,
): string {
  return status === "skipped" ? "Skipped" : "Completed";
}

/** Alias for UI "Move to Next Step" — completes current step and advances. */
export function moveEnrollmentToNextStep(
  enrollment: SequenceEnrollment,
  sequence: EditableEmailSequence,
  notes?: string,
): ProgressEnrollmentResult {
  return completeEnrollmentStep(enrollment, sequence, { notes });
}

export function recalculateEnrollmentDueDate(
  enrollment: SequenceEnrollment,
  sequence: EditableEmailSequence,
): string | null {
  const step = getCurrentStepForEnrollment(enrollment, sequence);
  if (!step) return null;
  return computeStepScheduledFor(new Date(enrollment.enrolled_at), step).toISOString();
}

export { getFirstActiveStep };
