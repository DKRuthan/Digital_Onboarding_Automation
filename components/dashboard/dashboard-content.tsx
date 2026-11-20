"use client";

import Link from "next/link";
import { useMemo } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge, workflowStatusVariant } from "@/components/ui/badge";
import { useCustomerData } from "@/components/providers/customer-data-provider";
import { CustomerDataLoadingShell } from "@/components/ui/customer-data-loading-shell";
import { formatRuleConditions } from "@/lib/automation-rule-engine";
import { computeDashboardContactMetrics } from "@/lib/dashboard-contact-metrics";
import {
  displayContactEmailLabel,
  displayContactRole,
  isSequenceRow,
  triggerSequenceLabel,
} from "@/lib/action-queue-display";
import {
  displayLogContactEmailLabel,
  displayLogSource,
} from "@/lib/communication-log-display";
import { formatDateTime } from "@/lib/utils";

export function DashboardContent() {
  const {
    isCustomerDataHydrated,
    stats,
    customers,
    importedContacts,
    dataSource,
    actionQueue,
    automationRules,
    sequenceEnrollments,
    sendLogs,
  } = useCustomerData();

  const metrics = useMemo(
    () =>
      computeDashboardContactMetrics({
        customers,
        importedContacts,
        dataSource,
        enrollments: sequenceEnrollments ?? [],
        sendLogs,
        actionQueue,
      }),
    [customers, importedContacts, dataSource, sequenceEnrollments, sendLogs, actionQueue],
  );

  const recentActions = actionQueue.slice(0, 8);
  const recentLogs = sendLogs.slice(0, 6);
  const activeRules = automationRules.filter((rule) => rule.active);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Contact-first overview of journey health, review workload, and communication control."
      />

      <div className="space-y-8 p-6 lg:p-8">
        {!isCustomerDataHydrated ? (
          <CustomerDataLoadingShell />
        ) : (
          <>
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Contact metrics
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard
              label="Total Contacts"
              value={metrics.contact.totalContacts}
              hint="Derived contact emails across loaded accounts"
            />
            <StatCard
              label="Contacts in Sequence"
              value={metrics.contact.contactsInSequence}
              variant="info"
              hint="Active or paused enrollments by contact email"
            />
            <StatCard
              label="Contacts Cooling Active"
              value={metrics.contact.contactsCoolingActive}
              variant="warning"
              hint="Contact emails within the cooling window"
            />
            <StatCard
              label="Contacts with Data Quality Issues"
              value={metrics.contact.contactsWithDataQualityIssues}
              variant="warning"
              hint="Invalid emails or cross-account duplicates"
            />
            <StatCard
              label="Contact Actions Due Now"
              value={metrics.contact.contactActionsDueNow}
              variant="info"
              hint="Action Queue rows with schedule status due now"
            />
            <StatCard
              label="Unresolved Contact Emails"
              value={metrics.contact.unresolvedContactEmails}
              variant="warning"
              hint="Queue rows missing a resolved contact email"
            />
          </div>
        </section>

        {metrics.dataQualityWarning ? (
          <p
            role="note"
            className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            {metrics.dataQualityWarning}
          </p>
        ) : null}

        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Account context
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total Accounts"
              value={metrics.account.totalAccounts}
            />
            <StatCard
              label="Low Usage Accounts"
              value={metrics.account.lowUsageAccounts}
              variant="warning"
              hint="Usage below 30% of threshold"
            />
            <StatCard
              label="Renewal Risk Accounts"
              value={metrics.account.renewalRiskAccounts}
              variant="warning"
              hint="Renewal within 90 days with low usage"
            />
            <StatCard
              label="Accounts with Data Quality Issues"
              value={metrics.account.accountsWithDataQualityIssues}
              variant="warning"
            />
          </div>
          <p className="text-xs text-slate-500">
            {stats.actionsInQueue} total contact actions in queue (triggers +
            sequences).
          </p>
        </section>

        <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
          <Card className="xl:col-span-1">
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-slate-900">
                  Recent Contact Actions
                </h2>
                <Link
                  href="/action-queue"
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
                >
                  View all →
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-slate-100">
                {recentActions.map((item) => {
                  const contactLabel = displayContactEmailLabel(item);
                  const contactResolved =
                    contactLabel !== "Contact email not resolved";
                  const role = displayContactRole(item);

                  return (
                    <li
                      key={item.id}
                      className="flex items-start justify-between gap-4 px-5 py-3"
                    >
                      <div className="min-w-0">
                        <p
                          className={
                            contactResolved
                              ? "font-medium text-slate-900"
                              : "font-medium text-amber-800"
                          }
                        >
                          {contactLabel}
                        </p>
                        <p className="text-xs text-slate-500">
                          {role ?? "—"} · {item.customer_name}
                        </p>
                        <p className="mt-0.5 text-sm text-slate-500">
                          {isSequenceRow(item) ? "Sequence" : "Trigger"}:{" "}
                          {triggerSequenceLabel(item)}
                        </p>
                      </div>
                      <Badge variant={workflowStatusVariant(item.workflow_status)}>
                        {item.workflow_status}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          <Card className="xl:col-span-1">
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-slate-900">
                  Recent Communication Logs
                </h2>
                <Link
                  href="/send-logs"
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
                >
                  View all →
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-slate-100">
                {recentLogs.map((log) => {
                  const contactLabel = displayLogContactEmailLabel(log);
                  const contactResolved =
                    contactLabel !== "Contact email not resolved";

                  return (
                    <li
                      key={log.id}
                      className="flex items-start justify-between gap-4 px-5 py-3"
                    >
                      <div className="min-w-0">
                        <p
                          className={
                            contactResolved
                              ? "font-medium text-slate-900"
                              : "font-medium text-amber-800"
                          }
                        >
                          {contactLabel}
                        </p>
                        <p className="text-xs text-slate-500">
                          {log.customer_name}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {formatDateTime(log.date)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Badge variant="muted">{displayLogSource(log)}</Badge>
                        <Badge variant="info">{log.status}</Badge>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          <Card className="xl:col-span-1">
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-slate-900">
                  Activity Triggers
                </h2>
                <Link
                  href="/automations"
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
                >
                  Manage →
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-slate-500">
                {activeRules.length} active trigger
                {activeRules.length === 1 ? "" : "s"} monitoring contact
                journey signals.
              </p>
              <ul className="space-y-3">
                {activeRules.map((rule) => (
                  <li
                    key={rule.id}
                    className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5"
                  >
                    <p className="text-sm font-medium text-slate-900">
                      {rule.name}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      IF {formatRuleConditions(rule)}
                    </p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
          </>
        )}
      </div>
    </>
  );
}
