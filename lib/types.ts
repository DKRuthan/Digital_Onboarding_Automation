export type InviteStatus = "Pending" | "Accepted" | "Expired";
export type AutomationStatus = "Ready" | "Pending Review" | "Sent" | "Skipped" | "None";
export type YesNo = "Yes" | "No";

/** Session contact row from Excel Contacts sheet (normalized email). */
export type ImportedContactSource = "excel_import";

export type ImportedContactRole = RecipientType | string;

export interface ImportedContact {
  contact_email: string;
  contact_role: ImportedContactRole;
  contact_name?: string;
  do_not_contact: boolean;
  customer_id: string;
  customer_name?: string;
  source?: ImportedContactSource;
}

export interface Customer {
  customer_id: string;
  customer_name: string;
  account_owner: string;
  admin_email: string;
  user_email: string;
  role: string;
  plan: string;
  engagement_model: string;
  stage: string;
  term_start_date: string;
  renewal_date: string;
  days_since_start: number;
  days_to_renewal: number;
  invite_sent_date: string;
  invite_accepted_date: string;
  invite_status: InviteStatus;
  seats_total: number;
  seats_assigned: number;
  seat_assignment_percent: number;
  graph_desktop_assigned: number;
  graph_browser_assigned: number;
  search_assigned: number;
  usage_sessions: number;
  usage_activities: number;
  active_users: number;
  last_usage_date: string;
  usage_threshold: number;
  usage_threshold_percent: number;
  use_case: string;
  icp: string;
  academy_visited: YesNo;
  webinar_attended: YesNo;
  last_email_sent: string;
  last_email_sent_date: string;
  emails_sent_count: number;
  next_recommended_action: string;
  automation_status: AutomationStatus;
  owner: string;
  notes: string;
}

export type RecipientType = "Admin" | "CSM" | "User";

export type AutomationChannel = "email" | "internal_alert" | "in_app";

export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "greater_than"
  | "greater_or_equal"
  | "less_than"
  | "less_or_equal";

export type ConditionLogic = "AND" | "OR";

export type RuleConditionField =
  | "invite_status"
  | "days_since_start"
  | "days_to_renewal"
  | "usage_sessions"
  | "usage_threshold_percent"
  | "seat_assignment_percent"
  | "academy_visited"
  | "webinar_attended";

export interface RuleCondition {
  id: string;
  field: RuleConditionField;
  operator: ConditionOperator;
  value: string;
}

export interface RuleConditionGroup {
  id: string;
  logic: ConditionLogic;
  conditions: RuleCondition[];
}

export type RuleTimingType = "immediate" | "after_delay" | "weekly" | "monthly";

export type DelayUnit = "days" | "business_days";

export type TimingAnchorField =
  | "days_since_start"
  | "invite_sent_date"
  | "invite_accepted_date"
  | "last_email_sent_date"
  | "renewal_date";

export type Weekday =
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday";

export type MonthlyMode = "day_of_month" | "first_weekday";

export interface RuleTimingImmediate {
  type: "immediate";
}

export interface RuleTimingAfterDelay {
  type: "after_delay";
  delay_amount: number;
  delay_unit: DelayUnit;
  anchor_field: TimingAnchorField;
}

export interface RuleTimingWeekly {
  type: "weekly";
  day_of_week: Weekday;
  time_of_day: string;
  timezone: string;
}

export interface RuleTimingMonthly {
  type: "monthly";
  monthly_mode: MonthlyMode;
  day_of_month?: number;
  weekday?: Weekday;
  time_of_day: string;
  timezone: string;
}

export type RuleTiming =
  | RuleTimingImmediate
  | RuleTimingAfterDelay
  | RuleTimingWeekly
  | RuleTimingMonthly;

export type ScheduleStatus = "due_now" | "scheduled" | "not_due";

export type ActionQueueSource = "rule" | "sequence_enrollment";

export type QueueConflictStatus =
  | "clear"
  | "blocked_by_cooldown"
  | "blocked_by_same_template"
  | "blocked_by_frequency_cap"
  | "blocked_by_active_sequence";

export function isQueueConflictClear(
  status?: QueueConflictStatus | null,
): boolean {
  return !status || status === "clear";
}

/** Editable automation rule stored in session state. */
export interface EditableAutomationRule {
  id: string;
  name: string;
  description: string;
  active: boolean;
  group_logic: ConditionLogic;
  condition_groups: RuleConditionGroup[];
  recommendedAction: string;
  channel: AutomationChannel;
  recipientType: RecipientType;
  template: string;
  priority: number;
  cooldownDays: number;
  requiresApproval: boolean;
  timing: RuleTiming;
}

export interface RuleTestMatch {
  customer_id: string;
  customer_name: string;
  recommended_action: string;
  recipient: string;
  template: string;
  scheduled_for: string;
  schedule_status: ScheduleStatus;
  timing_label: string;
}

