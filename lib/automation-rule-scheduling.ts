import type {
  Customer,
  DelayUnit,
  EditableAutomationRule,
  MonthlyMode,
  RuleTiming,
  RuleTimingAfterDelay,
  RuleTimingMonthly,
  RuleTimingType,
  RuleTimingWeekly,
  ScheduleStatus,
  TimingAnchorField,
  Weekday,
} from "./types";

export const DEFAULT_TIMEZONE = "Europe/Berlin";

export const TIMING_ANCHOR_FIELDS: {
  value: TimingAnchorField;
  label: string;
}[] = [
  { value: "days_since_start", label: "Onboarding start date" },
  { value: "invite_sent_date", label: "Invite sent date" },
  { value: "invite_accepted_date", label: "Invite accepted date" },
  { value: "last_email_sent_date", label: "Last email sent date" },
  { value: "renewal_date", label: "Renewal date" },
];

export const WEEKDAYS: Weekday[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
];

export const DELAY_UNITS: { value: DelayUnit; label: string }[] = [
  { value: "days", label: "Calendar days" },
  { value: "business_days", label: "Business days" },
];

export const MONTHLY_MODES: { value: MonthlyMode; label: string }[] = [
  { value: "day_of_month", label: "Specific day of month" },
  { value: "first_weekday", label: "First weekday of month" },
];

export const TIMING_TYPES: { value: RuleTimingType; label: string }[] = [
  { value: "immediate", label: "Immediately when rule matches" },
  { value: "after_delay", label: "After delay" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

export function createImmediateTiming(): RuleTiming {
  return { type: "immediate" };
}

export function createAfterDelayTiming(
  delay_amount: number,
  delay_unit: DelayUnit,
  anchor_field: TimingAnchorField,
): RuleTimingAfterDelay {
  return { type: "after_delay", delay_amount, delay_unit, anchor_field };
}

export function createWeeklyTiming(
  day_of_week: Weekday = "Wednesday",
  time_of_day = "10:00",
  timezone = DEFAULT_TIMEZONE,
): RuleTimingWeekly {
  return { type: "weekly", day_of_week, time_of_day, timezone };
}

export function createMonthlyTiming(
  monthly_mode: MonthlyMode = "day_of_month",
  day_of_month = 1,
  weekday: Weekday = "Monday",
  time_of_day = "10:00",
  timezone = DEFAULT_TIMEZONE,
): RuleTimingMonthly {
  return {
    type: "monthly",
    monthly_mode,
    day_of_month,
    weekday,
    time_of_day,
    timezone,
  };
}

const WEEKDAY_INDEX: Record<Weekday, number> = {
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
};


function parseDateOnly(value: string): Date | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (match) {
    const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getZonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: get("weekday"),
  };
}

/** Build a UTC Date for a local wall-clock time in an IANA timezone. */
function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  let guess = Date.UTC(year, month - 1, day, hour, minute, 0);

  for (let i = 0; i < 4; i++) {
    const parts = getZonedParts(new Date(guess), timeZone);
    const targetMs = Date.UTC(year, month - 1, day, hour, minute, 0);
    const actualMs = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      0,
    );
    const diff = targetMs - actualMs;
    if (diff === 0) break;
    guess += diff;
  }

  return new Date(guess);
}

function parseTimeOfDay(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function weekdayFromShort(short: string): Weekday | null {
  const map: Record<string, Weekday> = {
    Mon: "Monday",
    Tue: "Tuesday",
    Wed: "Wednesday",
    Thu: "Thursday",
    Fri: "Friday",
  };
  return map[short] ?? null;
}

function addCalendarDays(date: Date, amount: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + amount);
  return result;
}

function addBusinessDays(date: Date, amount: number): Date {
  let remaining = amount;
  const result = new Date(date.getTime());
  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + 1);
    const day = result.getUTCDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return result;
}

function getAnchorDate(
  customer: Customer,
  field: TimingAnchorField,
): Date | null {
  switch (field) {
    case "days_since_start":
      return parseDateOnly(customer.term_start_date);
    case "invite_sent_date":
      return (
        parseDateOnly(customer.invite_sent_date) ??
        parseDateOnly(customer.term_start_date)
      );
    case "invite_accepted_date":
      return parseDateOnly(customer.invite_accepted_date);
    case "last_email_sent_date":
      return parseDateOnly(customer.last_email_sent_date);
    case "renewal_date":
      return parseDateOnly(customer.renewal_date);
    default:
      return null;
  }
}

function anchorLabel(field: TimingAnchorField): string {
  return (
    TIMING_ANCHOR_FIELDS.find((entry) => entry.value === field)?.label ?? field
  );
}

