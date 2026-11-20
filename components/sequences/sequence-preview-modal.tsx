"use client";

import { useMemo, useState } from "react";
import type { EditableEmailSequence } from "@/lib/email-sequence-definitions";
import type { Customer, EmailTemplate, RecipientType, SendLog } from "@/lib/types";
import type { SequenceEnrollment } from "@/lib/email-sequence-types";
import {
  formatStepTemplateStatusLabel,
  templateStatusVariant,
} from "@/lib/email-sequence-templates";
import {
  audienceToRecipientType,
  buildSequenceContactPreview,
  formatPreviewConflictLabel,
  formatPreviewScheduledFor,
  previewConflictVariant,
  todayDateInputValue,
} from "@/lib/email-sequence-preview";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const PREVIEW_ROLES: RecipientType[] = ["Admin", "User", "CSM"];

export interface SequencePreviewInitialContext {
  customerId: string;
  previewRole: RecipientType;
  startDate: string;
}

interface SequencePreviewModalProps {
  open: boolean;
  sequence: EditableEmailSequence | null;
  customers: Customer[];
  emailTemplates: EmailTemplate[];
  sendLogs: SendLog[];
  sequenceEnrollments?: SequenceEnrollment[];
  initialContext?: SequencePreviewInitialContext | null;
  onClose: () => void;
}

interface SequencePreviewBodyProps {
  sequence: EditableEmailSequence;
  customers: Customer[];
  emailTemplates: EmailTemplate[];
  sendLogs: SendLog[];
  sequenceEnrollments: SequenceEnrollment[];
  initialContext?: SequencePreviewInitialContext | null;
}

function SequencePreviewBody({
  sequence,
  customers,
  emailTemplates,
  sendLogs,
  sequenceEnrollments,
  initialContext,
}: SequencePreviewBodyProps) {
  const [customerId, setCustomerId] = useState(
    () => initialContext?.customerId ?? customers[0]?.customer_id ?? "",
  );
  const [previewRole, setPreviewRole] = useState<RecipientType>(
    () =>
      initialContext?.previewRole ??
      audienceToRecipientType(sequence.audience),
  );
  const [startDate, setStartDate] = useState(
    () => initialContext?.startDate ?? todayDateInputValue(),
  );

  const selectedCustomer = useMemo(
    () =>
      customers.find((entry) => entry.customer_id === customerId) ??
      customers[0] ??
      null,
    [customers, customerId],
  );

  const preview = useMemo(() => {
    if (!selectedCustomer) return null;
    return buildSequenceContactPreview({
      sequence,
      customer: selectedCustomer,
      previewRole,
      startDate,
      emailTemplates,
      sendLogs,
      enrollments: sequenceEnrollments,
    });
  }, [
    sequence,
    selectedCustomer,
    previewRole,
    startDate,
    emailTemplates,
    sendLogs,
    sequenceEnrollments,
  ]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        This is a preview only. It does not create enrollment, Action Queue
        items, or send emails.
      </div>

      {sequence.status !== "approved" && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This sequence is not approved and cannot be used for enrollment.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Demo customer / account
          </span>
          <select
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            value={selectedCustomer?.customer_id ?? ""}
            onChange={(event) => setCustomerId(event.target.value)}
          >
            {customers.map((customer) => (
              <option key={customer.customer_id} value={customer.customer_id}>
                {customer.customer_name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Contact role
          </span>
          <select
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            value={previewRole}
            onChange={(event) =>
              setPreviewRole(event.target.value as RecipientType)
            }
          >
            {PREVIEW_ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Preview start date
          </span>
          <input
            type="date"
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </label>
      </div>

      {preview && (
        <>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
            <div>
              <dt className="text-xs font-medium text-slate-400">Sequence</dt>
              <dd className="font-medium text-slate-900">
                {preview.sequence_name}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-400">
                Customer / account
              </dt>
              <dd className="text-slate-700">{preview.customer_name}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-400">
                Contact role
              </dt>
              <dd className="text-slate-700">{preview.preview_role}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-400">
                Contact email
              </dt>
              <dd className="text-slate-700">
                {preview.contact_email ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-400">
                Sequence key
              </dt>
              <dd>
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
                  {preview.sequence_key}
                </code>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-400">
                Enrollment identity
              </dt>
              <dd>
                {preview.enrollment_identity ? (
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
                    {preview.enrollment_identity}
                  </code>
                ) : (
                  <span className="text-slate-500">—</span>
                )}
              </dd>
            </div>
          </dl>

          {preview.blocked_message && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {preview.blocked_message}
            </div>
          )}

          <p className="text-xs text-slate-500">
            {preview.limited_conflict_note}
          </p>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                    Step
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                    Scheduled for
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                    Channel
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                    Recipient
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                    Contact email
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                    Template
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                    Template status
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                    Conflict status
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                    Requires approval
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {preview.steps.map((step) => (
                  <tr key={`${step.step_number}-${step.step_name}`}>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900">
                        {step.step_number}
                      </div>
                      <div className="text-xs text-slate-500">
                        {step.step_name}
                      </div>
                      <div className="text-xs text-slate-400">
                        {step.delay_label}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {formatPreviewScheduledFor(step.scheduled_for)}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{step.channel}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {step.recipient_type}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {step.contact_email}
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-slate-700">{step.template_name}</div>
                      {step.template_key !== "—" && (
                        <code className="mt-0.5 block rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                          {step.template_key}
                        </code>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={templateStatusVariant(step.template_status)}>
                        {formatStepTemplateStatusLabel(step.template_status)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        variant={previewConflictVariant(step.conflict_status)}
                      >
                        {formatPreviewConflictLabel(step.conflict_status)}
                      </Badge>
                      {step.conflict_reason && (
                        <p className="mt-1 text-xs text-slate-500">
                          {step.conflict_reason}
                        </p>
                      )}
                      {step.next_eligible_at && (
                        <p className="mt-0.5 text-xs text-slate-400">
                          Next eligible:{" "}
                          {formatPreviewScheduledFor(step.next_eligible_at)}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        variant={step.requires_approval ? "warning" : "muted"}
                      >
                        {step.requires_approval ? "Required" : "Optional"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {customers.length === 0 && (
        <p className="text-sm text-slate-600">
          No demo customers available for contact preview.
        </p>
      )}
    </div>
  );
}

export function SequencePreviewModal({
  open,
  sequence,
  customers,
  emailTemplates,
  sendLogs,
  sequenceEnrollments = [],
  initialContext = null,
  onClose,
}: SequencePreviewModalProps) {
  if (!sequence) return null;

  const bodyKey = initialContext
    ? `${sequence.id}-${initialContext.customerId}-${initialContext.previewRole}`
    : sequence.id;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Preview: ${sequence.name}`}
      size="xl"
      footer={
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
    >
      {open ? (
        <SequencePreviewBody
          key={bodyKey}
          sequence={sequence}
          customers={customers}
          emailTemplates={emailTemplates}
          sendLogs={sendLogs}
          sequenceEnrollments={sequenceEnrollments}
          initialContext={initialContext}
        />
      ) : null}
    </Modal>
  );
}
