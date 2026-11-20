"use client";

import type { EditableAutomationRule, RuleTiming, Weekday } from "@/lib/types";
import {
  DEFAULT_TIMEZONE,
  DELAY_UNITS,
  MONTHLY_MODES,
  TIMING_ANCHOR_FIELDS,
  TIMING_TYPES,
  WEEKDAYS,
  createAfterDelayTiming,
  createImmediateTiming,
  createMonthlyTiming,
  createWeeklyTiming,
} from "@/lib/automation-rule-scheduling";
import { RuleTimingSummary } from "./rule-timing-summary";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

interface RuleTimingEditorProps {
  rule: EditableAutomationRule;
  onChange: (patch: Partial<EditableAutomationRule>) => void;
}

export function RuleTimingEditor({ rule, onChange }: RuleTimingEditorProps) {
  const timing = rule.timing;

  function setTiming(next: RuleTiming) {
    onChange({ timing: next });
  }

  function handleTypeChange(type: RuleTiming["type"]) {
    switch (type) {
      case "immediate":
        setTiming(createImmediateTiming());
        break;
      case "after_delay":
        setTiming(createAfterDelayTiming(3, "days", "days_since_start"));
        break;
      case "weekly":
        setTiming(createWeeklyTiming("Wednesday", "10:00", DEFAULT_TIMEZONE));
        break;
      case "monthly":
        setTiming(
          createMonthlyTiming(
            "day_of_month",
            1,
            "Monday",
            "10:00",
            DEFAULT_TIMEZONE,
          ),
        );
        break;
      default:
        setTiming(createImmediateTiming());
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Timing</h3>
        <p className="mt-1 text-xs text-slate-500">
          Controls when a matching action appears in the Action Queue. Scheduling
          does not send emails automatically.
        </p>
      </div>

      <Field label="Timing type">
        <select
          className={inputClass}
          value={timing.type}
          onChange={(e) =>
            handleTypeChange(e.target.value as RuleTiming["type"])
          }
        >
          {TIMING_TYPES.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </select>
      </Field>

      {timing.type === "after_delay" && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Delay amount">
            <input
              className={inputClass}
              type="number"
              min={1}
              value={timing.delay_amount}
              onChange={(e) =>
                setTiming({
                  ...timing,
                  delay_amount: Number(e.target.value),
                })
              }
            />
          </Field>
          <Field label="Delay unit">
            <select
              className={inputClass}
              value={timing.delay_unit}
              onChange={(e) =>
                setTiming({
                  ...timing,
                  delay_unit: e.target.value as typeof timing.delay_unit,
                })
              }
            >
              {DELAY_UNITS.map((unit) => (
                <option key={unit.value} value={unit.value}>
                  {unit.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Anchor field">
            <select
              className={inputClass}
              value={timing.anchor_field}
              onChange={(e) =>
                setTiming({
                  ...timing,
                  anchor_field: e.target.value as typeof timing.anchor_field,
                })
              }
            >
              {TIMING_ANCHOR_FIELDS.map((field) => (
                <option key={field.value} value={field.value}>
                  {field.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}

      {timing.type === "weekly" && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Day of week">
            <select
              className={inputClass}
              value={timing.day_of_week}
              onChange={(e) =>
                setTiming({
                  ...timing,
                  day_of_week: e.target.value as Weekday,
                })
              }
            >
              {WEEKDAYS.map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Time of day">
            <input
              className={inputClass}
              type="time"
              value={timing.time_of_day}
              onChange={(e) =>
                setTiming({ ...timing, time_of_day: e.target.value })
              }
            />
          </Field>
          <Field label="Timezone">
            <input
              className={inputClass}
              value={timing.timezone}
              onChange={(e) =>
                setTiming({ ...timing, timezone: e.target.value })
              }
              placeholder={DEFAULT_TIMEZONE}
            />
          </Field>
        </div>
      )}

      {timing.type === "monthly" && (
        <div className="space-y-4">
          <Field label="Monthly mode">
            <select
              className={inputClass}
              value={timing.monthly_mode}
              onChange={(e) =>
                setTiming({
                  ...timing,
                  monthly_mode: e.target.value as typeof timing.monthly_mode,
                })
              }
            >
              {MONTHLY_MODES.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            {timing.monthly_mode === "day_of_month" ? (
              <Field label="Day of month">
                <input
                  className={inputClass}
                  type="number"
                  min={1}
                  max={31}
                  value={timing.day_of_month ?? 1}
                  onChange={(e) =>
                    setTiming({
                      ...timing,
                      day_of_month: Number(e.target.value),
                    })
                  }
                />
              </Field>
            ) : (
              <Field label="Weekday">
                <select
                  className={inputClass}
                  value={timing.weekday ?? "Monday"}
                  onChange={(e) =>
                    setTiming({
                      ...timing,
                      weekday: e.target.value as Weekday,
                    })
                  }
                >
                  {WEEKDAYS.map((day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Time of day">
              <input
                className={inputClass}
                type="time"
                value={timing.time_of_day}
                onChange={(e) =>
                  setTiming({ ...timing, time_of_day: e.target.value })
                }
              />
            </Field>
            <Field label="Timezone">
              <input
                className={inputClass}
                value={timing.timezone}
                onChange={(e) =>
                  setTiming({ ...timing, timezone: e.target.value })
                }
                placeholder={DEFAULT_TIMEZONE}
              />
            </Field>
          </div>
        </div>
      )}

      <RuleTimingSummary timing={timing} variant="panel" />
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label>
      <span className="mb-1 block text-xs font-medium text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}
