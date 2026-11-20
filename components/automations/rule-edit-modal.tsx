"use client";

import { useState } from "react";
import type { EditableAutomationRule } from "@/lib/types";
import { cloneAutomationRule } from "@/lib/automation-rule-definitions";
import { normalizeAutomationRule } from "@/lib/automation-rule-migration";
import {
  getDuplicateTriggerNameWarning,
  resolveRuleIdForCreate,
  validateAutomationRule,
  validateRuleIdForSave,
} from "@/lib/automation-rule-engine";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import {
  AUTOMATION_CHANNELS,
  RECIPIENT_TYPES,
} from "@/lib/automation-rule-definitions";
import { getApprovedTemplatesForChannel } from "@/lib/email-template-definitions";
import { GroupedConditionsEditor } from "./grouped-conditions-editor";
import { RulePlainEnglishSummary } from "./rule-plain-english-summary";
import { RuleTimingEditor } from "./rule-timing-editor";
import { useCustomerData } from "@/components/providers/customer-data-provider";

interface RuleEditModalProps {
  open: boolean;
  rule: EditableAutomationRule | null;
  mode?: "create" | "edit";
  onClose: () => void;
  onSave: (rule: EditableAutomationRule) => void;
}

export function RuleEditModal({
  open,
  rule,
  mode = "edit",
  onClose,
  onSave,
}: RuleEditModalProps) {
  if (!open || !rule) return null;

  return (
    <RuleEditForm
      key={rule.id}
      mode={mode}
      rule={cloneAutomationRule(normalizeAutomationRule(rule))}
      onClose={onClose}
      onSave={onSave}
    />
  );
}

