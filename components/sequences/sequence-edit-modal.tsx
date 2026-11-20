"use client";

import { useMemo, useState } from "react";
import type { EditableEmailSequence, EditableSequenceStep } from "@/lib/email-sequence-definitions";
import {
  SEQUENCE_AUDIENCES,
  SEQUENCE_CATEGORIES,
  SEQUENCE_STATUSES,
  STEP_CHANNELS,
  STEP_DELAY_UNITS,
  STEP_RECIPIENT_TYPES,
  cloneEmailSequence,
  createEmptySequenceStep,
  normalizeSequenceKey,
  validateEmailSequence,
} from "@/lib/email-sequence-definitions";
import type { EmailTemplate } from "@/lib/types";
import {
  getApprovedTemplatesForSequenceStep,
  getSequenceTemplateWarnings,
  resolveStepTemplateStatus,
} from "@/lib/email-sequence-templates";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface SequenceEditModalProps {
  open: boolean;
  sequence: EditableEmailSequence | null;
  allSequences: EditableEmailSequence[];
  emailTemplates: EmailTemplate[];
  isNew: boolean;
  onClose: () => void;
  onSave: (sequence: EditableEmailSequence) => void;
}

export function SequenceEditModal({
  open,
  sequence,
  allSequences,
  emailTemplates,
  isNew,
  onClose,
  onSave,
}: SequenceEditModalProps) {
  if (!open || !sequence) return null;

  return (
    <SequenceEditForm
      key={sequence.id}
      sequence={cloneEmailSequence(sequence)}
      allSequences={allSequences}
      emailTemplates={emailTemplates}
      isNew={isNew}
      onClose={onClose}
      onSave={onSave}
    />
  );
}

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

