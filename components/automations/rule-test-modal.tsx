"use client";

import type { EditableAutomationRule, RuleTestMatch } from "@/lib/types";
import {
  formatScheduleStatusLabel,
  formatScheduledForDisplay,
} from "@/lib/automation-rule-scheduling";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge, scheduleStatusVariant } from "@/components/ui/badge";
import { RulePlainEnglishSummary } from "./rule-plain-english-summary";
import { RuleTimingSummary } from "./rule-timing-summary";

interface RuleTestModalProps {
  open: boolean;
  rule: EditableAutomationRule | null;
  matches: RuleTestMatch[];
  onClose: () => void;
}

export function RuleTestModal({
  open,
  rule,
  matches,
  onClose,
}: RuleTestModalProps) {
  if (!rule) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Test Trigger: ${rule.name}`}
      size="xl"
      footer={
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Preview only — no emails are sent. This shows which customers match
          the rule against current session data.
        </div>

        <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
          Test Trigger shows condition and timing matches only. Active status and
          cooldown may affect the final Action Queue.
        </div>

        <RulePlainEnglishSummary rule={rule} variant="panel" />

        <RuleTimingSummary timing={rule.timing} variant="panel" />

        <p className="text-sm text-slate-900">
          <span className="font-semibold">{matches.length}</span> customer
          {matches.length === 1 ? "" : "s"} match this trigger.
        </p>

        {matches.length === 0 ? (
          <p className="text-sm text-slate-500">
            No customers match with the current thresholds and customer data.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                    Customer
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                    Action
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                    Recipient
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                    Template
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                    Scheduled for
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                    Schedule status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {matches.map((match) => (
                  <tr key={match.customer_id} className="hover:bg-slate-50/80">
                    <td className="px-3 py-2 font-medium text-slate-900">
                      {match.customer_name}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {match.recommended_action}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {match.recipient}
                    </td>
                    <td className="px-3 py-2">
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                        {match.template}
                      </code>
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {formatScheduledForDisplay(match.scheduled_for)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={scheduleStatusVariant(match.schedule_status)}>
                        {formatScheduleStatusLabel(match.schedule_status)}
                      </Badge>
                      <p className="mt-1 text-xs text-slate-500">
                        {match.timing_label}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}