export function formatTimingSummary(timing: RuleTiming): string {
  switch (timing.type) {
    case "immediate":
      return "Create action immediately when rule matches.";
    case "after_delay": {
      const unit =
        timing.delay_unit === "business_days" ? "business days" : "days";
      return `Create action ${timing.delay_amount} ${unit} after ${anchorLabel(timing.anchor_field).toLowerCase()}.`;
    }
    case "weekly":
      return `Create action every ${timing.day_of_week} at ${timing.time_of_day} ${timing.timezone}.`;
    case "monthly":
      if (timing.monthly_mode === "first_weekday" && timing.weekday) {
        return `Create action on the first ${timing.weekday} of every month at ${timing.time_of_day} ${timing.timezone}.`;
      }
      return `Create action on day ${timing.day_of_month ?? 1} of every month at ${timing.time_of_day} ${timing.timezone}.`;
    default:
      return "Create action when rule matches.";
  }
}

export function formatTimingCardLabel(timing: RuleTiming): string {
  switch (timing.type) {
    case "immediate":
      return "Immediate when rule matches";
    case "after_delay": {
      const unit =
        timing.delay_unit === "business_days" ? "business days" : "days";
      return `After ${timing.delay_amount} ${unit} from ${anchorLabel(timing.anchor_field).toLowerCase()}`;
    }
    case "weekly":
      return `Every ${timing.day_of_week} at ${timing.time_of_day} ${timing.timezone}`;
    case "monthly":
      if (timing.monthly_mode === "first_weekday" && timing.weekday) {
        return `First ${timing.weekday} of each month at ${timing.time_of_day} ${timing.timezone}`;
      }
      return `Day ${timing.day_of_month ?? 1} of each month at ${timing.time_of_day} ${timing.timezone}`;
    default:
      return "When rule matches";
  }
}

export function formatScheduledForDisplay(iso: string, timezone = DEFAULT_TIMEZONE): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function computeAfterDelaySchedule(
  timing: RuleTimingAfterDelay,
  customer: Customer,
  now: Date,
): Date {
  const anchor =
    getAnchorDate(customer, timing.anchor_field) ?? parseDateOnly(customer.term_start_date) ?? now;
  const addFn =
    timing.delay_unit === "business_days" ? addBusinessDays : addCalendarDays;
  return addFn(anchor, timing.delay_amount);
}

function computeWeeklySchedule(timing: RuleTimingWeekly, now: Date): Date {
  const time = parseTimeOfDay(timing.time_of_day) ?? { hour: 10, minute: 0 };
  const targetDow = WEEKDAY_INDEX[timing.day_of_week];
  const zonedNow = getZonedParts(now, timing.timezone);
  const currentWd = weekdayFromShort(zonedNow.weekday);
  const currentDow = currentWd ? WEEKDAY_INDEX[currentWd] : 1;

  const dayOffset = targetDow - currentDow;

  return zonedDateTimeToUtc(
    zonedNow.year,
    zonedNow.month,
    zonedNow.day + dayOffset,
    time.hour,
    time.minute,
    timing.timezone,
  );
}

function firstWeekdayOfMonth(
  year: number,
  month: number,
  weekday: Weekday,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  for (let day = 1; day <= 7; day++) {
    const candidate = zonedDateTimeToUtc(year, month, day, hour, minute, timeZone);
    const parts = getZonedParts(candidate, timeZone);
    const wd = weekdayFromShort(parts.weekday);
    if (wd === weekday) return candidate;
  }
  return zonedDateTimeToUtc(year, month, 1, hour, minute, timeZone);
}

function computeMonthlySchedule(timing: RuleTimingMonthly, now: Date): Date {
  const time = parseTimeOfDay(timing.time_of_day) ?? { hour: 10, minute: 0 };
  const zonedNow = getZonedParts(now, timing.timezone);

  if (timing.monthly_mode === "first_weekday" && timing.weekday) {
    return firstWeekdayOfMonth(
      zonedNow.year,
      zonedNow.month,
      timing.weekday,
      time.hour,
      time.minute,
      timing.timezone,
    );
  }

  const dom = Math.min(Math.max(timing.day_of_month ?? 1, 1), 31);
  return zonedDateTimeToUtc(
    zonedNow.year,
    zonedNow.month,
    dom,
    time.hour,
    time.minute,
    timing.timezone,
  );
}

export function computeScheduledFor(
  timing: RuleTiming,
  customer: Customer,
  now = new Date(),
): Date {
  switch (timing.type) {
    case "immediate":
      return now;
    case "after_delay":
      return computeAfterDelaySchedule(timing, customer, now);
    case "weekly":
      return computeWeeklySchedule(timing, now);
    case "monthly":
      return computeMonthlySchedule(timing, now);
    default:
      return now;
  }
}

export function resolveScheduleStatus(
  timing: RuleTiming,
  scheduledFor: Date,
  now = new Date(),
): ScheduleStatus {
  if (scheduledFor.getTime() <= now.getTime()) {
    return "due_now";
  }
  if (timing.type === "weekly" || timing.type === "monthly") {
    return "scheduled";
  }
  return "not_due";
}

export function formatScheduleStatusLabel(status: ScheduleStatus): string {
  switch (status) {
    case "due_now":
      return "Due now";
    case "scheduled":
      return "Scheduled";
    case "not_due":
      return "Not due yet";
    default:
      return status;
  }
}