function SequenceEditForm({
  sequence,
  allSequences,
  emailTemplates,
  isNew,
  onClose,
  onSave,
}: {
  sequence: EditableEmailSequence;
  allSequences: EditableEmailSequence[];
  emailTemplates: EmailTemplate[];
  isNew: boolean;
  onClose: () => void;
  onSave: (sequence: EditableEmailSequence) => void;
}) {
  const [draft, setDraft] = useState<EditableEmailSequence>(sequence);
  const [changeNote, setChangeNote] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  const templateWarnings = useMemo(
    () => getSequenceTemplateWarnings(draft, emailTemplates),
    [draft, emailTemplates],
  );

  function updateDraft(patch: Partial<EditableEmailSequence>) {
    setDraft((prev) => ({ ...prev, ...patch }));
    setErrors([]);
  }

  function updateSteps(steps: EditableSequenceStep[]) {
    updateDraft({ steps });
  }

  function updateStep(index: number, patch: Partial<EditableSequenceStep>) {
    updateSteps(
      draft.steps.map((step, i) => (i === index ? { ...step, ...patch } : step)),
    );
  }

  function moveStep(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= draft.steps.length) return;
    const next = [...draft.steps];
    [next[index], next[target]] = [next[target], next[index]];
    updateSteps(next);
  }

  function removeStep(index: number) {
    if (draft.steps.length <= 1) return;
    updateSteps(draft.steps.filter((_, i) => i !== index));
  }

  function handleSave() {
    const normalized = {
      ...draft,
      key: normalizeSequenceKey(draft.key),
      updated_at: new Date().toISOString(),
      latest_change_note: changeNote.trim(),
    };
    const validationErrors = validateEmailSequence(
      normalized,
      isNew
        ? allSequences
        : allSequences.filter((entry) => entry.id !== normalized.id),
      emailTemplates,
    );
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }
    onSave(normalized);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={
        isNew
          ? "Create Sequence"
          : `Edit Sequence: ${draft.name || "Untitled"}`
      }
      size="xl"
      footer={
        <>
          <Button variant="primary" onClick={handleSave}>
            Save Sequence
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {draft.status === "archived" && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            This sequence is archived. You can still edit it, but it will not be
            used for new enrollments until re-approved.
          </div>
        )}

        {templateWarnings.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-medium">Template warnings</p>
            <ul className="mt-2 list-disc pl-5">
              {templateWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
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

        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Approved sequences can be manually enrolled for a contact. Active
          enrollments can create reviewable Action Queue rows. Nothing sends
          automatically.
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <input
              className={inputClass}
              value={draft.name}
              onChange={(e) => updateDraft({ name: e.target.value })}
            />
          </Field>
          <Field label="Key">
            <input
              className={inputClass}
              value={draft.key}
              onChange={(e) => updateDraft({ key: e.target.value })}
              placeholder="my-sequence-key"
            />
          </Field>
          <Field label="Category">
            <select
              className={inputClass}
              value={draft.category}
              onChange={(e) =>
                updateDraft({
                  category: e.target
                    .value as EditableEmailSequence["category"],
                })
              }
            >
              {SEQUENCE_CATEGORIES.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Audience">
            <select
              className={inputClass}
              value={draft.audience}
              onChange={(e) =>
                updateDraft({
                  audience: e.target
                    .value as EditableEmailSequence["audience"],
                })
              }
            >
              {SEQUENCE_AUDIENCES.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
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
                  status: e.target.value as EditableEmailSequence["status"],
                })
              }
            >
              {SEQUENCE_STATUSES.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Description" fullWidth>
            <textarea
              className={inputClass}
              rows={2}
              value={draft.description}
              onChange={(e) => updateDraft({ description: e.target.value })}
            />
          </Field>
          <Field label="Change note" fullWidth>
            <input
              className={inputClass}
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
              placeholder="Optional note saved with this version"
            />
          </Field>
        </div>

        <div className="rounded-lg border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-900">
            Cooling policy (contact email level)
          </h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label="Global customer email cooldown (days)">
              <input
                className={inputClass}
                type="number"
                min={0}
                value={draft.cooling_policy.global_cooldown_days}
                onChange={(e) =>
                  updateDraft({
                    cooling_policy: {
                      ...draft.cooling_policy,
                      global_cooldown_days: Number(e.target.value),
                    },
                  })
                }
              />
            </Field>
            <Field label="Same template cooldown (days)">
              <input
                className={inputClass}
                type="number"
                min={0}
                value={draft.cooling_policy.same_template_cooldown_days}
                onChange={(e) =>
                  updateDraft({
                    cooling_policy: {
                      ...draft.cooling_policy,
                      same_template_cooldown_days: Number(e.target.value),
                    },
                  })
                }
              />
            </Field>
            <Field label="Max customer emails per 30 days">
              <input
                className={inputClass}
                type="number"
                min={1}
                value={draft.cooling_policy.max_emails_per_contact_30_days}
                onChange={(e) =>
                  updateDraft({
                    cooling_policy: {
                      ...draft.cooling_policy,
                      max_emails_per_contact_30_days: Number(e.target.value),
                    },
                  })
                }
              />
            </Field>
            <Field label="Allow internal alerts during cooldown">
              <label className="flex items-center gap-2 pt-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={
                    draft.cooling_policy.internal_alerts_bypass_contact_cooldown
                  }
                  onChange={(e) =>
                    updateDraft({
                      cooling_policy: {
                        ...draft.cooling_policy,
                        internal_alerts_bypass_contact_cooldown:
                          e.target.checked,
                      },
                    })
                  }
                  className="rounded border-slate-300"
                />
                Internal CSM/DAM alerts bypass contact cooldown
              </label>
            </Field>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Steps</h3>
            <Button
              variant="outline"
              onClick={() =>
                updateSteps([...draft.steps, createEmptySequenceStep()])
              }
            >
              Add step
            </Button>
          </div>

          {draft.steps.map((step, index) => (
            <div
              key={step.id}
              className="rounded-lg border border-slate-200 bg-white p-4"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant={step.active ? "info" : "muted"}>
                    Step {index + 1}
                  </Badge>
                  {!step.active && (
                    <span className="text-xs text-slate-500">Inactive</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button
                    variant="ghost"
                    disabled={index === 0}
                    onClick={() => moveStep(index, -1)}
                  >
                    ↑
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={index === draft.steps.length - 1}
                    onClick={() => moveStep(index, 1)}
                  >
                    ↓
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={draft.steps.length <= 1}
                    onClick={() => removeStep(index)}
                  >
                    Remove
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Step name">
                  <input
                    className={inputClass}
                    value={step.step_name}
                    onChange={(e) =>
                      updateStep(index, { step_name: e.target.value })
                    }
                  />
                </Field>
                <Field label="Delay amount">
                  <input
                    className={inputClass}
                    type="number"
                    min={0}
                    value={step.delay_amount}
                    onChange={(e) =>
                      updateStep(index, {
                        delay_amount: Number(e.target.value),
                      })
                    }
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Delay must be 0 or greater. Use 0 for Day 0.
                  </p>
                </Field>
                <Field label="Delay unit">
                  <select
                    className={inputClass}
                    value={step.delay_unit}
                    onChange={(e) =>
                      updateStep(index, {
                        delay_unit: e.target
                          .value as EditableSequenceStep["delay_unit"],
                      })
                    }
                  >
                    {STEP_DELAY_UNITS.map((unit) => (
                      <option key={unit.value} value={unit.value}>
                        {unit.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Channel">
                  <select
                    className={inputClass}
                    value={step.channel}
                    onChange={(e) =>
                      updateStep(index, {
                        channel: e.target
                          .value as EditableSequenceStep["channel"],
                      })
                    }
                  >
                    {STEP_CHANNELS.map((channel) => (
                      <option key={channel.value} value={channel.value}>
                        {channel.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Recipient type">
                  <select
                    className={inputClass}
                    value={step.recipient_type}
                    onChange={(e) =>
                      updateStep(index, {
                        recipient_type: e.target
                          .value as EditableSequenceStep["recipient_type"],
                      })
                    }
                  >
                    {STEP_RECIPIENT_TYPES.map((recipient) => (
                      <option key={recipient.value} value={recipient.value}>
                        {recipient.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Template key">
                  {step.channel === "in_app" ? (
                    <p className="text-sm text-slate-500">
                      In-app steps do not use templates.
                    </p>
                  ) : (
                    <>
                      <select
                        className={inputClass}
                        value={step.template_key}
                        onChange={(e) =>
                          updateStep(index, { template_key: e.target.value })
                        }
                      >
                        <option value="">Select approved template…</option>
                        {getApprovedTemplatesForSequenceStep(
                          step.channel,
                          emailTemplates,
                        ).map((template) => (
                          <option key={template.key} value={template.key}>
                            {template.name} ({template.key})
                          </option>
                        ))}
                      </select>
                      {step.template_key &&
                        resolveStepTemplateStatus(step, emailTemplates) !==
                          "approved" && (
                          <p className="mt-1 text-xs text-amber-700">
                            Current template &quot;{step.template_key}&quot; is{" "}
                            {resolveStepTemplateStatus(step, emailTemplates)}.
                            Choose an approved template from Email Templates.
                          </p>
                        )}
                      {getApprovedTemplatesForSequenceStep(
                        step.channel,
                        emailTemplates,
                      ).length === 0 && (
                        <p className="mt-1 text-xs text-amber-700">
                          No approved templates for this channel in Email
                          Library.
                        </p>
                      )}
                    </>
                  )}
                </Field>
                <Field label="Requires approval">
                  <label className="flex items-center gap-2 pt-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={step.requires_approval}
                      onChange={(e) =>
                        updateStep(index, {
                          requires_approval: e.target.checked,
                        })
                      }
                      className="rounded border-slate-300"
                    />
                    Step requires approval before send
                  </label>
                </Field>
                <Field label="Active">
                  <label className="flex items-center gap-2 pt-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={step.active}
                      onChange={(e) =>
                        updateStep(index, { active: e.target.checked })
                      }
                      className="rounded border-slate-300"
                    />
                    Step is active
                  </label>
                </Field>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

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