/** @deprecated Legacy shape — use EditableAutomationRule + rule engine instead. */
export interface AutomationRule {
  id: string;
  name: string;
  condition: string;
  action: string;
  template: string;
  evaluate: (customer: Customer) => boolean;
}

export interface ActionQueueBase {
  id: string;
  customer_id: string;
  customer_name: string;
  issue: string;
  recommended_action: string;
  recipient: string;
  template: string;
  automation_status: AutomationStatus;
  rule_id: string;
  recipient_type: RecipientType;
  scheduled_for: string;
  schedule_status: ScheduleStatus;
  timing_type: RuleTimingType;
  timing_label: string;
  source: ActionQueueSource;
  enrollment_id?: string;
  contact_email?: string;
  sequence_key?: string;
  sequence_name?: string;
  sequence_step_id?: string;
  sequence_step_number?: number;
  sequence_step_name?: string;
  conflict_status?: QueueConflictStatus;
  conflict_reason?: string | null;
  next_eligible_at?: string | null;
  channel?: AutomationChannel;
  requires_approval?: boolean;
  template_key?: string;
}

export interface ActionQueueItem extends ActionQueueBase {
  owner: string;
  recipient_type: RecipientType;
  workflow_status: ActionWorkflowStatus;
  duplicate_warning: string | null;
}

export type ActionWorkflowStatus =
  | "Needs Review"
  | "Previewed"
  | "Test Sent"
  | "Approved"
  | "Skipped"
  | "Blocked"
  | "Accepted by SendGrid"
  | "Dry Run Complete"
  | "Live Internal Alert Sent";

export type SendLogMode = "demo" | "test" | "dry_run" | "live" | "logged_only";

export type SendLogStatus =
  | "Delivered"
  | "Failed"
  | "Bounced"
  | "Queued"
  | "Test Sent"
  | "Previewed"
  | "Approved"
  | "Skipped"
  | "Accepted by SendGrid"
  | "Dry Run Complete"
  | "Live Internal Alert Sent"
  | "Internal Send Failed"
  | "Simulated Sent";

export type CommunicationLogSourceType =
  | "rule"
  | "sequence_enrollment"
  | "manual"
  | "test"
  | "internal_alert";

export type CommunicationLogCreatedByMode = "operator_simulation";

export type CommunicationLogProvider = "none" | "sendgrid";

export interface SendLog {
  id: string;
  date: string;
  customer_name: string;
  issue: string;
  action: string;
  recipient: string;
  template: string;
  status: SendLogStatus;
  note: string;
  error: string;
  send_mode?: SendLogMode | "";
  enrollment_id?: string;
  contact_email?: string;
  contact_role?: RecipientType | string;
  sequence_key?: string;
  sequence_name?: string;
  sequence_step_number?: number;
  sequence_step_name?: string;
  conflict_status?: QueueConflictStatus | "";
  conflict_reason?: string;
  recipient_type?: RecipientType;
  customer_id?: string;
  account_owner?: string;
  source_type?: ActionQueueSource | CommunicationLogSourceType;
  trigger_id?: string;
  trigger_name?: string;
  sequence_step_id?: string;
  template_id?: string;
  subject?: string;
  delivery_status?: string;
  provider?: CommunicationLogProvider | "";
  provider_message_id?: string;
  action_queue_item_id?: string;
  workflow_status_at_send?: ActionWorkflowStatus;
  reason?: string;
  created_by_mode?: CommunicationLogCreatedByMode | string;
  idempotency_key?: string;
}

export interface WorkflowSummary {
  needsReview: number;
  testSent: number;
  approved: number;
  skipped: number;
  blocked: number;
}

export type EmailTemplateAudience = "admin" | "user" | "csm" | "internal";

export type EmailTemplateType =
  | "customer_email"
  | "internal_alert"
  | "test_only";

export type EmailTemplateStatus = "draft" | "approved" | "archived";

/** Editable email template stored in localStorage for demo use. */
export interface EmailTemplate {
  id: string;
  name: string;
  key: string;
  description: string;
  audience: EmailTemplateAudience;
  type: EmailTemplateType;
  status: EmailTemplateStatus;
  sender_name: string;
  sender_email: string;
  reply_to_email: string;
  subject: string;
  preview_text: string;
  body: string;
  variables_used: string[];
  version: number;
  latest_change_note: string;
  created_at: string;
  updated_at: string;
}

export interface RenderedEmailPreview {
  subject: string;
  body: string;
  unresolvedVariables: string[];
}

export interface DashboardStats {
  totalCustomers: number;
  atRiskCustomers: number;
  pendingInvites: number;
  lowUsageAccounts: number;
  seatsUnderassigned: number;
  actionsInQueue: number;
}
