"use client";

import { useState } from "react";
import { useCan } from "@/components/auth/permissions-provider";
import type { EditableEmailSequence } from "@/lib/email-sequence-definitions";
import {
  SEQUENCE_AUDIENCES,
  SEQUENCE_CATEGORIES,
  cloneEmailSequence,
  countActiveSteps,
  createEmptyEmailSequence,
  formatCoolingPolicySummary,
} from "@/lib/email-sequence-definitions";
import { isoToDateInputValue } from "@/lib/email-sequence-enrollment";
import type { SequenceEnrollment } from "@/lib/email-sequence-types";
import { useCustomerData } from "@/components/providers/customer-data-provider";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  exportEmailSequencesJson,
  exportSequenceEnrollmentsJson,
} from "@/lib/session-export";
import { formatDateTime } from "@/lib/utils";
import { SequenceEditModal } from "./sequence-edit-modal";
import { SequenceEnrollModal } from "./sequence-enroll-modal";
import { SequenceEnrollmentsPanel } from "./sequence-enrollments-panel";
import { SequenceEnrollmentDetailsModal } from "./sequence-enrollment-details-modal";
import {
  SequencePreviewModal,
  type SequencePreviewInitialContext,
} from "./sequence-preview-modal";
import { getSequenceTemplateWarnings } from "@/lib/email-sequence-templates";
import { gateByPermission } from "@/lib/auth/permission-ui";
import { recordClientAuditEvent } from "@/lib/audit/client-audit";

type SequencesTab = "library" | "enrollments";

function statusVariant(status: EditableEmailSequence["status"]) {
  switch (status) {
    case "approved":
      return "success" as const;
    case "archived":
      return "muted" as const;
    default:
      return "warning" as const;
  }
}

