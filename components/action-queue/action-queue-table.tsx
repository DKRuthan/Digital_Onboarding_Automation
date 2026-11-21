"use client";

import { useMemo, useState } from "react";
import type { ActionQueueItem } from "@/lib/types";
import {
  resolveInternalSendEmailContent,
  getInternalSendTemplateError,
} from "@/lib/email-templates";
import {
  buildInternalSendPayload,
  canSendInternalAction,
  isEligibleInternalRecipient,
} from "@/lib/internal-send";
import {
  formatScheduleStatusLabel,
  formatScheduledForDisplay,
} from "@/lib/automation-rule-scheduling";
import {
  formatQueueConflictLabel,
  formatQueueSourceLabel,
  isSequenceCustomerFacingItem,
  queueConflictVariant,
} from "@/lib/email-sequence-queue";
import { isQueueConflictClear } from "@/lib/types";
import { requestInternalSend } from "@/lib/send-approved-internal-client";
import { exportActionQueueCsv } from "@/lib/session-export";
import {
  displayContactEmailLabel,
  displayContactRole,
  displayDeliveryTarget,
  isSequenceRow,
  stepLabel,
  triggerSequenceLabel,
} from "@/lib/action-queue-display";
import { partitionSimulatedLogEligibility } from "@/lib/communication-logs/simulated-log-eligibility";
import { useCustomerData } from "@/components/providers/customer-data-provider";
import { useCan } from "@/components/auth/permissions-provider";
import { gateByPermission, permissionDeniedTitle } from "@/lib/auth/permission-ui";
import { recordClientAuditEvent } from "@/lib/audit/client-audit";
import { WorkflowSummaryCard } from "./workflow-summary-card";
import { InternalSendConfirmModal } from "./internal-send-confirm-modal";
import { Badge, scheduleStatusVariant, workflowStatusVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Toast } from "@/components/ui/toast";
import { reviewCustomerMail } from "@/lib/customer-mail-action";
import { CustomerMailConfirm } from "./customer-mail-confirm";
import { EmailPreviewModal } from "./email-preview-modal";

const ALL = "All";
const SCHEDULE_DUE_NOW = "Due now";
const SCHEDULE_SCHEDULED = "Scheduled";
const SCHEDULE_NOT_DUE = "Not due / Scheduled";
const SOURCE_TRIGGER = "Trigger";
const SOURCE_SEQUENCE = "Sequence";
const CONFLICT_CLEAR = "Clear";
const CONFLICT_BLOCKED = "Blocked";

interface ActionQueueTableProps {
  items: ActionQueueItem[];
}

