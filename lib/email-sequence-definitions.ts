import type { AutomationChannel, RecipientType } from "./types";
import type { ContactCooldownPolicy } from "./email-sequence-types";
import { DEFAULT_CONTACT_COOLDOWN_POLICY } from "./email-sequence-types";
import type { EmailTemplate } from "./types";
import { validateActiveStepTemplates } from "./email-sequence-templates";

export const EMAIL_SEQUENCES_STORAGE_KEY =
  "onboarding-control-email-sequences";

export type SequenceCategory =
  | "onboarding"
  | "activation"
  | "renewal"
  | "education";

export type SequenceAudience = "admin" | "user" | "csm";

export type SequenceStatus = "draft" | "approved" | "archived";

export type SequenceStepDelayUnit = "days" | "business_days";

export interface EditableSequenceStep {
  id: string;
  step_name: string;
  delay_amount: number;
  delay_unit: SequenceStepDelayUnit;
  channel: AutomationChannel;
  recipient_type: RecipientType;
  template_key: string;
  requires_approval: boolean;
  active: boolean;
}

/** Contact/email-level sequence stored in localStorage (Phase 1). */
export interface EditableEmailSequence {
  id: string;
  name: string;
  key: string;
  description: string;
  category: SequenceCategory;
  audience: SequenceAudience;
  status: SequenceStatus;
  cooling_policy: ContactCooldownPolicy;
  steps: EditableSequenceStep[];
  version: number;
  latest_change_note: string;
  created_at: string;
  updated_at: string;
}

export const SEQUENCE_CATEGORIES: { value: SequenceCategory; label: string }[] =
  [
    { value: "onboarding", label: "Onboarding" },
    { value: "activation", label: "Activation" },
    { value: "renewal", label: "Renewal" },
    { value: "education", label: "Education" },
  ];

export const SEQUENCE_AUDIENCES: { value: SequenceAudience; label: string }[] =
  [
    { value: "admin", label: "Admin" },
    { value: "user", label: "User" },
    { value: "csm", label: "CSM" },
  ];

export const SEQUENCE_STATUSES: { value: SequenceStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "approved", label: "Approved" },
  { value: "archived", label: "Archived" },
];

export const STEP_DELAY_UNITS: { value: SequenceStepDelayUnit; label: string }[] =
  [
    { value: "days", label: "Calendar days" },
    { value: "business_days", label: "Business days" },
  ];

export const STEP_CHANNELS: { value: AutomationChannel; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "internal_alert", label: "Internal Alert" },
  { value: "in_app", label: "In-App Task" },
];

export const STEP_RECIPIENT_TYPES: { value: RecipientType; label: string }[] = [
  { value: "Admin", label: "Admin" },
  { value: "User", label: "User" },
  { value: "CSM", label: "CSM" },
];

