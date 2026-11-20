"use client";

import { useState } from "react";
import type { EmailTemplate } from "@/lib/types";
import {
  ALLOWED_TEMPLATE_VARIABLES,
  TEMPLATE_AUDIENCES,
  TEMPLATE_SENDERS,
  TEMPLATE_STATUSES,
  TEMPLATE_TYPES,
  normalizeTemplateKey,
} from "@/lib/email-template-definitions";
import {
  extractVariablesFromText,
  findUnknownVariables,
  validateEmailTemplate,
} from "@/lib/email-template-engine";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

interface EmailTemplateEditModalProps {
  open: boolean;
  template: EmailTemplate | null;
  allTemplates: EmailTemplate[];
  isNew: boolean;
  onClose: () => void;
  onSave: (template: EmailTemplate) => void;
}

export function EmailTemplateEditModal({
  open,
  template,
  allTemplates,
  isNew,
  onClose,
  onSave,
}: EmailTemplateEditModalProps) {
  if (!open || !template) return null;

  return (
    <EmailTemplateEditForm
      key={template.id}
      template={template}
      allTemplates={allTemplates}
      isNew={isNew}
      onClose={onClose}
      onSave={onSave}
    />
  );
}

function EmailTemplateEditForm({
  template,
  allTemplates,
  isNew,
  onClose,
  onSave,
}: {
  template: EmailTemplate;
  allTemplates: EmailTemplate[];
  isNew: boolean;
  onClose: () => void;
  onSave: (template: EmailTemplate) => void;
}) {
  const [draft, setDraft] = useState<EmailTemplate>(template);
  const [changeNote, setChangeNote] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  const unknownVariables = findUnknownVariables(
    `${draft.subject}\n${draft.body}`,
  );

  function updateDraft(patch: Partial<EmailTemplate>) {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      const combined = `${next.subject}\n${next.body}`;
      return {
        ...next,
        variables_used: extractVariablesFromText(combined),
      };
    });
    setErrors([]);
  }

  function handleSenderChange(senderId: string) {
    const sender = TEMPLATE_SENDERS.find((entry) => entry.id === senderId);
    if (!sender) return;
    updateDraft({
      sender_name: sender.name,
      sender_email: sender.email,
      reply_to_email: sender.dynamic ? "" : sender.email,
    });
  }

  function currentSenderId() {
    const match = TEMPLATE_SENDERS.find(
      (sender) => sender.name === draft.sender_name,
    );
    return match?.id ?? TEMPLATE_SENDERS[0].id;
  }

  function handleSave() {
    const normalized = {
      ...draft,
      key: normalizeTemplateKey(draft.key),
    };
    const validationErrors = validateEmailTemplate(normalized, allTemplates);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }
    onSave({ ...normalized, latest_change_note: changeNote.trim() });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? "Create Email Template" : `Edit Template: ${draft.name || "Untitled"}`}
      size="xl"
      footer={
        <>
          <Button variant="primary" onClick={handleSave}>
            Save Template
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="space-y-5">
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
          <Field label="Name">
            <input
              className={inputClass}
              value={draft.name}
              onChange={(e) => updateDraft({ name: e.target.value })}
            />
          </Field>
          <Field label="Key (unique slug)">
            <input
              className={inputClass}
              value={draft.key}
              onChange={(e) => updateDraft({ key: e.target.value })}
              placeholder="invite-reminder"
            />
          </Field>
          <Field label="Description" fullWidth>
            <textarea
              className={inputClass}
              rows={2}
              value={draft.description}
              onChange={(e) => updateDraft({ description: e.target.value })}
            />
          </Field>
          <Field label="Audience">
            <select
              className={inputClass}
              value={draft.audience}
              onChange={(e) =>
                updateDraft({
                  audience: e.target.value as EmailTemplate["audience"],
                })
              }
            >
              {TEMPLATE_AUDIENCES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Type">
            <select
              className={inputClass}
              value={draft.type}
              onChange={(e) =>
                updateDraft({ type: e.target.value as EmailTemplate["type"] })
              }
            >
              {TEMPLATE_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select
              className={inputClass}
              value={draft.status}
              onChange={(e) =>
                updateDraft({
                  status: e.target.value as EmailTemplate["status"],
                })
              }
            >
              {TEMPLATE_STATUSES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Sender">
            <select
              className={inputClass}
              value={currentSenderId()}
              onChange={(e) => handleSenderChange(e.target.value)}
            >
              {TEMPLATE_SENDERS.map((sender) => (
                <option key={sender.id} value={sender.id}>
                  {sender.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reply-to email">
            <input
              className={inputClass}
              value={draft.reply_to_email}
              onChange={(e) => updateDraft({ reply_to_email: e.target.value })}
              placeholder={
                currentSenderId() === "csm-owner"
                  ? "Uses CSM email at send time"
                  : "reply@example.com"
              }
            />
          </Field>
          <Field label="Subject" fullWidth>
            <input
              className={inputClass}
              value={draft.subject}
              onChange={(e) => updateDraft({ subject: e.target.value })}
            />
          </Field>
          <Field label="Preview text" fullWidth>
            <input
              className={inputClass}
              value={draft.preview_text}
              onChange={(e) => updateDraft({ preview_text: e.target.value })}
            />
          </Field>
          <Field label="Body" fullWidth>
            <textarea
              className={inputClass}
              rows={10}
              value={draft.body}
              onChange={(e) => updateDraft({ body: e.target.value })}
            />
          </Field>
          <Field label="Change note" fullWidth>
            <input
              className={inputClass}
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
              placeholder="Optional — e.g. Updated subject line for clarity"
            />
            {!isNew && template.latest_change_note && (
              <p className="mt-1 text-xs text-slate-500">
                Previous note (v{template.version}): {template.latest_change_note}
              </p>
            )}
          </Field>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Available variables
          </p>
          <p className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
            {ALLOWED_TEMPLATE_VARIABLES.map((variable) => (
              <code
                key={variable}
                className="rounded bg-white px-2 py-0.5 text-slate-700"
              >
                {variable}
              </code>
            ))}
          </p>
          {unknownVariables.length > 0 && (
            <p className="mt-3 text-sm text-amber-800">
              Unknown variables detected: {unknownVariables.join(", ")}
            </p>
          )}
          {draft.variables_used.length > 0 && (
            <p className="mt-2 text-sm text-slate-600">
              Variables used: {draft.variables_used.join(", ")}
            </p>
          )}
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
