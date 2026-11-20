"use client";

import type { EditableEmailSequence } from "@/lib/email-sequence-definitions";
import {
  formatEnrollmentProgressLabel,
} from "@/lib/email-sequence-progression";
import {
  formatEnrollmentStatusLabel,
  getActiveStepCount,
} from "@/lib/email-sequence-enrollment";
import type { SequenceEnrollment } from "@/lib/email-sequence-types";
import { formatPreviewScheduledFor } from "@/lib/email-sequence-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function enrollmentStatusVariant(
  status: SequenceEnrollment["enrollment_status"],
) {
  switch (status) {
    case "active":
      return "success" as const;
    case "paused":
      return "warning" as const;
    case "completed":
      return "default" as const;
    case "exited":
    case "cancelled":
      return "muted" as const;
    default:
      return "default" as const;
  }
}

interface SequenceEnrollmentsPanelProps {
  enrollments: SequenceEnrollment[];
  emailSequences: EditableEmailSequence[];
  onPause: (enrollmentId: string) => void;
  onResume: (enrollmentId: string) => void;
  onCancel: (enrollmentId: string) => void;
  onExit: (enrollmentId: string) => void;
  onPreview: (enrollment: SequenceEnrollment) => void;
  onDetails: (enrollment: SequenceEnrollment) => void;
  onMarkStepComplete: (enrollmentId: string) => void;
  onSkipStep: (enrollmentId: string) => void;
  onCompleteEnrollment: (enrollmentId: string) => void;
  onReset: () => void;
  onExport: () => void;
  manageGate: { disabled: boolean; title?: string };
  exportGate: { disabled: boolean; title?: string };
}

export function SequenceEnrollmentsPanel({
  enrollments,
  emailSequences,
  onPause,
  onResume,
  onCancel,
  onExit,
  onPreview,
  onDetails,
  onMarkStepComplete,
  onSkipStep,
  onCompleteEnrollment,
  onReset,
  onExport,
  manageGate,
  exportGate,
}: SequenceEnrollmentsPanelProps) {
  const sequenceMap = new Map(
    emailSequences.map((sequence) => [sequence.key, sequence]),
  );

  const sorted = [...enrollments].sort(
    (a, b) =>
      new Date(b.enrolled_at).getTime() - new Date(a.enrolled_at).getTime(),
  );

  function handleReset() {
    if (
      window.confirm(
        "Clear all sequence enrollments in this browser? This cannot be undone.",
      )
    ) {
      onReset();
    }
  }

  return (
    <div className="space-y-4 p-6 lg:p-8">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Enrollments are local demo records only. Step progression is manual —
        mark steps complete or skip after review. No emails send automatically.
        Customer-facing steps can be marked complete for demo only (no send).
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          {enrollments.length} enrollment{enrollments.length === 1 ? "" : "s"}{" "}
          · Identity: contact email + sequence key
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={exportGate.disabled}
            title={exportGate.title}
            onClick={onExport}
          >
            Export Enrollments JSON
          </Button>
          <Button
            variant="outline"
            disabled={manageGate.disabled}
            title={manageGate.title}
            onClick={handleReset}
          >
            Reset Enrollments
          </Button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-slate-600">
          No enrollments yet. Enroll a contact from an approved sequence in the
          Sequence Library tab.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                  Customer
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                  Contact Email
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                  Role
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                  Sequence
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                  Status
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                  Progress
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                  Next Step Due
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                  Done
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((enrollment) => {
                const sequence = sequenceMap.get(enrollment.sequence_key);
                const isActive = enrollment.enrollment_status === "active";
                const isPaused = enrollment.enrollment_status === "paused";
                const isInactive = !isActive && !isPaused;
                const progressLabel = sequence
                  ? formatEnrollmentProgressLabel(enrollment, sequence)
                  : `Step ${enrollment.current_step_number}`;
                const totalSteps = sequence
                  ? getActiveStepCount(sequence)
                  : "—";

                return (
                  <tr
                    key={enrollment.id}
                    className={isInactive ? "bg-slate-50/80" : ""}
                  >
                    <td className="px-3 py-2 text-slate-700">
                      {enrollment.customer_name}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {enrollment.contact_email}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {enrollment.contact_role}
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-slate-700">
                        {enrollment.sequence_name}
                      </div>
                      <code className="mt-0.5 block rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                        {enrollment.sequence_key}
                      </code>
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        variant={enrollmentStatusVariant(
                          enrollment.enrollment_status,
                        )}
                      >
                        {formatEnrollmentStatusLabel(
                          enrollment.enrollment_status,
                        )}
                      </Badge>
                      {enrollment.exit_reason && (
                        <p className="mt-1 text-xs text-slate-500">
                          {enrollment.exit_reason}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      <div>{progressLabel}</div>
                      {typeof totalSteps === "number" && (
                        <div className="text-xs text-slate-400">
                          Step {enrollment.current_step_number} of {totalSteps}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {enrollment.enrollment_status === "completed"
                        ? "—"
                        : formatPreviewScheduledFor(enrollment.next_step_due_at)}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {enrollment.completed_steps.length}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {isActive && (
                          <>
                            <Button
                              variant="outline"
                              className="h-8 px-2 text-xs"
                              disabled={manageGate.disabled}
                              title={manageGate.title}
                              onClick={() => onMarkStepComplete(enrollment.id)}
                            >
                              Mark Step Complete
                            </Button>
                            <Button
                              variant="outline"
                              className="h-8 px-2 text-xs"
                              disabled={manageGate.disabled}
                              title={manageGate.title}
                              onClick={() => onSkipStep(enrollment.id)}
                            >
                              Skip Step
                            </Button>
                            <Button
                              variant="outline"
                              className="h-8 px-2 text-xs"
                              disabled={manageGate.disabled}
                              title={manageGate.title}
                              onClick={() => onCompleteEnrollment(enrollment.id)}
                            >
                              Complete
                            </Button>
                            <Button
                              variant="outline"
                              className="h-8 px-2 text-xs"
                              disabled={manageGate.disabled}
                              title={manageGate.title}
                              onClick={() => onPause(enrollment.id)}
                            >
                              Pause
                            </Button>
                          </>
                        )}
                        {isPaused && (
                          <Button
                            variant="outline"
                            className="h-8 px-2 text-xs"
                            disabled={manageGate.disabled}
                            title={manageGate.title}
                            onClick={() => onResume(enrollment.id)}
                          >
                            Resume
                          </Button>
                        )}
                        {(isActive || isPaused) && (
                          <>
                            <Button
                              variant="outline"
                              className="h-8 px-2 text-xs"
                              disabled={manageGate.disabled}
                              title={manageGate.title}
                              onClick={() => onCancel(enrollment.id)}
                            >
                              Cancel
                            </Button>
                            <Button
                              variant="outline"
                              className="h-8 px-2 text-xs"
                              disabled={manageGate.disabled}
                              title={manageGate.title}
                              onClick={() => onExit(enrollment.id)}
                            >
                              Exit
                            </Button>
                          </>
                        )}
                        <Button
                          variant="secondary"
                          className="h-8 px-2 text-xs"
                          onClick={() => onPreview(enrollment)}
                        >
                          Preview
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-8 px-2 text-xs"
                          onClick={() => onDetails(enrollment)}
                        >
                          History
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