function sequenceId() {
  return `seq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function stepId() {
  return `step-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function nowIso() {
  return new Date().toISOString();
}

const DEFAULT_TIMESTAMP = "2026-06-01T12:00:00.000Z";

function defaultCoolingPolicy(): ContactCooldownPolicy {
  return { ...DEFAULT_CONTACT_COOLDOWN_POLICY };
}

function baseStep(
  partial: Omit<EditableSequenceStep, "id"> & { id?: string },
): EditableSequenceStep {
  return {
    id: partial.id ?? stepId(),
    step_name: partial.step_name,
    delay_amount: partial.delay_amount,
    delay_unit: partial.delay_unit,
    channel: partial.channel,
    recipient_type: partial.recipient_type,
    template_key: partial.template_key,
    requires_approval: partial.requires_approval,
    active: partial.active,
  };
}

function baseSequence(
  partial: Omit<
    EditableEmailSequence,
    | "version"
    | "latest_change_note"
    | "created_at"
    | "updated_at"
    | "cooling_policy"
  > & {
    version?: number;
    latest_change_note?: string;
    created_at?: string;
    updated_at?: string;
    cooling_policy?: ContactCooldownPolicy;
  },
): EditableEmailSequence {
  const timestamp = partial.updated_at ?? partial.created_at ?? DEFAULT_TIMESTAMP;
  return {
    version: 1,
    latest_change_note: "",
    created_at: timestamp,
    updated_at: timestamp,
    ...partial,
    cooling_policy: partial.cooling_policy ?? defaultCoolingPolicy(),
    steps: partial.steps.map((step) => ({ ...step })),
  };
}

export const DEFAULT_EMAIL_SEQUENCES: EditableEmailSequence[] = [
  baseSequence({
    id: "seq-invite-acceptance",
    key: "invite-acceptance",
    name: "Invite Acceptance Sequence",
    description:
      "Nudge pending admins to accept their invite and get started.",
    category: "onboarding",
    audience: "admin",
    status: "approved",
    steps: [
      baseStep({
        step_name: "Initial invite reminder",
        delay_amount: 0,
        delay_unit: "days",
        channel: "email",
        recipient_type: "Admin",
        template_key: "invite-reminder",
        requires_approval: true,
        active: true,
      }),
      baseStep({
        step_name: "Follow-up invite reminder",
        delay_amount: 3,
        delay_unit: "days",
        channel: "email",
        recipient_type: "Admin",
        template_key: "invite-reminder",
        requires_approval: true,
        active: true,
      }),
    ],
  }),
  baseSequence({
    id: "seq-no-usage-activation",
    key: "no-usage-activation",
    name: "No Usage Activation Sequence",
    description:
      "Guide accounts with no product usage through activation milestones.",
    category: "activation",
    audience: "admin",
    status: "approved",
    steps: [
      baseStep({
        step_name: "Getting started",
        delay_amount: 0,
        delay_unit: "days",
        channel: "email",
        recipient_type: "Admin",
        template_key: "getting-started",
        requires_approval: true,
        active: true,
      }),
      baseStep({
        step_name: "Usage tips",
        delay_amount: 3,
        delay_unit: "days",
        channel: "email",
        recipient_type: "Admin",
        template_key: "usage-tips",
        requires_approval: true,
        active: true,
      }),
      baseStep({
        step_name: "Webinar invite",
        delay_amount: 7,
        delay_unit: "days",
        channel: "email",
        recipient_type: "Admin",
        template_key: "webinar-invite",
        requires_approval: true,
        active: true,
      }),
      baseStep({
        step_name: "Renewal risk internal alert",
        delay_amount: 14,
        delay_unit: "days",
        channel: "internal_alert",
        recipient_type: "CSM",
        template_key: "renewal-risk",
        requires_approval: true,
        active: true,
      }),
    ],
  }),
  baseSequence({
    id: "seq-seat-assignment",
    key: "seat-assignment",
    name: "Seat Assignment Sequence",
    description: "Help admins assign seats and explore academy resources.",
    category: "onboarding",
    audience: "admin",
    status: "approved",
    steps: [
      baseStep({
        step_name: "Seat assignment reminder",
        delay_amount: 0,
        delay_unit: "days",
        channel: "email",
        recipient_type: "Admin",
        template_key: "seat-assignment",
        requires_approval: true,
        active: true,
      }),
      baseStep({
        step_name: "Academy invite",
        delay_amount: 5,
        delay_unit: "days",
        channel: "email",
        recipient_type: "Admin",
        template_key: "academy-invite",
        requires_approval: true,
        active: true,
      }),
    ],
  }),
  baseSequence({
    id: "seq-renewal-risk",
    key: "renewal-risk-sequence",
    name: "Renewal Risk Sequence",
    description: "Internal CSM alert when renewal risk is detected.",
    category: "renewal",
    audience: "csm",
    status: "approved",
    steps: [
      baseStep({
        step_name: "Renewal risk alert",
        delay_amount: 0,
        delay_unit: "days",
        channel: "internal_alert",
        recipient_type: "CSM",
        template_key: "renewal-risk",
        requires_approval: true,
        active: true,
      }),
    ],
  }),
];

export function cloneEmailSequence(
  sequence: EditableEmailSequence,
): EditableEmailSequence {
  return {
    ...sequence,
    cooling_policy: { ...sequence.cooling_policy },
    steps: sequence.steps.map((step) => ({ ...step })),
  };
}

export function cloneDefaultEmailSequences(): EditableEmailSequence[] {
  return DEFAULT_EMAIL_SEQUENCES.map(cloneEmailSequence);
}

export function createEmptyEmailSequence(): EditableEmailSequence {
  const timestamp = nowIso();
  return baseSequence({
    id: sequenceId(),
    key: "",
    name: "",
    description: "",
    category: "onboarding",
    audience: "admin",
    status: "draft",
    cooling_policy: defaultCoolingPolicy(),
    steps: [
      baseStep({
        step_name: "Step 1",
        delay_amount: 0,
        delay_unit: "days",
        channel: "email",
        recipient_type: "Admin",
        template_key: "",
        requires_approval: true,
        active: true,
      }),
    ],
    created_at: timestamp,
    updated_at: timestamp,
  });
}

export function normalizeSequenceKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export function countActiveSteps(sequence: EditableEmailSequence): number {
  return sequence.steps.filter((step) => step.active).length;
}

export function formatCoolingPolicySummary(
  policy: ContactCooldownPolicy,
): string {
  const internal = policy.internal_alerts_bypass_contact_cooldown
    ? "internal bypass on"
    : "internal bypass off";
  return `${policy.global_cooldown_days}d global · ${policy.same_template_cooldown_days}d same template · max ${policy.max_emails_per_contact_30_days}/30d · ${internal}`;
}

export function formatStepDelayLabel(step: EditableSequenceStep): string {
  if (step.delay_amount === 0) return "Day 0";
  const unit = step.delay_unit === "business_days" ? "business days" : "days";
  return `Day ${step.delay_amount} (${unit})`;
}

export function renumberSteps(
  steps: EditableSequenceStep[],
): EditableSequenceStep[] {
  return steps.map((step) => ({ ...step }));
}

export function validateEmailSequence(
  sequence: EditableEmailSequence,
  allSequences: EditableEmailSequence[],
  emailTemplates: EmailTemplate[] = [],
): string[] {
  const errors: string[] = [];
  const normalizedKey = normalizeSequenceKey(sequence.key);

  if (!sequence.name.trim()) {
    errors.push("Sequence name is required.");
  }
  if (!normalizedKey) {
    errors.push("Sequence key is required.");
  }

  const duplicate = allSequences.find(
    (entry) =>
      entry.id !== sequence.id &&
      normalizeSequenceKey(entry.key) === normalizedKey,
  );
  if (duplicate) {
    errors.push(`Sequence key "${normalizedKey}" is already in use.`);
  }

  const activeSteps = sequence.steps.filter((step) => step.active);
  if (activeSteps.length === 0) {
    errors.push("At least one active step is required.");
  }

  sequence.steps.forEach((step, index) => {
    const label = `Step ${index + 1}`;
    if (!step.active) return;

    if (!step.step_name.trim()) {
      errors.push(`${label}: step name is required.`);
    }

    if (emailTemplates.length > 0) {
      errors.push(
        ...validateActiveStepTemplates(step, index + 1, emailTemplates),
      );
    } else {
      if (!Number.isFinite(step.delay_amount) || step.delay_amount < 0) {
        errors.push(
          `${label}: Delay must be 0 or greater. Use 0 for Day 0.`,
        );
      }
      if (
        (step.channel === "email" || step.channel === "internal_alert") &&
        !step.template_key.trim()
      ) {
        if (step.channel === "email") {
          errors.push(
            `${label}: Email steps must use an approved customer email template.`,
          );
        } else {
          errors.push(
            `${label}: Internal alert steps must use an approved internal alert template.`,
          );
        }
      }
    }
  });

  if (sequence.cooling_policy.global_cooldown_days < 0) {
    errors.push("Global cooldown days cannot be negative.");
  }
  if (sequence.cooling_policy.same_template_cooldown_days < 0) {
    errors.push("Same template cooldown days cannot be negative.");
  }
  if (sequence.cooling_policy.max_emails_per_contact_30_days < 1) {
    errors.push("Max emails per 30 days must be at least 1.");
  }

  return errors;
}

export function duplicateEmailSequence(
  source: EditableEmailSequence,
  existing: EditableEmailSequence[],
): EditableEmailSequence {
  const baseName = source.name.replace(/\s-\sVariation(\s\d+)?$/, "").trim();
  const prefix = `${baseName} - Variation`;
  const variationCount = existing.filter((seq) => {
    if (seq.name === prefix) return true;
    const match = seq.name.match(
      new RegExp(`^${baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} - Variation (\\d+)$`),
    );
    return Boolean(match);
  }).length;

  const name =
    variationCount === 0 ? prefix : `${prefix} ${variationCount + 1}`;

  const baseKey = normalizeSequenceKey(source.key);
  let key = `${baseKey}-variation`;
  let suffix = 2;
  while (
    existing.some(
      (entry) => normalizeSequenceKey(entry.key) === normalizeSequenceKey(key),
    )
  ) {
    key = `${baseKey}-variation-${suffix}`;
    suffix += 1;
  }

  const timestamp = nowIso();
  return baseSequence({
    ...cloneEmailSequence(source),
    id: sequenceId(),
    name,
    key,
    status: "draft",
    version: 1,
    latest_change_note: `Duplicated from ${source.name}`,
    created_at: timestamp,
    updated_at: timestamp,
    steps: source.steps.map((step) => ({
      ...step,
      id: stepId(),
    })),
  });
}

export function createEmptySequenceStep(): EditableSequenceStep {
  return baseStep({
    step_name: "New step",
    delay_amount: 0,
    delay_unit: "days",
    channel: "email",
    recipient_type: "Admin",
    template_key: "",
    requires_approval: true,
    active: true,
  });
}