export function formatTimingLabel(
  timing: RuleTiming,
  status: ScheduleStatus,
): string {
  if (status === "due_now" && timing.type === "immediate") {
    return "Due now";
  }
  if (status === "due_now") {
    return timing.type === "weekly" || timing.type === "monthly"
      ? "Recurring — due now"
      : "Due now";
  }
  if (timing.type === "weekly" || timing.type === "monthly") {
    return "Recurring recommendation";
  }
  return formatScheduleStatusLabel(status);
}

export interface ActionScheduleMeta {
  scheduled_for: string;
  schedule_status: ScheduleStatus;
  timing_type: RuleTimingType;
  timing_label: string;
}

export function computeActionSchedule(
  rule: EditableAutomationRule,
  customer: Customer,
  now = new Date(),
): ActionScheduleMeta {
  const timing = rule.timing ?? createImmediateTiming();
  const scheduledFor = computeScheduledFor(timing, customer, now);
  const schedule_status = resolveScheduleStatus(timing, scheduledFor, now);

  return {
    scheduled_for: scheduledFor.toISOString(),
    schedule_status,
    timing_type: timing.type,
    timing_label: formatTimingLabel(timing, schedule_status),
  };
}

function isMissingValue(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function normalizeRuleTiming(timing: unknown): RuleTiming {
  if (!timing || typeof timing !== "object") {
    return createImmediateTiming();
  }

  const t = timing as RuleTiming;
  switch (t.type) {
    case "after_delay":
      return {
        type: "after_delay",
        delay_amount: isMissingValue(t.delay_amount)
          ? 1
          : Number(t.delay_amount),
        delay_unit: t.delay_unit === "business_days" ? "business_days" : "days",
        anchor_field: TIMING_ANCHOR_FIELDS.some((f) => f.value === t.anchor_field)
          ? t.anchor_field
          : "days_since_start",
      };
    case "weekly":
      return {
        type: "weekly",
        day_of_week: WEEKDAYS.includes(t.day_of_week) ? t.day_of_week : "Wednesday",
        time_of_day: t.time_of_day?.trim() || "10:00",
        timezone: t.timezone?.trim() ? t.timezone.trim() : DEFAULT_TIMEZONE,
      };
    case "monthly":
      return {
        type: "monthly",
        monthly_mode:
          t.monthly_mode === "first_weekday" ? "first_weekday" : "day_of_month",
        day_of_month: isMissingValue(t.day_of_month)
          ? 1
          : Number(t.day_of_month),
        weekday: WEEKDAYS.includes(t.weekday as Weekday)
          ? (t.weekday as Weekday)
          : "Monday",
        time_of_day: t.time_of_day?.trim() || "10:00",
        timezone: t.timezone?.trim() ? t.timezone.trim() : DEFAULT_TIMEZONE,
      };
    case "immediate":
    default:
      return createImmediateTiming();
  }
}

export function validateRuleTiming(timing: RuleTiming): string[] {
  const errors: string[] = [];

  switch (timing.type) {
    case "after_delay":
      if (!Number.isFinite(timing.delay_amount) || timing.delay_amount <= 0) {
        errors.push("Delay amount must be a positive number.");
      }
      if (!TIMING_ANCHOR_FIELDS.some((f) => f.value === timing.anchor_field)) {
        errors.push("Anchor field is required for after-delay timing.");
      }
      break;
    case "weekly":
      if (!WEEKDAYS.includes(timing.day_of_week)) {
        errors.push("Day of week is required for weekly timing.");
      }
      if (!parseTimeOfDay(timing.time_of_day)) {
        errors.push("Time of day is required (HH:mm) for weekly timing.");
      }
      if (!timing.timezone?.trim()) {
        errors.push("Timezone is required for weekly timing.");
      } else if (!isValidTimezone(timing.timezone.trim())) {
        errors.push(
          "Timezone must be a valid IANA timezone (e.g. Europe/Berlin).",
        );
      }
      break;
    case "monthly":
      if (!parseTimeOfDay(timing.time_of_day)) {
        errors.push("Time of day is required (HH:mm) for monthly timing.");
      }
      if (!timing.timezone?.trim()) {
        errors.push("Timezone is required for monthly timing.");
      } else if (!isValidTimezone(timing.timezone.trim())) {
        errors.push(
          "Timezone must be a valid IANA timezone (e.g. Europe/Berlin).",
        );
      }
      if (timing.monthly_mode === "day_of_month") {
        const dom = timing.day_of_month ?? 0;
        if (dom < 1 || dom > 31) {
          errors.push("Monthly day must be between 1 and 31.");
        }
      } else if (!timing.weekday || !WEEKDAYS.includes(timing.weekday)) {
        errors.push("Weekday is required for first-weekday monthly timing.");
      }
      break;
    default:
      break;
  }

  return errors;
}

export function isActionDueNow(item: {
  schedule_status: ScheduleStatus;
}): boolean {
  return item.schedule_status === "due_now";
}
