"use client";

import { useMemo, useState } from "react";
import type { EditableEmailSequence } from "@/lib/email-sequence-definitions";
import type { Customer, RecipientType } from "@/lib/types";
import {
  audienceToRecipientType,
  contactEmailIsValid,
} from "@/lib/email-sequence-preview";
import {
  DUPLICATE_ACTIVE_ENROLLMENT_REASON,
  getEnrollmentStepInfo,
  hasActiveOrPausedEnrollment,
} from "@/lib/email-sequence-enrollment";
import { resolveSequenceContacts } from "@/lib/email-sequence-contacts";
import { sequenceEnrollmentId } from "@/lib/email-sequence-types";
import type { SequenceEnrollment } from "@/lib/email-sequence-types";
import { formatPreviewScheduledFor } from "@/lib/email-sequence-preview";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

const PREVIEW_ROLES: RecipientType[] = ["Admin", "User", "CSM"];

interface SequenceEnrollModalProps {
  open: boolean;
  sequence: EditableEmailSequence | null;
  customers: Customer[];
  enrollments: SequenceEnrollment[];
  onClose: () => void;
  onConfirm: (params: {
    customerId: string;
    contactRole: RecipientType;
  }) => { ok: true } | { ok: false; error: string };
}

interface SequenceEnrollBodyProps {
  sequence: EditableEmailSequence;
  customers: Customer[];
  enrollments: SequenceEnrollment[];
  onClose: () => void;
  onConfirm: SequenceEnrollModalProps["onConfirm"];
}

function SequenceEnrollBody({
  sequence,
  customers,
  enrollments,
  onClose,
  onConfirm,
}: SequenceEnrollBodyProps) {
  const [customerId, setCustomerId] = useState(
    () => customers[0]?.customer_id ?? "",
  );
  const [contactRole, setContactRole] = useState<RecipientType>(() =>
    audienceToRecipientType(sequence.audience),
  );
  const [submitError, setSubmitError] = useState<string | null>(null);

  const selectedCustomer = useMemo(
    () =>
      customers.find((entry) => entry.customer_id === customerId) ??
      customers[0] ??
      null,
    [customers, customerId],
  );

  const resolvedContact = useMemo(() => {
    if (!selectedCustomer) return null;
    return resolveSequenceContacts(selectedCustomer, contactRole)[0] ?? null;
  }, [selectedCustomer, contactRole]);

  const enrollmentIdentity = useMemo(() => {
    if (!resolvedContact || !contactEmailIsValid(resolvedContact.contact_email)) {
      return null;
    }
    return sequenceEnrollmentId(resolvedContact.contact_email, sequence.key);
  }, [resolvedContact, sequence.key]);

  const stepInfo = useMemo(
    () => getEnrollmentStepInfo(sequence, new Date()),
    [sequence],
  );

  const duplicateBlocked = useMemo(() => {
    if (!resolvedContact) return false;
    return hasActiveOrPausedEnrollment(
      enrollments,
      resolvedContact.contact_email,
      sequence.key,
    );
  }, [enrollments, resolvedContact, sequence.key]);

  const noContactEmail =
    !resolvedContact || !contactEmailIsValid(resolvedContact.contact_email);

  const confirmDisabled = noContactEmail || duplicateBlocked;

  function handleConfirm() {
    if (!selectedCustomer || confirmDisabled) return;
    setSubmitError(null);
    const result = onConfirm({
      customerId: selectedCustomer.customer_id,
      contactRole,
    });
    if (!result.ok) {
      setSubmitError(result.error);
      return;
    }
    onClose();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Enrolling a contact creates a reviewable step in the Action Queue.
        Sending requires a separate confirmation.
      </div>

      <dl className="grid gap-3 sm:grid-cols-2 text-sm">
        <div>
          <dt className="text-xs font-medium text-slate-400">Sequence</dt>
          <dd className="font-medium text-slate-900">{sequence.name}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-400">Sequence key</dt>
          <dd>
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
              {sequence.key}
            </code>
          </dd>
        </div>
      </dl>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Customer / account
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
            value={contactRole}
            onChange={(event) =>
              setContactRole(event.target.value as RecipientType)
            }
          >
            {PREVIEW_ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2 text-sm">
        <div>
          <dt className="text-xs font-medium text-slate-400">Contact email</dt>
          <dd className="text-slate-700">
            {resolvedContact?.contact_email ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-400">
            Enrollment identity
          </dt>
          <dd>
            {enrollmentIdentity ? (
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
                {enrollmentIdentity}
              </code>
            ) : (
              <span className="text-slate-500">—</span>
            )}
          </dd>
        </div>
        {stepInfo && (
          <>
            <div>
              <dt className="text-xs font-medium text-slate-400">First step</dt>
              <dd className="text-slate-700">
                Step {stepInfo.step_number}: {stepInfo.step_name} (
                {stepInfo.delay_label})
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-400">
                Next step due
              </dt>
              <dd className="text-slate-700">
                {formatPreviewScheduledFor(stepInfo.next_step_due_at)}
              </dd>
            </div>
          </>
        )}
      </dl>

      {noContactEmail && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          No eligible contact email found.
        </div>
      )}

      {duplicateBlocked && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {DUPLICATE_ACTIVE_ENROLLMENT_REASON}
        </div>
      )}

      {submitError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {submitError}
        </div>
      )}

      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={confirmDisabled}
          onClick={handleConfirm}
        >
          Confirm Enrollment
        </Button>
      </div>
    </div>
  );
}

export function SequenceEnrollModal({
  open,
  sequence,
  customers,
  enrollments,
  onClose,
  onConfirm,
}: SequenceEnrollModalProps) {
  if (!sequence) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Enroll Contact: ${sequence.name}`}
      size="lg"
      footer={null}
    >
      {open ? (
        <SequenceEnrollBody
          key={sequence.id}
          sequence={sequence}
          customers={customers}
          enrollments={enrollments}
          onClose={onClose}
          onConfirm={onConfirm}
        />
      ) : null}
    </Modal>
  );
}
