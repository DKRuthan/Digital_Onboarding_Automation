"use client";

import { useEffect, useState } from "react";
import type { ActionQueueItem, Customer } from "@/lib/types";
import { resolveActionEmailPreview } from "@/lib/email-templates";
import {
  isSendTestPayloadComplete,
  requestSendTestEmail,
} from "@/lib/send-test-email-client";
import { formatScheduledForDisplay } from "@/lib/automation-rule-scheduling";
import {
  formatQueueConflictLabel,
  queueConflictVariant,
} from "@/lib/email-sequence-queue";
import { isEligibleInternalRecipient } from "@/lib/internal-send";
import { isQueueConflictClear } from "@/lib/types";
import { isCompletedInternalSendStatus } from "@/lib/action-workflow";
import {
  displayContactEmailLabel,
  displayContactRole,
  displayDeliveryTarget,
  isSequenceRow,
  stepLabel,
  triggerSequenceLabel,
} from "@/lib/action-queue-display";
import { useCustomerData } from "@/components/providers/customer-data-provider";
import { useCan } from "@/components/auth/permissions-provider";
import { gateByPermission } from "@/lib/auth/permission-ui";
import { recordClientAuditEvent } from "@/lib/audit/client-audit";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge, workflowStatusVariant } from "@/components/ui/badge";

interface EmailPreviewModalProps {
  item: ActionQueueItem | null;
  customer: Customer | null;
  open: boolean;
  onClose: () => void;
  onToast: (message: string, variant?: "info" | "success" | "warning") => void;
}

const CHECKLIST_ITEMS = [
  { id: "recipient", label: "Recipient checked" },
  { id: "template", label: "Template checked" },
  { id: "context", label: "Customer context checked" },
  { id: "duplicate", label: "No duplicate send risk checked" },
] as const;

