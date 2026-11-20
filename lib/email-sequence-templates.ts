import type { AutomationChannel, EmailTemplate } from "./types";
import type { EditableEmailSequence, EditableSequenceStep } from "./email-sequence-definitions";
import { getTemplateTypeForChannel } from "./email-template-definitions";

export type SequenceStepTemplateStatus =
  | "approved"
  | "draft"
  | "archived"
  | "missing"
  | "not_applicable";

export function getApprovedTemplatesForSequenceStep(
  channel: AutomationChannel,
  templates: EmailTemplate[],
): EmailTemplate[] {
  const requiredType = getTemplateTypeForChannel(channel);
  if (!requiredType) return [];

  return templates.filter(
    (template) =>
      template.status === "approved" && template.type === requiredType,
  );
}

export function resolveStepTemplateStatus(
  step: EditableSequenceStep,
  templates: EmailTemplate[],
): SequenceStepTemplateStatus {
  if (step.channel === "in_app") {
    return "not_applicable";
  }

  const key = step.template_key.trim();
  if (!key) return "missing";

  const template = templates.find((entry) => entry.key === key);
  if (!template) return "missing";

  if (template.status === "approved") return "approved";
  if (template.status === "archived") return "archived";
  return "draft";
}

export function formatStepTemplateStatusLabel(
  status: SequenceStepTemplateStatus,
): string {
  switch (status) {
    case "approved":
      return "Approved";
    case "draft":
      return "Draft";
    case "archived":
      return "Archived";
    case "missing":
      return "Missing";
    case "not_applicable":
      return "N/A";
    default:
      return status;
  }
}

export function templateStatusVariant(
  status: SequenceStepTemplateStatus,
): "success" | "warning" | "muted" | "danger" | "default" {
  switch (status) {
    case "approved":
      return "success";
    case "draft":
      return "warning";
    case "archived":
      return "muted";
    case "missing":
      return "danger";
    default:
      return "default";
  }
}

function templateChannelLabel(channel: AutomationChannel): string {
  switch (channel) {
    case "email":
      return "customer email";
    case "internal_alert":
      return "internal alert";
    default:
      return channel;
  }
}

export function validateActiveStepTemplates(
  step: EditableSequenceStep,
  stepNumber: number,
  templates: EmailTemplate[],
): string[] {
  if (!step.active) return [];

  const label = `Step ${stepNumber}`;
  const errors: string[] = [];

  if (!Number.isFinite(step.delay_amount) || step.delay_amount < 0) {
    errors.push(`${label}: Delay must be 0 or greater. Use 0 for Day 0.`);
  }

  if (step.channel === "in_app") {
    return errors;
  }

  const templateKey = step.template_key.trim();
  if (!templateKey) {
    if (step.channel === "email") {
      errors.push(
        `${label}: Email steps must use an approved customer email template.`,
      );
    } else if (step.channel === "internal_alert") {
      errors.push(
        `${label}: Internal alert steps must use an approved internal alert template.`,
      );
    }
    return errors;
  }

  const template = templates.find((entry) => entry.key === templateKey);
  if (!template) {
    errors.push(
      `${label}: Template "${templateKey}" was not found in Email Library.`,
    );
    return errors;
  }

  const requiredType = getTemplateTypeForChannel(step.channel);
  if (!requiredType) {
    return errors;
  }

  if (template.type !== requiredType) {
    errors.push(
      `${label}: ${templateChannelLabel(step.channel)} steps must use an approved ${templateChannelLabel(step.channel)} template.`,
    );
    return errors;
  }

  if (template.status !== "approved") {
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

  return errors;
}

/** Non-blocking warnings for sequence cards and editor banners. */
export function getSequenceTemplateWarnings(
  sequence: EditableEmailSequence,
  templates: EmailTemplate[],
): string[] {
  const warnings: string[] = [];

  sequence.steps.forEach((step, index) => {
    if (!step.active || step.channel === "in_app") return;

    const stepNum = index + 1;
    const status = resolveStepTemplateStatus(step, templates);
    const key = step.template_key.trim();

    if (!key) {
      warnings.push(
        `Step ${stepNum} (${step.step_name}) has no template selected.`,
      );
      return;
    }

    if (status === "missing") {
      warnings.push(
        `Step ${stepNum} (${step.step_name}): template "${key}" is missing from Email Library.`,
      );
    } else if (status === "draft") {
      warnings.push(
        `Step ${stepNum} (${step.step_name}): template "${key}" is draft — approve it in Email Library.`,
      );
    } else if (status === "archived") {
      warnings.push(
        `Step ${stepNum} (${step.step_name}): template "${key}" is archived.`,
      );
    } else if (status === "approved") {
      const template = templates.find((entry) => entry.key === key);
      const requiredType = getTemplateTypeForChannel(step.channel);
      if (template && requiredType && template.type !== requiredType) {
        warnings.push(
          `Step ${stepNum} (${step.step_name}): template "${key}" type does not match ${step.channel} channel.`,
        );
      }
    }
  });

  return warnings;
}

export function sequenceHasTemplateWarnings(
  sequence: EditableEmailSequence,
  templates: EmailTemplate[],
): boolean {
  return getSequenceTemplateWarnings(sequence, templates).length > 0;
}