export function ActionQueueTable({ items }: ActionQueueTableProps) {
  const {
    customers,
    automationRules,
    emailTemplates,
    isCustomerDataHydrated,
    importedContacts,
    dataSource,
    sendLogs,
    workflowSummary,
    updateWorkflowStatus,
    resetWorkflowStatus,
    logInternalSend,
    completeEnrollmentStep,
    skipEnrollmentStep,
    createSimulatedCommunicationLogs,
  } = useCustomerData();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<"info" | "success" | "warning">("info");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [customerMailId, setCustomerMailId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [issueFilter, setIssueFilter] = useState(ALL);
  const [ownerFilter, setOwnerFilter] = useState(ALL);
  const [recipientFilter, setRecipientFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [scheduleFilter, setScheduleFilter] = useState(ALL);
  const [sourceFilter, setSourceFilter] = useState(ALL);
  const [conflictFilter, setConflictFilter] = useState(ALL);

  const canApproveQueue = useCan("approve_queue_actions");
  const canSendInternal = useCan("send_internal_alert");
  const canExport = useCan("export_reports");
  const approveGate = gateByPermission(canApproveQueue, "approve_queue_actions");
  const exportGate = gateByPermission(canExport, "export_reports");

  const customerMap = useMemo(
    () => new Map(customers.map((c) => [c.customer_id, c])),
    [customers],
  );

  const issues = useMemo(
    () => [...new Set(items.map((i) => i.issue))].sort(),
    [items],
  );
  const owners = useMemo(
    () => [...new Set(items.map((i) => i.owner))].sort(),
    [items],
  );
  const recipientTypes = useMemo(
    () => [...new Set(items.map((i) => i.recipient_type))].sort(),
    [items],
  );
  const workflowStatuses = useMemo(
    () => [...new Set(items.map((i) => i.workflow_status))].sort(),
    [items],
  );

  const filtered = items.filter((item) => {
    if (issueFilter !== ALL && item.issue !== issueFilter) return false;
    if (ownerFilter !== ALL && item.owner !== ownerFilter) return false;
    if (recipientFilter !== ALL && item.recipient_type !== recipientFilter)
      return false;
    if (statusFilter !== ALL && item.workflow_status !== statusFilter)
      return false;
    if (sourceFilter === SOURCE_TRIGGER && item.source !== "rule") return false;
    if (
      sourceFilter === SOURCE_SEQUENCE &&
      item.source !== "sequence_enrollment"
    )
      return false;
    if (
      conflictFilter === CONFLICT_CLEAR &&
      !isQueueConflictClear(item.conflict_status)
    )
      return false;
    if (
      conflictFilter === CONFLICT_BLOCKED &&
      isQueueConflictClear(item.conflict_status)
    )
      return false;
    if (scheduleFilter === SCHEDULE_DUE_NOW && item.schedule_status !== "due_now")
      return false;
    if (
      scheduleFilter === SCHEDULE_SCHEDULED &&
      item.schedule_status !== "scheduled"
    )
      return false;
    if (
      scheduleFilter === SCHEDULE_NOT_DUE &&
      item.schedule_status === "due_now"
    )
      return false;
    return true;
  });

  const selectedItems = items.filter((i) => selected.has(i.id));
  const previewItem = selectedItems.length === 1 ? selectedItems[0] : null;
  const previewCustomer = previewItem
    ? customerMap.get(previewItem.customer_id) ?? null
    : null;

  const customerMail = previewItem && previewCustomer
    ? reviewCustomerMail(previewItem, {
        dataSource, customer: previewCustomer, contacts: importedContacts, templates: emailTemplates, logs: sendLogs,
      })
    : null;

  const allSelectedApproved =
    selectedItems.length > 0 &&
    selectedItems.every((i) => i.workflow_status === "Approved");

  const sendableItems = useMemo(
    () =>
      selectedItems.filter((item) => {
        const customer = customerMap.get(item.customer_id);
        return customer && canSendInternalAction(item, customer);
      }),
    [selectedItems, customerMap],
  );

  const hasScheduledSelection = selectedItems.some(
    (item) => item.schedule_status !== "due_now",
  );

  const hasConflictBlockedSelection = selectedItems.some(
    (item) => !isQueueConflictClear(item.conflict_status),
  );

  const internalAlertRouteAvailable = isCustomerDataHydrated && !document.querySelector('meta[name="journey-storage-user"]');
  const canSendViaSendGrid =
    canSendInternal &&
    allSelectedApproved &&
    sendableItems.length === selectedItems.length &&
    !hasScheduledSelection &&
    !hasConflictBlockedSelection;

  const simulatedLogEligibility = useMemo(
    () =>
      partitionSimulatedLogEligibility(selectedItems, {
        customers,
        emailTemplates,
        automationRules,
      }),
    [selectedItems, customers, emailTemplates, automationRules],
  );

  const canCreateSimulatedLogs =
    canApproveQueue && simulatedLogEligibility.eligible.length > 0;

  function showToast(
    text: string,
    variant: "info" | "success" | "warning" = "info",
  ) {
    setMessage(text);
    setToastVariant(variant);
  }

  function handleExportQueue() {
    exportActionQueueCsv(items, customers, automationRules);
    recordClientAuditEvent({
      action: "export.action_queue_csv",
      targetType: "action_queue",
      metadata: { row_count: items.length },
    });
    showToast(`Exported ${items.length} action queue row(s) to CSV.`, "success");
  }

  function toggleAll(checked: boolean) {
    setSelected(
      checked ? new Set(filtered.map((i) => i.id)) : new Set(),
    );
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handlePreview() {
    if (selected.size === 0) return;
    if (selected.size > 1) {
      showToast("Please select only one action to preview.", "warning");
      return;
    }
    setPreviewOpen(true);
  }

  function requireSelection(action: string): string[] | null {
    if (selected.size === 0) {
      showToast(`Select at least one row to ${action}.`, "warning");
      return null;
    }
    if (selectedItems.some(item => item.workflow_status === "Accepted by SendGrid")) {
      showToast("SendGrid has already accepted a selected action.", "warning");
      return null;
    }
    return [...selected];
  }

  function handleMarkReviewed() {
    const ids = requireSelection("mark reviewed");
    if (!ids) return;
    const eligible = ids.filter((id) => {
      const item = items.find((i) => i.id === id);
      return item && item.workflow_status !== "Blocked";
    });
    if (eligible.length === 0) {
      showToast("Blocked items cannot be marked reviewed.", "warning");
      return;
    }
    updateWorkflowStatus(eligible, "Previewed", "Marked as reviewed in queue");
    recordClientAuditEvent({
      action: "queue.mark_reviewed",
      targetType: "action_queue_item",
      metadata: { selected_count: eligible.length },
    });
    showToast(`Marked ${eligible.length} item(s) as reviewed.`, "success");
  }

  function handleApproveSelected() {
    const ids = requireSelection("approve");
    if (!ids) return;

    const blocked = ids.filter(
      (id) => items.find((i) => i.id === id)?.workflow_status === "Blocked",
    );
    if (blocked.length > 0) {
      showToast("Blocked items cannot be approved. Reset status first.", "warning");
      return;
    }

    const needsPreview = ids.filter((id) => {
      const status = items.find((i) => i.id === id)?.workflow_status;
      return status === "Needs Review";
    });
    if (needsPreview.length > 0) {
      showToast("Preview required before bulk approval.", "warning");
      return;
    }

    const notPreviewed = ids.filter((id) => {
      const status = items.find((i) => i.id === id)?.workflow_status;
      return status !== "Previewed" && status !== "Test Sent";
    });
    if (notPreviewed.length > 0) {
      showToast(
        "Bulk approve only works for Previewed or Test Sent items.",
        "warning",
      );
      return;
    }

    updateWorkflowStatus(ids, "Approved", "Approved from action queue (bulk)");
    recordClientAuditEvent({
      action: "queue.approve",
      targetType: "action_queue_item",
      metadata: { selected_count: ids.length },
    });
    showToast(`Approved ${ids.length} item(s).`, "success");
  }

  function handleSkipSelected() {
    const ids = requireSelection("skip");
    if (!ids) return;
    updateWorkflowStatus(ids, "Skipped", "Skipped from action queue");
    recordClientAuditEvent({
      action: "queue.skip",
      targetType: "action_queue_item",
      metadata: { selected_count: ids.length },
    });
    showToast(`Skipped ${ids.length} item(s).`, "info");
  }

  function handleResetStatus() {
    const ids = requireSelection("reset");
    if (!ids) return;
    resetWorkflowStatus(ids);
    recordClientAuditEvent({
      action: "queue.reset_status",
      targetType: "action_queue_item",
      metadata: { selected_count: ids.length },
    });
    showToast(`Reset ${ids.length} item(s).`, "info");
  }

  function handleSendViaSendGrid() {
    if (!allSelectedApproved) {
      showToast("Only Approved items can be sent via SendGrid.", "warning");
      return;
    }
    if (sendableItems.length !== selectedItems.length) {
      const scheduled = selectedItems.filter(
        (item) => item.schedule_status !== "due_now",
      );
      if (scheduled.length > 0) {
        showToast(
          "Some selected actions are scheduled for later and cannot be sent yet.",
          "warning",
        );
        return;
      }
      if (hasConflictBlockedSelection) {
        showToast(
          "Some selected actions have conflict blocks and cannot be sent yet.",
          "warning",
        );
        return;
      }
      showToast(
        "Some selected actions are not eligible for internal send (customer recipients, blocked, or duplicate protection).",
        "warning",
      );
      return;
    }

    for (const item of sendableItems) {
      const templateError = getInternalSendTemplateError(item, emailTemplates);
      if (templateError) {
        showToast(templateError, "warning");
        return;
      }
    }

    setConfirmOpen(true);
    recordClientAuditEvent({
      action: "send.internal.ui_click",
      targetType: "action_queue_item",
      metadata: { selected_count: sendableItems.length },
    });
  }

  function handleCreateSimulatedLogs() {
    if (selectedItems.length === 0) {
      showToast("Select at least one row to create simulated logs.", "warning");
      return;
    }
    if (simulatedLogEligibility.eligible.length === 0) {
      showToast(
        "No selected items are eligible for simulated logs. Approve customer-facing actions that are due now with clear conflicts.",
        "warning",
      );
      return;
    }

    const result = createSimulatedCommunicationLogs(selectedItems);

    if (result.createdCount === 0 && result.skippedDuplicateCount > 0) {
      showToast(
        `Simulated logs already exist for selected action(s). ${result.skippedDuplicateCount} duplicate(s) skipped.`,
        "warning",
      );
      return;
    }

    if (result.createdCount === 0) {
      showToast(
        result.blockedCount > 0
          ? `${result.blockedCount} item(s) were not eligible.`
          : "No simulated logs were created.",
        "warning",
      );
      return;
    }

    const parts = ["Simulated logs created. No email was sent."];
    if (result.skippedDuplicateCount > 0) {
      parts.push(`${result.skippedDuplicateCount} duplicates skipped.`);
    }
    if (result.blockedCount > 0) {
      parts.push(`${result.blockedCount} items were not eligible.`);
    }
    showToast(parts.join(" "), "success");
  }

  function getCreateSimulatedLogsTitle(): string {
    if (!canApproveQueue) {
      return permissionDeniedTitle("approve_queue_actions");
    }
    if (selectedItems.length === 0) {
      return "Select approved customer-facing actions";
    }
    if (simulatedLogEligibility.eligible.length === 0) {
      return "No eligible customer-facing approved actions in selection";
    }
    return "Create simulated Communication Log rows without sending email";
  }

  async function handleConfirmInternalSend() {
    setSending(true);
    let successCount = 0;
    let failCount = 0;
    let lastSendMode: "dry_run" | "live" | null = null;

    for (const item of sendableItems) {
      const customer = customerMap.get(item.customer_id);
      if (!customer) continue;

      const content = resolveInternalSendEmailContent(
        item,
        customer,
        emailTemplates,
      );
      if (!content.ok) {
        failCount += 1;
        logInternalSend(
          item,
          false,
          undefined,
          content.error,
          "dry_run",
        );
        continue;
      }

      const payload = buildInternalSendPayload(
        item,
        customer,
        content.subject,
        content.body,
      );

      try {
        const result = await requestInternalSend(payload);
        const sendMode = result.sendMode ?? "dry_run";
        lastSendMode = sendMode;
        logInternalSend(
          item,
          true,
          result.deliverTo,
          undefined,
          sendMode,
          result.routingReason,
        );
        updateWorkflowStatus(
          [item.id],
          sendMode === "live" ? "Live Internal Alert Sent" : "Dry Run Complete",
          sendMode === "live"
            ? `Live internal alert sent to ${result.deliverTo}`
            : "Dry run completed. No email was sent.",
          result.deliverTo,
        );
        successCount++;

        if (item.enrollment_id && item.source === "sequence_enrollment") {
          const markComplete = window.confirm(
            "Mark this sequence step complete? (Manual progression only — not automatic.)",
          );
          if (markComplete) {
            const progressResult = completeEnrollmentStep(item.enrollment_id, {
              completion_source:
                sendMode === "live" ? "internal_live_send" : "internal_dry_run",
              notes:
                sendMode === "live"
                  ? "Marked complete after internal live send."
                  : "Marked complete after internal dry run.",
            });
            if (!progressResult.ok) {
              showToast(progressResult.error, "warning");
            }
          }
        }
      } catch (error) {
        const errMsg =
          error instanceof Error ? error.message : "Internal send failed";
        logInternalSend(item, false, undefined, errMsg);
        failCount++;
      }
    }

    setSending(false);
    setConfirmOpen(false);

    if (successCount > 0 && failCount === 0) {
      showToast(
        lastSendMode === "live"
          ? "Live internal alert sent."
          : "Dry run completed. No email was sent.",
        "success",
      );
    } else if (successCount > 0) {
      showToast(
        `${lastSendMode === "live" ? "Live internal alert sent" : "Dry run completed"} for ${successCount} item(s). ${failCount} failed — see Communication Logs.`,
        "warning",
      );
    } else {
      showToast("All internal sends failed. See Communication Logs for details.", "warning");
    }
  }

  function getSendViaSendGridTitle(): string {
    if (!canSendInternal) {
      return permissionDeniedTitle("send_internal_alert");
    }
    if (selectedItems.length === 0) {
      return "Select approved internal-eligible actions";
    }
    if (!allSelectedApproved) {
      return "Only Approved actions can be sent";
    }
    if (hasScheduledSelection) {
      return "Action is scheduled for later.";
    }
    if (hasConflictBlockedSelection) {
      return "Conflict blocks must be clear before sending.";
    }
    const hasCustomerFacing = selectedItems.some((item) => {
      const customer = customerMap.get(item.customer_id);
      return (
        customer &&
        (isSequenceCustomerFacingItem(item) ||
          !isEligibleInternalRecipient(item.recipient, customer))
      );
    });
    if (hasCustomerFacing || sendableItems.length !== selectedItems.length) {
      return "Choose Review customer email for a customer recipient.";
    }
    return "Send approved internal alerts via SendGrid (dry run or live per config)";
  }

  function handleMarkSequenceStepComplete(item: ActionQueueItem) {
    if (!item.enrollment_id) return;
    if (!window.confirm("Mark the current sequence step complete? This advances the sequence without sending an email.")) return;
    const result = completeEnrollmentStep(item.enrollment_id);
    if (!result.ok) {
      showToast(result.error, "warning");
      return;
    }
    recordClientAuditEvent({
      action: "queue.sequence_step_complete",
      targetType: "action_queue_item",
      targetId: item.id,
      metadata: { enrollment_id: item.enrollment_id },
    });
    showToast(
      result.enrollment.enrollment_status === "completed"
        ? "Enrollment completed — all steps finished."
        : `Advanced to step ${result.enrollment.current_step_number}.`,
      "success",
    );
    setSelected(new Set());
  }

  function handleSkipSequenceStep(item: ActionQueueItem) {
    if (!item.enrollment_id) return;
    const reason = window.prompt("Skip reason (optional):");
    if (reason === null) return;
    const result = skipEnrollmentStep(item.enrollment_id, reason || undefined);
    if (!result.ok) {
      showToast(result.error, "warning");
      return;
    }
    recordClientAuditEvent({
      action: "queue.sequence_step_skip",
      targetType: "action_queue_item",
      targetId: item.id,
      metadata: { enrollment_id: item.enrollment_id },
    });
    showToast(
      result.enrollment.enrollment_status === "completed"
        ? "Step skipped. Enrollment completed."
        : `Step skipped. Now on step ${result.enrollment.current_step_number}.`,
      "success",
    );
    setSelected(new Set());
  }

  return (
    <div className="space-y-4">
      <WorkflowSummaryCard summary={workflowSummary} />

      <EmailPreviewModal
        item={previewItem}
        customer={previewCustomer}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        onToast={showToast}
      />

      {canApproveQueue && previewItem && customerMailId === previewItem.id && customerMail?.draft && (
        <CustomerMailConfirm
          key={customerMailId}
          item={previewItem}
          draft={customerMail.draft}
          onClose={() => setCustomerMailId(null)}
          onAccepted={() => {
            setCustomerMailId(null);
            setSelected(new Set());
            showToast("SendGrid accepted the email for delivery.", "success");
          }}
        />
      )}

      <InternalSendConfirmModal
        key={
          confirmOpen
            ? sendableItems.map((i) => i.id).join(",") || "send"
            : "closed"
        }
        open={confirmOpen}
        items={sendableItems}
        customers={customers}
        emailTemplates={emailTemplates}
        sending={sending}
        onClose={() => !sending && setConfirmOpen(false)}
        onConfirm={handleConfirmInternalSend}
      />

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Sequence step progression is manual. Mark steps complete or skip after
        review. To send a customer email, approve one due action and choose Review customer email.
      </div>

      <div className="flex flex-wrap gap-3">
        <FilterSelect
          label="Issue"
          value={issueFilter}
          onChange={setIssueFilter}
          options={issues}
        />
        <FilterSelect
          label="Owner"
          value={ownerFilter}
          onChange={setOwnerFilter}
          options={owners}
        />
        <FilterSelect
          label="Recipient Type"
          value={recipientFilter}
          onChange={setRecipientFilter}
          options={recipientTypes}
        />
        <FilterSelect
          label="Action Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={workflowStatuses}
        />
        <FilterSelect
          label="Source"
          value={sourceFilter}
          onChange={setSourceFilter}
          options={[SOURCE_TRIGGER, SOURCE_SEQUENCE]}
        />
        <FilterSelect
          label="Conflict"
          value={conflictFilter}
          onChange={setConflictFilter}
          options={[CONFLICT_CLEAR, CONFLICT_BLOCKED]}
        />
        <ScheduleFilterSelect
          label="Schedule"
          value={scheduleFilter}
          onChange={setScheduleFilter}
        />
        <span className="flex items-end pb-2 text-sm text-slate-500">
          {filtered.length} of {items.length} actions
        </span>
      </div>

      <p className="text-xs text-slate-500">
        Exports contact-first queue rows for review and audit.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={selected.size === 0}
          onClick={handlePreview}
        >
          Preview Selected
        </Button>
        <Button
          variant="outline"
          disabled={approveGate.disabled || selected.size === 0}
          title={
            approveGate.title ??
            (selected.size === 0 ? "Select actions first" : undefined)
          }
          onClick={handleMarkReviewed}
        >
          Mark Reviewed
        </Button>
        <Button
          variant="primary"
          disabled={approveGate.disabled || selected.size === 0}
          title={
            approveGate.title ??
            (selected.size === 0 ? "Select actions first" : undefined)
          }
          onClick={handleApproveSelected}
        >
          Approve Selected
        </Button>
        <Button
          variant="ghost"
          disabled={approveGate.disabled || selected.size === 0}
          title={
            approveGate.title ??
            (selected.size === 0 ? "Select actions first" : undefined)
          }
          onClick={handleSkipSelected}
        >
          Skip Selected
        </Button>
        <Button
          variant="outline"
          disabled={approveGate.disabled || selected.size === 0}
          title={
            approveGate.title ??
            (selected.size === 0 ? "Select actions first" : undefined)
          }
          onClick={handleResetStatus}
        >
          Reset Status
        </Button>
        <Button
          variant="primary"
          disabled={!canApproveQueue || !customerMail?.draft}
          title={approveGate.title ?? customerMail?.reason ?? "Select one approved customer email"}
          onClick={() => previewItem && setCustomerMailId(previewItem.id)}
        >
          Review customer email
        </Button>
        {internalAlertRouteAvailable && <Button
          variant="secondary"
          disabled={!canSendViaSendGrid || sending}
          title={getSendViaSendGridTitle()}
          onClick={handleSendViaSendGrid}
        >
          Send internal alert
        </Button>}
        <Button
          variant="outline"
          disabled={!canCreateSimulatedLogs}
          title={getCreateSimulatedLogsTitle()}
          onClick={handleCreateSimulatedLogs}
        >
          Create Simulated Logs
        </Button>
        <Button
          variant="outline"
          disabled={exportGate.disabled}
          title={exportGate.title}
          onClick={handleExportQueue}
        >
          Export Action Queue CSV
        </Button>
      </div>

      {previewItem?.channel === "email" && customerMail?.reason && (
        <p className="text-sm text-slate-600">{customerMail.reason}</p>
      )}

      {message && (
        <Toast
          message={message}
          variant={toastVariant}
          onDismiss={() => setMessage(null)}
        />
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={
                    filtered.length > 0 && selected.size === filtered.length
                  }
                  onChange={(e) => toggleAll(e.target.checked)}
                  className="rounded border-slate-300"
                  aria-label="Select all"
                />
              </th>
              <Th>Contact Email</Th>
              <Th>Role</Th>
              <Th>Customer / Account</Th>
              <Th>Source</Th>
              <Th>Trigger / Sequence</Th>
              <Th>Step</Th>
              <Th>Schedule</Th>
              <Th>Conflict</Th>
              <Th>Approval / Status</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((item) => {
              const customer = customerMap.get(item.customer_id);
              const isSequence = isSequenceRow(item);
              const contactEmail = displayContactEmailLabel(item);
              const contactResolved = contactEmail !== "Contact email not resolved";
              const role = displayContactRole(item);
              const deliveryTarget = displayDeliveryTarget(item);
              const internalEligible =
                customer &&
                !isSequenceCustomerFacingItem(item) &&
                isEligibleInternalRecipient(item.recipient, customer) &&
                isQueueConflictClear(item.conflict_status);

              return (
              <tr
                key={item.id}
                className={
                  isSequence
                    ? "border-l-4 border-l-indigo-400 bg-indigo-50/30 hover:bg-indigo-50/50"
                    : "hover:bg-slate-50/80"
                }
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggleOne(item.id)}
                    className="rounded border-slate-300"
                    aria-label={`Select ${contactEmail}`}
                  />
                </td>
                <td className="px-4 py-3">
                  <p
                    className={
                      contactResolved
                        ? "font-medium text-slate-900"
                        : "font-medium text-amber-800"
                    }
                  >
                    {contactEmail}
                  </p>
                  {deliveryTarget ? (
                    <p
                      className="mt-0.5 text-xs text-slate-500"
                      title="Delivery target for internal routing"
                    >
                      Delivery target: {deliveryTarget}
                    </p>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {role ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-800">
                    {item.customer_name}
                  </p>
                  <p className="text-xs text-slate-400">{item.customer_id}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Owner: {item.owner}
                  </p>
                  {item.duplicate_warning && (
                    <p
                      className="mt-1 max-w-xs text-xs text-amber-700"
                      title={item.duplicate_warning}
                    >
                      ⚠ {item.duplicate_warning.slice(0, 72)}
                      {item.duplicate_warning.length > 72 ? "…" : ""}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={isSequence ? "default" : "muted"}>
                    {formatQueueSourceLabel(item.source)}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-800">
                    {triggerSequenceLabel(item)}
                  </p>
                  <p className="mt-0.5 max-w-xs text-xs text-slate-500">
                    {item.recommended_action}
                  </p>
                  <code className="mt-1 inline-block rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                    {item.template}
                  </code>
                </td>
                <td className="px-4 py-3 text-slate-600">{stepLabel(item)}</td>
                <td className="px-4 py-3">
                  <p className="whitespace-nowrap text-slate-700">
                    {formatScheduledForDisplay(item.scheduled_for)}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {item.timing_label}
                  </p>
                  <div className="mt-1">
                    <Badge variant={scheduleStatusVariant(item.schedule_status)}>
                      {formatScheduleStatusLabel(item.schedule_status)}
                    </Badge>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={queueConflictVariant(item.conflict_status)}>
                    {formatQueueConflictLabel(item.conflict_status)}
                  </Badge>
                  {item.conflict_reason && (
                    <p className="mt-1 max-w-xs text-xs text-slate-500">
                      {item.conflict_reason}
                    </p>
                  )}
                  {item.next_eligible_at && (
                    <p className="mt-0.5 text-xs text-slate-400">
                      Next eligible:{" "}
                      {formatScheduledForDisplay(item.next_eligible_at)}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={workflowStatusVariant(item.workflow_status)}>
                    {item.workflow_status}
                  </Badge>
                  {internalEligible && internalAlertRouteAvailable && (
                    <p className="mt-1 text-xs text-emerald-700">
                      Eligible for internal alert send{item.schedule_status !== "due_now" && " when due"}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3">
                  {isSequence && item.enrollment_id ? (
                    <div className="flex flex-col gap-1">
                      <Button
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        disabled={approveGate.disabled}
                        title={approveGate.title}
                        onClick={() => handleMarkSequenceStepComplete(item)}
                      >
                        Mark Step Complete
                      </Button>
                      <Button
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        disabled={approveGate.disabled}
                        title={approveGate.title}
                        onClick={() => handleSkipSequenceStep(item)}
                      >
                        Skip Step
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
              </tr>
            );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
      {children}
    </th>
  );
}

function ScheduleFilterSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        <option value={ALL}>All</option>
        <option value={SCHEDULE_DUE_NOW}>Due now</option>
        <option value={SCHEDULE_NOT_DUE}>Not due / Scheduled</option>
        <option value={SCHEDULE_SCHEDULED}>Scheduled (recurring)</option>
      </select>
    </label>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        <option value={ALL}>All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