export function EmailPreviewModal({
  item,
  customer,
  open,
  onClose,
  onToast,
}: EmailPreviewModalProps) {
  const { updateWorkflowStatus, emailTemplates } = useCustomerData();
  const canApproveQueue = useCan("approve_queue_actions");
  const canSendTest = useCan("send_test_email");
  const approveGate = gateByPermission(canApproveQueue, "approve_queue_actions");
  const sendTestGate = gateByPermission(canSendTest, "send_test_email");
  const [sending, setSending] = useState(false);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});

  function handleClose() {
    setChecklist({});
    onClose();
  }

  useEffect(() => {
    if (!open || !item) return;
    if (item.workflow_status === "Blocked") return;
    if (
      item.workflow_status === "Previewed" ||
      item.workflow_status === "Test Sent" ||
      item.workflow_status === "Approved" ||
      item.workflow_status === "Skipped" ||
      isCompletedInternalSendStatus(item.workflow_status)
    ) {
      return;
    }
    updateWorkflowStatus([item.id], "Previewed", "Email preview opened");
    recordClientAuditEvent({
      action: "queue.preview_opened",
      targetType: "action_queue_item",
      targetId: item.id,
      metadata: {
        auto_previewed: true,
        previous_status: item.workflow_status,
      },
    });
  }, [open, item, updateWorkflowStatus]);

  if (!item || !customer) return null;

  const isCustomerFacing = !isEligibleInternalRecipient(
    item.recipient,
    customer,
  );
  const isSequenceItem = isSequenceRow(item);
  const contactEmailLabel = displayContactEmailLabel(item);
  const contactRole = displayContactRole(item);
  const deliveryTarget = displayDeliveryTarget(item);
  const allChecked = CHECKLIST_ITEMS.every((c) => checklist[c.id]);
  const isBlocked = item.workflow_status === "Blocked";
  const canApprove =
    canApproveQueue && allChecked && !isBlocked && !sending;

  function toggleCheck(id: string) {
    setChecklist((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const preview = resolveActionEmailPreview(item, customer, emailTemplates);

  async function handleSendTest() {
    const payload = {
      customer_name: item!.customer_name,
      issue: item!.issue,
      recommended_action: item!.recommended_action,
      intended_recipient: item!.recipient,
      template_name: item!.template,
      subject: preview.subject,
      body: preview.body,
    };

    if (!isSendTestPayloadComplete(payload)) {
      onToast("Missing required fields for test send.", "warning");
      return;
    }

    setSending(true);
    recordClientAuditEvent({
      action: "send.test.ui_click",
      targetType: "action_queue_item",
      targetId: item!.id,
      metadata: { template_name: item!.template },
    });
    try {
      const result = await requestSendTestEmail(payload);
      updateWorkflowStatus(
        [item!.id],
        "Test Sent",
        "Test email sent to configured test inbox",
        result.testRecipient,
      );
      onToast("Test email sent to configured test inbox.", "success");
    } catch (error) {
      onToast(
        error instanceof Error ? error.message : "Failed to send test email.",
        "warning",
      );
    } finally {
      setSending(false);
    }
  }

  function handleApprove() {
    if (!item || !canApprove) return;
    updateWorkflowStatus(
      [item.id],
      "Approved",
      "Approved from email preview after checklist completion",
    );
    onToast(`"${item.issue}" approved for ${item.customer_name}.`, "success");
    handleClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Email Preview"
      size="xl"
      footer={
        <>
          <Button
            variant="outline"
            disabled={sendTestGate.disabled || sending}
            title={sendTestGate.title}
            onClick={handleSendTest}
          >
            {sending ? "Sending…" : "Send Test"}
          </Button>
          <Button
            variant="primary"
            disabled={!canApprove}
            title={
              approveGate.title ??
              (!allChecked
                ? "Complete the checklist first"
                : isBlocked
                  ? "Action is blocked"
                  : undefined)
            }
            onClick={handleApprove}
          >
            Approve
          </Button>
          <Button variant="ghost" onClick={handleClose} disabled={sending}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Send Test delivers to the configured test inbox (SENDGRID_TEST_TO_EMAIL)
          only — not to the customer or admin shown below.
        </div>

        {isSequenceItem && (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
            <p className="font-medium">Sequence enrollment step</p>
            <p className="mt-1">
              {triggerSequenceLabel(item)} — {stepLabel(item)}
            </p>
            <p className="mt-1 text-xs">
              Contact: {contactEmailLabel}
              {contactRole ? ` · Role: ${contactRole}` : ""} · Scheduled:{" "}
              {formatScheduledForDisplay(item.scheduled_for)} · Conflict:{" "}
              {formatQueueConflictLabel(item.conflict_status)}
            </p>
          </div>
        )}

        {isCustomerFacing && (
          <div className="rounded-lg border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-800">
            Customer-facing sending is not enabled yet. Send Test only sends to
            the configured test inbox.
          </div>
        )}

        {isSequenceItem && !isQueueConflictClear(item.conflict_status) && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            <p className="font-medium">Conflict block</p>
            <p className="mt-1">{item.conflict_reason}</p>
            {item.next_eligible_at && (
              <p className="mt-1 text-xs">
                Next eligible: {formatScheduledForDisplay(item.next_eligible_at)}
              </p>
            )}
          </div>
        )}

        {item.duplicate_warning && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            <p className="font-medium">Duplicate send warning</p>
            <p className="mt-1">{item.duplicate_warning}</p>
          </div>
        )}

        <div className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
          <MetaField label="Contact Email" value={contactEmailLabel} />
          <MetaField label="Role" value={contactRole ?? "—"} />
          <MetaField
            label="Customer / Account"
            value={`${item.customer_name} (${item.customer_id})`}
          />
          <MetaField
            label="Source"
            value={isSequenceItem ? "Sequence" : "Trigger"}
          />
          <MetaField
            label={isSequenceItem ? "Sequence" : "Trigger / Issue"}
            value={triggerSequenceLabel(item)}
          />
          <MetaField label="Step" value={stepLabel(item)} />
          <MetaField
            label="Recommended Action"
            value={item.recommended_action}
            fullWidth
          />
          {deliveryTarget ? (
            <MetaField label="Delivery Target" value={deliveryTarget} />
          ) : null}
          <MetaField
            label="Template"
            value={
              <code className="rounded bg-white px-2 py-0.5 text-xs text-slate-700">
                {item.template}
              </code>
            }
          />
          <MetaField
            label="Action Status"
            value={
              <Badge variant={workflowStatusVariant(item.workflow_status)}>
                {item.workflow_status}
              </Badge>
            }
          />
          {isSequenceItem && (
            <>
              <MetaField
                label="Conflict Status"
                value={
                  <Badge variant={queueConflictVariant(item.conflict_status)}>
                    {formatQueueConflictLabel(item.conflict_status)}
                  </Badge>
                }
              />
              <MetaField
                label="Scheduled For"
                value={formatScheduledForDisplay(item.scheduled_for)}
              />
            </>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Approval checklist
          </p>
          <ul className="mt-2 space-y-2">
            {CHECKLIST_ITEMS.map((entry) => (
              <li key={entry.id}>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={Boolean(checklist[entry.id])}
                    onChange={() => toggleCheck(entry.id)}
                    className="rounded border-slate-300"
                  />
                  {entry.label}
                </label>
              </li>
            ))}
          </ul>
          {isBlocked && (
            <p className="mt-2 text-sm text-red-700">
              This action is blocked. Reset status before approving.
            </p>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Subject
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900">
            [TEST] {preview.subject.replace(/^\[TEST\]\s*/i, "")}
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Body Preview
          </p>
          <div className="mt-2 rounded-lg border border-slate-200 bg-white p-4">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700">
              {preview.body}
            </pre>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function MetaField({
  label,
  value,
  fullWidth,
}: {
  label: string;
  value: React.ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <div className={fullWidth ? "sm:col-span-2" : undefined}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm text-slate-900">{value}</p>
    </div>
  );
}
