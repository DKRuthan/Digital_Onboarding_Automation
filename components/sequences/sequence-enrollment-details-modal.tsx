"use client";

import type { EditableEmailSequence } from "@/lib/email-sequence-definitions";
import {
  formatCompletedStepStatusLabel,
  formatCompletionSourceLabel,
  formatEnrollmentProgressLabel,
} from "@/lib/email-sequence-progression";
import type { SequenceEnrollment } from "@/lib/email-sequence-types";
import { formatPreviewScheduledFor } from "@/lib/email-sequence-preview";
import { formatDateTime } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface SequenceEnrollmentDetailsModalProps {
  open: boolean;
  enrollment: SequenceEnrollment | null;
  sequence: EditableEmailSequence | null;
  onClose: () => void;
}

export function SequenceEnrollmentDetailsModal({
  open,
  enrollment,
  sequence,
  onClose,
}: SequenceEnrollmentDetailsModalProps) {
  if (!enrollment) return null;

  const progressLabel = sequence
    ? formatEnrollmentProgressLabel(enrollment, sequence)
    : `Step ${enrollment.current_step_number}`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Enrollment: ${enrollment.sequence_name}`}
      size="lg"
      footer={
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-4">
        <dl className="grid gap-3 sm:grid-cols-2 text-sm">
          <div>
            <dt className="text-xs font-medium text-slate-400">Customer</dt>
            <dd className="text-slate-700">{enrollment.customer_name}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-400">Contact</dt>
            <dd className="text-slate-700">
              {enrollment.contact_email} ({enrollment.contact_role})
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-400">Progress</dt>
            <dd className="text-slate-700">{progressLabel}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-400">Next step due</dt>
            <dd className="text-slate-700">
              {formatPreviewScheduledFor(enrollment.next_step_due_at)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-400">Status</dt>
            <dd className="text-slate-700">{enrollment.enrollment_status}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-400">
              Completed steps
            </dt>
            <dd className="text-slate-700">{enrollment.completed_steps.length}</dd>
          </div>
        </dl>

        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Step history
          </h3>
          {enrollment.completed_steps.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              No steps completed or skipped yet.
            </p>
          ) : (
            <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                      Step
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                      Status
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                      Completed at
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                      Source
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                      Notes
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {enrollment.completed_steps.map((record) => (
                    <tr key={`${record.step_id}-${record.completed_at}`}>
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900">
                          {record.step_number}. {record.step_name}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={record.status === "skipped" ? "warning" : "success"}>
                          {formatCompletedStepStatusLabel(record.status)}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {formatDateTime(record.completed_at)}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {formatCompletionSourceLabel(record.completion_source)}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {record.notes ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
