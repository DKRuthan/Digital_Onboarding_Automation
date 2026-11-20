import type {
  AutomationChannel,
  EmailTemplate,
  EmailTemplateAudience,
  EmailTemplateStatus,
  EmailTemplateType,
} from "./types";

export const EMAIL_TEMPLATES_STORAGE_KEY =
  "onboarding-control-email-templates";

export const ALLOWED_TEMPLATE_VARIABLES = [
  "{{customer_name}}",
  "{{admin_name}}",
  "{{owner_name}}",
  "{{seats_total}}",
  "{{seats_assigned}}",
  "{{usage_sessions}}",
  "{{days_since_start}}",
  "{{days_to_renewal}}",
  "{{academy_link}}",
  "{{webinar_link}}",
] as const;

export const TEMPLATE_AUDIENCES: {
  value: EmailTemplateAudience;
  label: string;
}[] = [
  { value: "admin", label: "Admin" },
  { value: "user", label: "User" },
  { value: "csm", label: "CSM" },
  { value: "internal", label: "Internal" },
];

export const TEMPLATE_TYPES: { value: EmailTemplateType; label: string }[] = [
  { value: "customer_email", label: "Customer Email" },
  { value: "internal_alert", label: "Internal Alert" },
  { value: "test_only", label: "Test Only" },
];

export const TEMPLATE_STATUSES: { value: EmailTemplateStatus; label: string }[] =
  [
    { value: "draft", label: "Draft" },
    { value: "approved", label: "Approved" },
    { value: "archived", label: "Archived" },
  ];

export interface TemplateSenderOption {
  id: string;
  name: string;
  email: string;
  dynamic: boolean;
  label: string;
}

/** Controlled sender list — no arbitrary sender emails in MVP. */
export const TEMPLATE_SENDERS: TemplateSenderOption[] = [
  {
    id: "maltego-team",
    name: "Maltego Team",
    email: "onboarding@maltego.com",
    dynamic: false,
    label: "Maltego Team <onboarding@maltego.com>",
  },
  {
    id: "customer-success",
    name: "Customer Success",
    email: "success@maltego.com",
    dynamic: false,
    label: "Customer Success <success@maltego.com>",
  },
  {
    id: "digital-onboarding",
    name: "Digital Onboarding",
    email: "onboarding@maltego.com",
    dynamic: false,
    label: "Digital Onboarding <onboarding@maltego.com>",
  },
  {
    id: "csm-owner",
    name: "CSM Owner",
    email: "",
    dynamic: true,
    label: "CSM Owner (dynamic — uses account owner email at send time)",
  },
];

export const DEFAULT_TEMPLATE_KEYS = [
  "invite-reminder",
  "getting-started",
  "usage-tips",
  "seat-assignment",
  "academy-invite",
  "webinar-invite",
  "renewal-risk",
] as const;