function RuleEditForm({
  mode,
  rule,
  onClose,
  onSave,
}: {
  mode: "create" | "edit";
  rule: EditableAutomationRule;
  onClose: () => void;
  onSave: (rule: EditableAutomationRule) => void;
}) {
  const [draft, setDraft] = useState<EditableAutomationRule>(rule);
  const [errors, setErrors] = useState<string[]>([]);
  const { emailTemplates, automationRules } = useCustomerData();
  const originalRuleId = rule.id;

  const approvedTemplates = getApprovedTemplatesForChannel(
    draft.channel,
    emailTemplates,
  );

  const duplicateNameWarning = getDuplicateTriggerNameWarning(
    draft,
    automationRules,
    mode === "edit" ? originalRuleId : undefined,
  );

  function updateRule(patch: Partial<EditableAutomationRule>) {
    setDraft((prev) => ({ ...prev, ...patch }));
    setErrors([]);
  }

  function handleSave() {
    let candidate = normalizeAutomationRule(draft);
    if (mode === "create") {
      candidate = resolveRuleIdForCreate(candidate, automationRules);
      setDraft(candidate);
    }

    const validationErrors = [
      ...validateAutomationRule(candidate, emailTemplates),
      ...validateRuleIdForSave(
        candidate,
        automationRules,
        mode,
        mode === "edit" ? originalRuleId : undefined,
      ),
    ];
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }
    onSave(candidate);
    onClose();
  }

  function handleClose() {
    setErrors([]);
    onClose();
  }

  const isCreate = mode === "create";
  const modalTitle = isCreate
    ? "Add Trigger"
    : `Edit Trigger: ${draft.name || "Untitled"}`;
  const saveLabel = isCreate ? "Save Trigger" : "Save Rule";

  return (
    <Modal
      open
      onClose={handleClose}
      title={modalTitle}
      size="xl"
      footer={
        <>
          <Button variant="primary" onClick={handleSave}>
            {saveLabel}
          </Button>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {isCreate && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            New triggers are saved <strong>inactive</strong> by default. Enable
            the trigger when you are ready for it to appear in the Action Queue.
          </div>
        )}

        {duplicateNameWarning && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {duplicateNameWarning}
          </div>
        )}

        {errors.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <p className="font-medium">Fix these issues before saving:</p>
            <ul className="mt-2 list-disc pl-5">
              {errors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Rule name">
            <input
              className={inputClass}
              value={draft.name}
              onChange={(e) => updateRule({ name: e.target.value })}
            />
          </Field>
          <Field label="Active">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) => updateRule({ active: e.target.checked })}
                className="rounded border-slate-300"
              />
              Rule is active
            </label>
          </Field>
          <Field label="Description" fullWidth>
            <textarea
              className={inputClass}
              rows={2}
              value={draft.description}
              onChange={(e) => updateRule({ description: e.target.value })}
            />
          </Field>
        </div>

        <GroupedConditionsEditor rule={draft} onChange={updateRule} />

        <RulePlainEnglishSummary rule={draft} variant="panel" />

        <RuleTimingEditor
          rule={draft}
          onChange={(patch) => updateRule(patch)}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Recommended action">
            <input
              className={inputClass}
              value={draft.recommendedAction}
              onChange={(e) =>
                updateRule({ recommendedAction: e.target.value })
              }
            />
          </Field>
          <Field label="Channel">
            <select
              className={inputClass}
              value={draft.channel}
              onChange={(e) => {
                const channel = e.target
                  .value as EditableAutomationRule["channel"];
                updateRule({
                  channel,
                  ...(channel === "in_app" ? { template: "" } : {}),
                });
              }}
            >
              {AUTOMATION_CHANNELS.map((channel) => (
                <option key={channel.value} value={channel.value}>
                  {channel.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Recipient type">
            <select
              className={inputClass}
              value={draft.recipientType}
              onChange={(e) =>
                updateRule({
                  recipientType: e.target.value as EditableAutomationRule["recipientType"],
                })
              }
            >
              {RECIPIENT_TYPES.map((recipient) => (
                <option key={recipient.value} value={recipient.value}>
                  {recipient.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Template">
            {draft.channel === "in_app" ? (
              <p className="text-sm text-slate-600">
                In-app actions do not use email templates.
              </p>
            ) : (
              <>
                <select
                  className={inputClass}
                  value={draft.template}
                  onChange={(e) => updateRule({ template: e.target.value })}
                >
                  <option value="">Select approved template…</option>
                  {approvedTemplates.map((template) => (
                    <option key={template.key} value={template.key}>
                      {template.name} ({template.key})
                    </option>
                  ))}
                </select>
                {approvedTemplates.length === 0 && (
                  <p className="mt-1 text-xs text-amber-700">
                    No approved templates for this channel. Approve templates in
                    Email Templates.
                  </p>
                )}
                {draft.template &&
                  !approvedTemplates.some((t) => t.key === draft.template) && (
                    <p className="mt-1 text-xs text-amber-700">
                      Current key &quot;{draft.template}&quot; is not an
                      approved template for this channel. Choose a new template
                      or approve it in Email Templates.
                    </p>
                  )}
              </>
            )}
          </Field>
          <Field label="Priority (lower = higher)">
            <input
              className={inputClass}
              type="number"
              min={1}
              value={draft.priority}
              onChange={(e) =>
                updateRule({ priority: Number(e.target.value) || 1 })
              }
            />
          </Field>
          <Field label="Cooldown days">
            <input
              className={inputClass}
              type="number"
              min={0}
              value={draft.cooldownDays}
              onChange={(e) =>
                updateRule({ cooldownDays: Number(e.target.value) || 0 })
              }
            />
          </Field>
          <Field label="Requires approval">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={draft.requiresApproval}
                onChange={(e) =>
                  updateRule({ requiresApproval: e.target.checked })
                }
                className="rounded border-slate-300"
              />
              Action must be approved before send
            </label>
          </Field>
        </div>
      </div>
    </Modal>
  );
}

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

function Field({
  label,
  children,
  fullWidth,
}: {
  label: string;
  children: React.ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <label className={fullWidth ? "sm:col-span-2" : undefined}>
      <span className="mb-1 block text-xs font-medium text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}
