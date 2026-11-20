import type { EditableAutomationRule } from "@/lib/types";
import { getRuleConditionGroupsDisplay } from "@/lib/automation-rule-engine";

export function RuleConditionsDisplay({ rule }: { rule: EditableAutomationRule }) {
  const display = getRuleConditionGroupsDisplay(rule);

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        IF {display.groupLogicSummary}
      </p>

      {display.groups.map((group, groupIndex) => (
        <div key={`${rule.id}-${group.title}`}>
          {groupIndex > 0 && (
            <p className="my-2 text-center text-xs font-bold uppercase tracking-wide text-indigo-500">
              {display.groupLogic}
            </p>
          )}

          <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
            <p className="text-xs font-semibold text-slate-700">{group.title}</p>
            <ul className="mt-1 space-y-1">
              {group.conditionLabels.map((label, conditionIndex) => (
                <li key={`${group.title}-${label}`} className="text-sm text-slate-700">
                  {conditionIndex > 0 && (
                    <span className="mr-2 text-xs font-bold uppercase text-slate-400">
                      {group.logic}
                    </span>
                  )}
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ))}
    </div>
  );
}