function templateId() {
  return `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function collectVariables(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/\{\{(\w+)\}\}/g)) {
    found.add(`{{${match[1]}}}`);
  }
  return [...found];
}

const DEFAULT_TEMPLATE_TIMESTAMP = "2026-06-01T12:00:00.000Z";

function baseTemplate(
  partial: Omit<
    EmailTemplate,
    | "variables_used"
    | "version"
    | "latest_change_note"
    | "created_at"
    | "updated_at"
  >,
  timestamps: { created_at: string; updated_at: string } = {
    created_at: DEFAULT_TEMPLATE_TIMESTAMP,
    updated_at: DEFAULT_TEMPLATE_TIMESTAMP,
  },
): EmailTemplate {
  const combined = `${partial.subject}\n${partial.body}`;
  return {
    ...partial,
    variables_used: collectVariables(combined),
    version: 1,
    latest_change_note: "",
    created_at: timestamps.created_at,
    updated_at: timestamps.updated_at,
  };
}

/** Default templates aligned with the 7 automation rule template keys. */
export const DEFAULT_EMAIL_TEMPLATES: EmailTemplate[] = [
  baseTemplate({
    id: "invite-reminder",
    key: "invite-reminder",
    name: "Invite Reminder",
    description: "Reminder for admins with a pending platform invite.",
    audience: "admin",
    type: "customer_email",
    status: "approved",
    sender_name: "Maltego Team",
    sender_email: "onboarding@maltego.com",
    reply_to_email: "onboarding@maltego.com",
    subject: "Reminder: Accept your {{customer_name}} platform invite",
    preview_text: "Your admin invite is still pending.",
    body: `Hi {{admin_name}},

We noticed your admin invite for {{customer_name}} is still pending. Your account has been active for {{days_since_start}} days.

Please accept the invite so your team can get started.

If you need help, reply to this email or contact your CSM, {{owner_name}}.

Best,
Maltego Team`,
  }),
  baseTemplate({
    id: "getting-started",
    key: "getting-started",
    name: "Getting Started Guide",
    description: "Onboarding guide for accounts with no usage yet.",
    audience: "admin",
    type: "customer_email",
    status: "approved",
    sender_name: "Digital Onboarding",
    sender_email: "onboarding@maltego.com",
    reply_to_email: "onboarding@maltego.com",
    subject: "Get started with your {{customer_name}} account",
    preview_text: "Quick steps to launch your team.",
    body: `Hi {{admin_name}},

Your {{customer_name}} account was set up {{days_since_start}} days ago, but we haven't seen any usage sessions yet.

Here's how to get started:
1. Log in at your admin portal
2. Assign seats to your team (currently {{seats_assigned}} of {{seats_total}} assigned)
3. Complete your first search or graph session

We're here to help you reach your usage goals.

Best,
Digital Onboarding`,
  }),
  baseTemplate({
    id: "usage-tips",
    key: "usage-tips",
    name: "Usage Tips",
    description: "Adoption tips for low-usage accounts.",
    audience: "admin",
    type: "customer_email",
    status: "approved",
    sender_name: "Customer Success",
    sender_email: "success@maltego.com",
    reply_to_email: "success@maltego.com",
    subject: "Tips to increase adoption at {{customer_name}}",
    preview_text: "Quick wins to boost product usage.",
    body: `Hi {{admin_name}},

We noticed {{customer_name}} has {{usage_sessions}} usage sessions so far.

Quick wins for your team:
• Review assigned seats ({{seats_assigned}}/{{seats_total}})
• Share best practices with your team
• Schedule a 15-minute enablement call with {{owner_name}}

Let us know if you'd like a walkthrough.

Best,
Customer Success`,
  }),
  baseTemplate({
    id: "seat-assignment",
    key: "seat-assignment",
    name: "Seat Assignment Reminder",
    description: "Prompt to assign remaining licensed seats.",
    audience: "admin",
    type: "customer_email",
    status: "approved",
    sender_name: "Digital Onboarding",
    sender_email: "onboarding@maltego.com",
    reply_to_email: "onboarding@maltego.com",
    subject: "Action needed: Assign remaining seats at {{customer_name}}",
    preview_text: "Assign seats so your team can get value.",
    body: `Hi {{admin_name}},

Only {{seats_assigned}} of {{seats_total}} licensed seats are assigned at {{customer_name}}.

Assigning seats helps your team get value from your subscription. Log in to your admin console to invite users.

Need help? Contact {{owner_name}}.

Best,
Digital Onboarding`,
  }),
  baseTemplate({
    id: "academy-invite",
    key: "academy-invite",
    name: "Academy Invite",
    description: "Invitation to the Digital Onboarding Academy.",
    audience: "admin",
    type: "customer_email",
    status: "approved",
    sender_name: "Digital Onboarding",
    sender_email: "onboarding@maltego.com",
    reply_to_email: "onboarding@maltego.com",
    subject: "You're invited: {{customer_name}} Academy onboarding",
    preview_text: "Accelerate adoption with guided training.",
    body: `Hi {{admin_name}},

We'd love to see your team at the Digital Onboarding Academy. {{customer_name}} hasn't visited yet.

Register today: {{academy_link}}

Your CSM {{owner_name}} recommends completing the academy within your first 60 days.

Best,
Enablement Team`,
  }),
  baseTemplate({
    id: "webinar-invite",
    key: "webinar-invite",
    name: "Webinar Invite",
    description: "Invitation to a live product webinar.",
    audience: "admin",
    type: "customer_email",
    status: "approved",
    sender_name: "Digital Onboarding",
    sender_email: "onboarding@maltego.com",
    reply_to_email: "onboarding@maltego.com",
    subject: "Join our live webinar for {{customer_name}}",
    preview_text: "Live session with product experts.",
    body: `Hi {{admin_name}},

{{customer_name}} hasn't joined a product webinar yet. Our next session covers real-world workflows and Q&A.

Save your seat: {{webinar_link}}

Your owner: {{owner_name}}

Best,
Events Team`,
  }),
  baseTemplate({
    id: "renewal-risk",
    key: "renewal-risk",
    name: "Renewal Risk Alert",
    description: "Internal alert for CSM renewal risk outreach.",
    audience: "internal",
    type: "internal_alert",
    status: "approved",
    sender_name: "Digital Onboarding",
    sender_email: "onboarding@maltego.com",
    reply_to_email: "onboarding@maltego.com",
    subject: "[CSM Action] Renewal risk: {{customer_name}}",
    preview_text: "Account flagged for renewal risk.",
    body: `Hi {{owner_name}},

{{customer_name}} is flagged for renewal risk.

Account summary:
• Renewal in {{days_to_renewal}} days
• Usage sessions: {{usage_sessions}}
• Seats assigned: {{seats_assigned}}/{{seats_total}}

Please schedule executive outreach before renewal.

Best,
Automation System`,
  }),
];

export function cloneEmailTemplate(template: EmailTemplate): EmailTemplate {
  return { ...template, variables_used: [...template.variables_used] };
}

export function cloneDefaultEmailTemplates(): EmailTemplate[] {
  return DEFAULT_EMAIL_TEMPLATES.map(cloneEmailTemplate);
}

export function createEmptyEmailTemplate(): EmailTemplate {
  const sender = TEMPLATE_SENDERS[0];
  const timestamp = nowIso();
  return baseTemplate(
    {
      id: templateId(),
      key: "",
      name: "",
      description: "",
      audience: "admin",
      type: "customer_email",
      status: "draft",
      sender_name: sender.name,
      sender_email: sender.email,
      reply_to_email: sender.email,
      subject: "",
      preview_text: "",
      body: "",
    },
    { created_at: timestamp, updated_at: timestamp },
  );
}

export function normalizeTemplateKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export function getSenderOptionById(id: string): TemplateSenderOption | undefined {
  return TEMPLATE_SENDERS.find((sender) => sender.id === id);
}

export function formatSenderDisplay(template: EmailTemplate): string {
  if (template.sender_name === "CSM Owner" || !template.sender_email) {
    return "CSM Owner (dynamic)";
  }
  return `${template.sender_name} <${template.sender_email}>`;
}

export function getTemplateTypeForChannel(
  channel: AutomationChannel,
): EmailTemplateType | null {
  switch (channel) {
    case "email":
      return "customer_email";
    case "internal_alert":
      return "internal_alert";
    default:
      return null;
  }
}

export function getApprovedTemplatesForChannel(
  channel: AutomationChannel,
  templates: EmailTemplate[],
): EmailTemplate[] {
  const type = getTemplateTypeForChannel(channel);
  if (!type) return [];

  return templates.filter(
    (template) =>
      template.status === "approved" && template.type === type,
  );
}