export function SequencesPageContent() {
  const {
    emailSequences,
    emailTemplates,
    customers,
    sendLogs,
    sequenceEnrollments,
    saveEmailSequence,
    duplicateEmailSequenceById,
    approveEmailSequenceById,
    archiveEmailSequenceById,
    resetEmailSequencesToDefaults,
    createEnrollment,
    pauseEnrollment,
    resumeEnrollment,
    cancelEnrollment,
    exitEnrollment,
    resetEnrollments,
    completeEnrollmentStep,
    skipEnrollmentStep,
    completeEnrollment,
  } = useCustomerData();

  const [activeTab, setActiveTab] = useState<SequencesTab>("library");
  const [detailsEnrollment, setDetailsEnrollment] =
    useState<SequenceEnrollment | null>(null);
  const [editSequence, setEditSequence] =
    useState<EditableEmailSequence | null>(null);
  const [previewSequence, setPreviewSequence] =
    useState<EditableEmailSequence | null>(null);
  const [previewContext, setPreviewContext] =
    useState<SequencePreviewInitialContext | null>(null);
  const [enrollSequence, setEnrollSequence] =
    useState<EditableEmailSequence | null>(null);
  const [creating, setCreating] = useState(false);

  const approvedCount = emailSequences.filter(
    (entry) => entry.status === "approved",
  ).length;
  const canManage = useCan("manage_sequences");
  const canExport = useCan("export_reports");
  const manageGate = gateByPermission(canManage, "manage_sequences");
  const exportGate = gateByPermission(canExport, "export_reports");

  function handleResetToDefaults() {
    if (
      window.confirm(
        "Reset all sequences to the default 4 demo sequences? This clears locally saved sequence changes in this browser.",
      )
    ) {
      resetEmailSequencesToDefaults();
      recordClientAuditEvent({
        action: "sequence.reset_defaults",
        targetType: "email_sequence",
      });
    }
  }

  function handleCreate() {
    setCreating(true);
    setEditSequence(createEmptyEmailSequence());
  }

  function openPreview(sequence: EditableEmailSequence) {
    setPreviewContext(null);
    setPreviewSequence(sequence);
  }

  function handlePreviewEnrollment(enrollment: SequenceEnrollment) {
    const sequence = emailSequences.find(
      (entry) => entry.key === enrollment.sequence_key,
    );
    if (!sequence) return;
    setPreviewContext({
      customerId: enrollment.account_id,
      previewRole: enrollment.contact_role,
      startDate: isoToDateInputValue(enrollment.enrolled_at),
    });
    setPreviewSequence(sequence);
  }

  function handleEnrollmentConfirmed(params: {
    customerId: string;
    contactRole: SequenceEnrollment["contact_role"];
  }) {
    if (!enrollSequence) {
      return { ok: false as const, error: "Sequence not found." };
    }
    const result = createEnrollment({
      customerId: params.customerId,
      sequenceKey: enrollSequence.key,
      contactRole: params.contactRole,
    });
    if (result.ok) {
      setActiveTab("enrollments");
      recordClientAuditEvent({
        action: "enrollment.create",
        targetType: "sequence_enrollment",
        targetId: enrollSequence.key,
        metadata: {
          sequence_name: enrollSequence.name,
          contact_role: params.contactRole,
        },
      });
    }
    return result.ok
      ? { ok: true as const }
      : { ok: false as const, error: result.error };
  }

  function handleMarkStepComplete(enrollmentId: string) {
    const message =
      "Mark the current step complete? This is manual demo progression only — no email is sent automatically.";
    if (!window.confirm(message)) return;
    const result = completeEnrollmentStep(enrollmentId);
    if (result.ok) {
      recordClientAuditEvent({
        action: "enrollment.step_complete",
        targetType: "sequence_enrollment",
        targetId: enrollmentId,
      });
    }
    if (!result.ok) {
      window.alert(result.error);
    }
  }

  function handleSkipStep(enrollmentId: string) {
    const reason = window.prompt("Skip reason (optional):") ?? undefined;
    if (reason === null) return;
    const result = skipEnrollmentStep(enrollmentId, reason || undefined);
    if (result.ok) {
      recordClientAuditEvent({
        action: "enrollment.step_skip",
        targetType: "sequence_enrollment",
        targetId: enrollmentId,
      });
    }
    if (!result.ok) {
      window.alert(result.error);
    }
  }

  function handleApproveSequence(sequenceId: string) {
    const result = approveEmailSequenceById(sequenceId);
    if (result.ok) {
      recordClientAuditEvent({
        action: "sequence.edit",
        targetType: "email_sequence",
        targetId: sequenceId,
        metadata: { status_change: "approved" },
      });
    }
    if (!result.ok) {
      window.alert(
        `Cannot approve this sequence:\n\n${result.errors.map((err) => `• ${err}`).join("\n")}`,
      );
    }
  }

  function handleCompleteEnrollment(enrollmentId: string) {
    if (
      !window.confirm(
        "Complete this enrollment now? Remaining steps will not run.",
      )
    ) {
      return;
    }
    const result = completeEnrollment(enrollmentId);
    if (!result.ok) {
      window.alert(result.error);
    }
  }

  function handleExportSequencesJson() {
    exportEmailSequencesJson(emailSequences);
    recordClientAuditEvent({
      action: "export.sequences_json",
      targetType: "email_sequence",
      metadata: { sequence_count: emailSequences.length },
    });
  }

  function handleDuplicateSequence(sequenceId: string, sequenceKey: string) {
    duplicateEmailSequenceById(sequenceId);
    recordClientAuditEvent({
      action: "sequence.duplicate",
      targetType: "email_sequence",
      targetId: sequenceId,
      metadata: { sequence_name: sequenceKey },
    });
  }

  function handlePauseEnrollment(enrollmentId: string) {
    pauseEnrollment(enrollmentId);
    recordClientAuditEvent({
      action: "enrollment.pause",
      targetType: "sequence_enrollment",
      targetId: enrollmentId,
    });
  }

  function handleResumeEnrollment(enrollmentId: string) {
    resumeEnrollment(enrollmentId);
    recordClientAuditEvent({
      action: "enrollment.resume",
      targetType: "sequence_enrollment",
      targetId: enrollmentId,
    });
  }

  function handleCancelEnrollment(enrollmentId: string) {
    cancelEnrollment(enrollmentId);
    recordClientAuditEvent({
      action: "enrollment.cancel",
      targetType: "sequence_enrollment",
      targetId: enrollmentId,
    });
  }

  return (
    <>
      <PageHeader
        title="Email Sequences"
        description="Enroll contacts to create an Action Queue item for the current step. Review and approve each email before sending it from a connected sender."
      />

      <div className="border-b border-slate-200 bg-white px-6 lg:px-8">
        <div className="flex gap-1">
          <button
            type="button"
            className={`border-b-2 px-4 py-3 text-sm font-medium ${
              activeTab === "library"
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
            onClick={() => setActiveTab("library")}
          >
            Sequence Library
          </button>
          <button
            type="button"
            className={`border-b-2 px-4 py-3 text-sm font-medium ${
              activeTab === "enrollments"
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
            onClick={() => setActiveTab("enrollments")}
          >
            Enrollments
            {sequenceEnrollments.length > 0 && (
              <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {sequenceEnrollments.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {activeTab === "library" ? (
        <>
          <div className="flex flex-col gap-3 border-b border-slate-200 bg-white px-6 py-3 sm:flex-row sm:items-center sm:justify-between lg:px-8">
            <p className="text-sm text-slate-600">
              {approvedCount} of {emailSequences.length} sequences approved ·
              Enrollments are tied to contact emails · Active enrollments add
              reviewable Action Queue rows · Nothing sends automatically.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={exportGate.disabled}
                title={exportGate.title}
                onClick={handleExportSequencesJson}
              >
                Export JSON
              </Button>
              <Button
                variant="outline"
                disabled={manageGate.disabled}
                title={manageGate.title}
                onClick={handleResetToDefaults}
              >
                Reset to Defaults
              </Button>
              <Button
                variant="primary"
                disabled={manageGate.disabled}
                title={manageGate.title}
                onClick={handleCreate}
              >
                Create Sequence
              </Button>
            </div>
          </div>

          <div className="grid gap-4 p-6 sm:grid-cols-2 xl:grid-cols-3 lg:p-8">
            {emailSequences.map((sequence) => {
              const categoryLabel =
                SEQUENCE_CATEGORIES.find(
                  (entry) => entry.value === sequence.category,
                )?.label ?? sequence.category;
              const audienceLabel =
                SEQUENCE_AUDIENCES.find(
                  (entry) => entry.value === sequence.audience,
                )?.label ?? sequence.audience;
              const templateWarnings = getSequenceTemplateWarnings(
                sequence,
                emailTemplates,
              );

              return (
                <Card
                  key={sequence.id}
                  className={sequence.status === "archived" ? "opacity-75" : ""}
                >
                  <CardContent className="flex flex-col gap-4 pt-5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h2 className="text-lg font-semibold text-slate-900">
                          {sequence.name}
                        </h2>
                        <p className="mt-1 text-sm text-slate-500">
                          {sequence.description || "No description"}
                        </p>
                      </div>
                      <Badge variant={statusVariant(sequence.status)}>
                        {sequence.status}
                      </Badge>
                    </div>

                    <dl className="grid grid-cols-2 gap-2 text-xs text-slate-500">
                      <div>
                        <dt className="font-medium text-slate-400">Key</dt>
                        <dd>
                          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
                            {sequence.key}
                          </code>
                        </dd>
                      </div>
                      <div>
                        <dt className="font-medium text-slate-400">
                          Category
                        </dt>
                        <dd className="text-slate-700">{categoryLabel}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-slate-400">
                          Audience
                        </dt>
                        <dd className="text-slate-700">{audienceLabel}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-slate-400">
                          Active steps
                        </dt>
                        <dd className="text-slate-700">
                          {countActiveSteps(sequence)} of {sequence.steps.length}
                        </dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="font-medium text-slate-400">
                          Cooling policy
                        </dt>
                        <dd className="text-slate-700">
                          {formatCoolingPolicySummary(sequence.cooling_policy)}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-medium text-slate-400">
                          Last updated
                        </dt>
                        <dd className="text-slate-700">
                          {formatDateTime(sequence.updated_at)}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-medium text-slate-400">Version</dt>
                        <dd className="text-slate-700">v{sequence.version}</dd>
                      </div>
                      {sequence.latest_change_note && (
                        <div className="col-span-2">
                          <dt className="font-medium text-slate-400">
                            Latest change note
                          </dt>
                          <dd className="text-slate-700">
                            {sequence.latest_change_note}
                          </dd>
                        </div>
                      )}
                    </dl>

                    {templateWarnings.length > 0 && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        <p className="font-medium">Template warnings</p>
                        <ul className="mt-1 list-disc pl-4">
                          {templateWarnings.slice(0, 2).map((warning) => (
                            <li key={warning}>{warning}</li>
                          ))}
                          {templateWarnings.length > 2 && (
                            <li>+ {templateWarnings.length - 2} more</li>
                          )}
                        </ul>
                      </div>
                    )}

                    <div className="mt-auto flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                      <Button
                        variant="outline"
                        disabled={manageGate.disabled}
                        title={manageGate.title}
                        onClick={() => {
                          setCreating(false);
                          setEditSequence(cloneEmailSequence(sequence));
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        disabled={manageGate.disabled}
                        title={manageGate.title}
                        onClick={() => handleDuplicateSequence(sequence.id, sequence.key)}
                      >
                        Duplicate
                      </Button>
                      {sequence.status !== "approved" && (
                        <Button
                          variant="outline"
                          disabled={manageGate.disabled}
                          title={manageGate.title}
                          onClick={() => handleApproveSequence(sequence.id)}
                        >
                          Approve
                        </Button>
                      )}
                      {sequence.status !== "archived" && (
                        <Button
                          variant="outline"
                          disabled={manageGate.disabled}
                          title={manageGate.title}
                          onClick={() => archiveEmailSequenceById(sequence.id)}
                        >
                          Archive
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        onClick={() => openPreview(sequence)}
                      >
                        Preview
                      </Button>
                      {sequence.status === "approved" && (
                        <Button
                          variant="primary"
                          disabled={manageGate.disabled}
                          title={manageGate.title}
                          onClick={() => setEnrollSequence(sequence)}
                        >
                          Enroll Contact
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      ) : (
        <SequenceEnrollmentsPanel
          enrollments={sequenceEnrollments}
          emailSequences={emailSequences}
          onPause={handlePauseEnrollment}
          onResume={handleResumeEnrollment}
          onCancel={handleCancelEnrollment}
          onExit={exitEnrollment}
          onPreview={handlePreviewEnrollment}
          onDetails={setDetailsEnrollment}
          onMarkStepComplete={handleMarkStepComplete}
          onSkipStep={handleSkipStep}
          onCompleteEnrollment={handleCompleteEnrollment}
          onReset={resetEnrollments}
          onExport={() =>
            exportSequenceEnrollmentsJson(sequenceEnrollments)
          }
          manageGate={manageGate}
          exportGate={exportGate}
        />
      )}

      <SequenceEditModal
        open={editSequence !== null}
        sequence={editSequence}
        allSequences={emailSequences}
        emailTemplates={emailTemplates}
        isNew={creating}
        onClose={() => {
          setEditSequence(null);
          setCreating(false);
        }}
        onSave={(sequence) => {
          saveEmailSequence(sequence);
          recordClientAuditEvent({
            action: creating ? "sequence.create" : "sequence.edit",
            targetType: "email_sequence",
            targetId: sequence.id,
            metadata: { sequence_name: sequence.key },
          });
          setEditSequence(null);
          setCreating(false);
        }}
      />

      <SequenceEnrollModal
        open={enrollSequence !== null}
        sequence={enrollSequence}
        customers={customers}
        enrollments={sequenceEnrollments}
        onClose={() => setEnrollSequence(null)}
        onConfirm={handleEnrollmentConfirmed}
      />

      <SequenceEnrollmentDetailsModal
        open={detailsEnrollment !== null}
        enrollment={detailsEnrollment}
        sequence={
          detailsEnrollment
            ? emailSequences.find(
                (entry) => entry.key === detailsEnrollment.sequence_key,
              ) ?? null
            : null
        }
        onClose={() => setDetailsEnrollment(null)}
      />

      <SequencePreviewModal
        open={previewSequence !== null}
        sequence={previewSequence}
        customers={customers}
        emailTemplates={emailTemplates}
        sendLogs={sendLogs}
        sequenceEnrollments={sequenceEnrollments}
        initialContext={previewContext}
        onClose={() => {
          setPreviewSequence(null);
          setPreviewContext(null);
        }}
      />
    </>
  );
}
