"use client";

import type {
  ConditionLogic,
  EditableAutomationRule,
  RuleCondition,
  RuleConditionGroup,
} from "@/lib/types";
import {
  CONDITION_OPERATORS,
  RULE_CONDITION_FIELDS,
  createConditionGroup,
  createEmptyCondition,
} from "@/lib/automation-rule-definitions";
import { Button } from "@/components/ui/button";

interface GroupedConditionsEditorProps {
  rule: EditableAutomationRule;
  onChange: (patch: Partial<EditableAutomationRule>) => void;
}

export function GroupedConditionsEditor({
  rule,
  onChange,
}: GroupedConditionsEditorProps) {
  function updateGroupLogic(groupLogic: ConditionLogic) {
    onChange({ group_logic: groupLogic });
  }

  function updateGroup(groupIndex: number, patch: Partial<RuleConditionGroup>) {
    const condition_groups = rule.condition_groups.map((group, index) =>
      index === groupIndex ? { ...group, ...patch } : group,
    );
    onChange({ condition_groups });
  }

  function updateCondition(
    groupIndex: number,
    conditionIndex: number,
    patch: Partial<RuleCondition>,
  ) {
    const group = rule.condition_groups[groupIndex];
    const conditions = group.conditions.map((condition, index) =>
      index === conditionIndex ? { ...condition, ...patch } : condition,
    );
    updateGroup(groupIndex, { conditions });
  }

  function addCondition(groupIndex: number) {
    const group = rule.condition_groups[groupIndex];
    updateGroup(groupIndex, {
      conditions: [...group.conditions, createEmptyCondition()],
    });
  }

  function removeCondition(groupIndex: number, conditionIndex: number) {
    const group = rule.condition_groups[groupIndex];
    if (group.conditions.length <= 1) return;
    updateGroup(groupIndex, {
      conditions: group.conditions.filter((_, index) => index !== conditionIndex),
    });
  }

  function addGroup() {
    onChange({
      condition_groups: [
        ...rule.condition_groups,
        createConditionGroup([createEmptyCondition()], "AND"),
      ],
    });
  }

  function removeGroup(groupIndex: number) {
    if (rule.condition_groups.length <= 1) return;
    onChange({
      condition_groups: rule.condition_groups.filter(
        (_, index) => index !== groupIndex,
      ),
    });
  }

  function fieldType(field: RuleCondition["field"]) {
    return RULE_CONDITION_FIELDS.find((f) => f.value === field)?.type ?? "enum";
  }

  function fieldOptions(field: RuleCondition["field"]) {
    return RULE_CONDITION_FIELDS.find((f) => f.value === field)?.options ?? [];
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">Condition groups</p>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Match groups using
          <select
            className={inputClass}
            value={rule.group_logic}
            onChange={(e) => updateGroupLogic(e.target.value as ConditionLogic)}
          >
            <option value="AND">ALL groups (AND)</option>
            <option value="OR">ANY group (OR)</option>
          </select>
        </label>
      </div>

      {rule.condition_groups.map((group, groupIndex) => (
        <div key={group.id}>
          {groupIndex > 0 && (
            <p className="my-3 text-center text-xs font-bold uppercase tracking-wide text-indigo-500">
              {rule.group_logic}
            </p>
          )}

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-800">
                Condition Group {groupIndex + 1}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  Match conditions in this group
                  <select
                    className={inputClass}
                    value={group.logic}
                    onChange={(e) =>
                      updateGroup(groupIndex, {
                        logic: e.target.value as ConditionLogic,
                      })
                    }
                  >
                    <option value="AND">ALL conditions (AND)</option>
                    <option value="OR">ANY condition (OR)</option>
                  </select>
                </label>
                <Button
                  variant="ghost"
                  disabled={rule.condition_groups.length <= 1}
                  onClick={() => removeGroup(groupIndex)}
                >
                  Remove group
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              {group.conditions.map((condition, conditionIndex) => (
                <div key={condition.id}>
                  {conditionIndex > 0 && (
                    <p className="mb-2 text-center text-xs font-bold uppercase tracking-wide text-slate-400">
                      {group.logic}
                    </p>
                  )}

                  <div className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                    <select
                      className={inputClass}
                      value={condition.field}
                      onChange={(e) =>
                        updateCondition(groupIndex, conditionIndex, {
                          field: e.target.value as RuleCondition["field"],
                          value: "",
                        })
                      }
                    >
                      {RULE_CONDITION_FIELDS.map((field) => (
                        <option key={field.value} value={field.value}>
                          {field.label}
                        </option>
                      ))}
                    </select>
                    <select
                      className={inputClass}
                      value={condition.operator}
                      onChange={(e) =>
                        updateCondition(groupIndex, conditionIndex, {
                          operator: e.target.value as RuleCondition["operator"],
                        })
                      }
                    >
                      {CONDITION_OPERATORS.filter((operator) =>
                        operator.forTypes.includes(fieldType(condition.field)),
                      ).map((operator) => (
                        <option key={operator.value} value={operator.value}>
                          {operator.label}
                        </option>
                      ))}
                    </select>
                    {fieldOptions(condition.field).length > 0 ? (
                      <select
                        className={inputClass}
                        value={condition.value}
                        onChange={(e) =>
                          updateCondition(groupIndex, conditionIndex, {
                            value: e.target.value,
                          })
                        }
                      >
                        <option value="">Select…</option>
                        {fieldOptions(condition.field).map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className={inputClass}
                        type="number"
                        value={condition.value}
                        onChange={(e) =>
                          updateCondition(groupIndex, conditionIndex, {
                            value: e.target.value,
                          })
                        }
                        placeholder="Value"
                      />
                    )}
                    <Button
                      variant="ghost"
                      disabled={group.conditions.length <= 1}
                      onClick={() => removeCondition(groupIndex, conditionIndex)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <Button
              variant="outline"
              className="mt-3"
              onClick={() => addCondition(groupIndex)}
            >
              Add condition to this group
            </Button>
          </div>
        </div>
      ))}

      <Button variant="outline" onClick={addGroup}>
        Add condition group
      </Button>
    </div>
  );
}

const inputClass =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
