"use client";

import { useState } from "react";
import { useCan } from "@/components/auth/permissions-provider";
import type { EditableAutomationRule } from "@/lib/types";
import { useCustomerData } from "@/components/providers/customer-data-provider";
import {
  cloneAutomationRule,
  createEmptyRule,
} from "@/lib/automation-rule-definitions";
import { RuleConditionsDisplay } from "./rule-conditions-display";
import { RulePlainEnglishSummary } from "./rule-plain-english-summary";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Toast } from "@/components/ui/toast";
import { RuleEditModal } from "./rule-edit-modal";
import { RuleTestModal } from "./rule-test-modal";
import { formatTimingCardLabel } from "@/lib/automation-rule-scheduling";
import { exportAutomationRulesJson } from "@/lib/session-export";
import { gateByPermission } from "@/lib/auth/permission-ui";
import { recordClientAuditEvent } from "@/lib/audit/client-audit";

type RuleEditMode = "create" | "edit";

export function AutomationsPageContent() {
  const {
    automationRules,
    saveAutomationRule,
    duplicateAutomationRuleById,
    toggleAutomationRuleActive,
    resetAutomationRulesToDefaults,
    getRuleMatchCount,
    testAutomationRuleById,
  } = useCustomerData();

  const [editRule, setEditRule] = useState<EditableAutomationRule | null>(null);
  const [editMode, setEditMode] = useState<RuleEditMode>("edit");
  const [testRule, setTestRule] = useState<EditableAutomationRule | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const activeCount = automationRules.filter((r) => r.active).length;
  const canCreate = useCan("create_triggers");
  const canEdit = useCan("edit_triggers");
  const canExport = useCan("export_reports");
  const createGate = gateByPermission(canCreate, "create_triggers");
  const editGate = gateByPermission(canEdit, "edit_triggers");
  const exportGate = gateByPermission(canExport, "export_reports");

  function handleAddTrigger() {
    setEditMode("create");
    setEditRule(createEmptyRule());
  }

  function handleEditRule(rule: EditableAutomationRule) {
    setEditMode("edit");
    setEditRule(cloneAutomationRule(rule));
  }

  function handleSaveRule(rule: EditableAutomationRule) {
    saveAutomationRule(rule);
    recordClientAuditEvent({
      action: editMode === "create" ? "trigger.create" : "trigger.edit",
      targetType: "automation_rule",
      targetId: rule.id,
      metadata: { trigger_name: rule.name, active: rule.active },
    });
    if (editMode === "create") {
      setToastMessage("Trigger saved inactive. Enable it when ready.");
    }
  }

  function handleCloseEditModal() {
    setEditRule(null);
    setEditMode("edit");
  }

  function handleResetToDefaults() {
    if (
      window.confirm(
        "Reset all activity triggers to the default 7 triggers? This clears locally saved trigger changes in this browser.",
      )
    ) {
      resetAutomationRulesToDefaults();
      recordClientAuditEvent({
        action: "trigger.reset_defaults",
        targetType: "automation_rule",
      });
    }
  }

  function handleDuplicateRule(ruleId: string) {
    duplicateAutomationRuleById(ruleId);
    recordClientAuditEvent({
      action: "trigger.duplicate",
      targetType: "automation_rule",
      targetId: ruleId,
    });
  }

  function handleToggleRule(rule: EditableAutomationRule) {
    toggleAutomationRuleActive(rule.id);
    recordClientAuditEvent({
      action: rule.active ? "trigger.disable" : "trigger.enable",
      targetType: "automation_rule",
      targetId: rule.id,
      metadata: { trigger_name: rule.name },
    });
  }

  function handleTestRule(rule: EditableAutomationRule) {
    setTestRule(rule);
    recordClientAuditEvent({
      action: "trigger.test",
      targetType: "automation_rule",
      targetId: rule.id,
      metadata: { trigger_name: rule.name },
    });
  }

  function handleExportTriggers() {
    exportAutomationRulesJson(automationRules);
    recordClientAuditEvent({
      action: "export.triggers_json",
      targetType: "automation_rule",
      metadata: { trigger_count: automationRules.length },
    });
  }

  return (
    <>
      <PageHeader
        title="Activity Triggers"
        description="Edit activity triggers, test matches against current customer data, and control which actions enter the review workbench."
      />

      <div className="flex flex-col gap-3 border-b border-slate-200 bg-white px-6 py-3 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600">
            {activeCount} of {automationRules.length} triggers active · Triggers
            are saved locally in this browser · Editing does not send emails.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              disabled={createGate.disabled}
              title={createGate.title}
              onClick={handleAddTrigger}
            >
              Add Trigger
            </Button>
            <Button
              variant="outline"
              disabled={exportGate.disabled}
              title={exportGate.title}
              onClick={handleExportTriggers}
            >
              Export Activity Triggers JSON
            </Button>
            <Button
              variant="outline"
              disabled={editGate.disabled}
              title={editGate.title}
              onClick={handleResetToDefaults}
            >
              Reset to default triggers
            </Button>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Create custom triggers safely. New triggers are saved inactive by
          default.
        </p>
        {toastMessage && (
          <Toast
            message={toastMessage}
            variant="success"
            onDismiss={() => setToastMessage(null)}
          />
        )}
      </div>

      <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3 lg:p-8">
        {automationRules.map((rule) => {
          const matchCount = getRuleMatchCount(rule.id);

          return (
          <Card
            key={rule.id}
            className={`flex flex-col ${rule.active ? "" : "opacity-80"}`}
          >
            <CardContent className="flex flex-1 flex-col gap-4 pt-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {rule.name}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {rule.description}
                  </p>
                </div>
                <Badge variant={rule.active ? "success" : "muted"}>
                  {rule.active ? "Active" : "Inactive"}
                </Badge>
              </div>

              <div
                className={`rounded-lg px-4 py-3 text-sm ${
                  rule.active
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border border-slate-200 bg-slate-50 text-slate-700"
                }`}
              >
                {rule.active ? (
                  <>
                    Currently matches{" "}
                    <span className="font-semibold">{matchCount}</span> customer
                    {matchCount === 1 ? "" : "s"}
                  </>
                ) : (
                  <>
                    Inactive — would match{" "}
                    <span className="font-semibold">{matchCount}</span> customer
                    {matchCount === 1 ? "" : "s"} if enabled
                  </>
                )}
              </div>

              <div className="space-y-3">
                <div className="rounded-lg bg-slate-50 px-4 py-3">
                  <RuleConditionsDisplay rule={rule} />
                  <div className="mt-3">
                    <RulePlainEnglishSummary rule={rule} />
                  </div>
                </div>
                <div className="rounded-lg bg-indigo-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-400">
                    THEN
                  </p>
                  <p className="mt-1 text-sm text-indigo-900">
                    {rule.recommendedAction}
                  </p>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-2 text-xs text-slate-500">
                <div>
                  <dt className="font-medium text-slate-400">Channel</dt>
                  <dd className="text-slate-700">{rule.channel}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-400">Recipient</dt>
                  <dd className="text-slate-700">{rule.recipientType}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-400">Priority</dt>
                  <dd className="text-slate-700">{rule.priority}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-400">Cooldown</dt>
                  <dd className="text-slate-700">{rule.cooldownDays} days</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="font-medium text-slate-400">Timing</dt>
                  <dd className="text-slate-700">
                    {formatTimingCardLabel(rule.timing)}
                  </dd>
                </div>
              </dl>

              <div className="mt-auto space-y-3 border-t border-slate-100 pt-3">
                <p className="text-xs text-slate-500">
                  Template:{" "}
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
                    {rule.template}
                  </code>
                  {rule.requiresApproval && (
                    <span className="ml-2 text-slate-400">· Requires approval</span>
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={editGate.disabled}
                    title={editGate.title}
                    onClick={() => handleEditRule(rule)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    disabled={editGate.disabled}
                    title={editGate.title}
                    onClick={() => handleDuplicateRule(rule.id)}
                  >
                    Duplicate
                  </Button>
                  <Button
                    variant="outline"
                    disabled={editGate.disabled}
                    title={editGate.title}
                    onClick={() => handleToggleRule(rule)}
                  >
                    {rule.active ? "Disable" : "Enable"}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={editGate.disabled}
                    title={editGate.title}
                    onClick={() => handleTestRule(rule)}
                  >
                    Test Trigger
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
          );
        })}
      </div>

      <RuleEditModal
        key={editRule?.id ?? "closed"}
        open={editRule !== null}
        mode={editMode}
        rule={editRule}
        onClose={handleCloseEditModal}
        onSave={handleSaveRule}
      />

      <RuleTestModal
        open={testRule !== null}
        rule={testRule}
        matches={testRule ? testAutomationRuleById(testRule.id) : []}
        onClose={() => setTestRule(null)}
      />
    </>
  );
}
