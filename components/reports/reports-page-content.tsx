"use client";

import { useMemo } from "react";
import { useCan } from "@/components/auth/permissions-provider";
import { PageHeader } from "@/components/layout/page-header";
import { useCustomerData } from "@/components/providers/customer-data-provider";
import { CustomerDataLoadingShell } from "@/components/ui/customer-data-loading-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { exportReportsSnapshotCsv } from "@/lib/reports-export";
import { buildReportsSnapshot } from "@/lib/reports-snapshot";
import { formatDateTime } from "@/lib/utils";
import { ExecutiveOverviewReportSection } from "./executive-overview-report-section";
import { ImportQualityReportSection } from "./import-quality-report-section";
import { ContactJourneyReportSection } from "./contact-journey-report-section";
import { ActionQueueReportSection } from "./action-queue-report-section";
import { CommunicationReportSection } from "./communication-report-section";
import { SequenceReportSection } from "./sequence-report-section";
import { AccountContextReportSection } from "./account-context-report-section";
import { AuditLogsReportSection } from "./audit-logs-report-section";
import { gateByPermission } from "@/lib/auth/permission-ui";
import { recordClientAuditEvent } from "@/lib/audit/client-audit";

const READ_ONLY_BANNER =
  "This report shows the customers, queue, and communication logs currently loaded in this browser.";

export function ReportsPageContent() {
  const {
    isCustomerDataHydrated,
    customers,
    importedContacts,
    dataSource,
    actionQueue,
    sendLogs,
    emailSequences,
    sequenceEnrollments,
    automationRules,
    lastValidation,
  } = useCustomerData();

  const snapshot = useMemo(
    () =>
      buildReportsSnapshot({
        customers,
        importedContacts,
        dataSource,
        actionQueue,
        sendLogs,
        emailSequences,
        enrollments: sequenceEnrollments ?? [],
        rules: automationRules,
        lastValidation,
      }),
    [
      customers,
      importedContacts,
      dataSource,
      actionQueue,
      sendLogs,
      emailSequences,
      sequenceEnrollments,
      automationRules,
      lastValidation,
    ],
  );

  const hasReportData = customers.length > 0;
  const dataSourceLabel =
    dataSource === "upload" ? "Uploaded import" : "Demo data";
  const canExport = useCan("export_reports");
  const exportGate = gateByPermission(canExport, "export_reports");

  function handleExportReportsCsv() {
    exportReportsSnapshotCsv(snapshot);
    recordClientAuditEvent({
      action: "export.reports_csv",
      targetType: "reports_snapshot",
      metadata: {
        account_count: snapshot.executiveOverview.totalAccounts,
        contact_count: snapshot.executiveOverview.totalContacts,
      },
    });
  }

  return (
    <>
      <PageHeader
        title="Reports"
        description="Read-only contact-first reporting across imports, contacts, action queue, communication logs, sequences, and account context."
      >
        <Button
          variant="outline"
          disabled={exportGate.disabled}
          title={
            exportGate.disabled
              ? exportGate.title
              : "Downloads the current read-only reports snapshot."
          }
          onClick={handleExportReportsCsv}
        >
          Export Reports CSV
        </Button>
      </PageHeader>

      <div className="space-y-6 p-6 lg:p-8">
        <div
          role="note"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          {READ_ONLY_BANNER}
        </div>

        {!isCustomerDataHydrated ? (
          <CustomerDataLoadingShell label="Loading local demo state…" />
        ) : !hasReportData ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
            No report data available yet. Use Demo Data or upload customer data
            to populate reports.
          </div>
        ) : (
          <>
            <Card>
              <CardHeader>
                <h2 className="text-sm font-semibold text-slate-900">
                  Snapshot status
                </h2>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <SnapshotStat
                  label="Generated at"
                  value={formatDateTime(snapshot.generatedAt)}
                  isText
                />
                <SnapshotStat
                  label="Data source"
                  value={dataSourceLabel}
                  isText
                />
                <SnapshotStat
                  label="Persistence"
                  value="Local browser only"
                  isText
                />
                <SnapshotStat
                  label="Production database"
                  value="Not connected"
                  isText
                />
                <SnapshotStat
                  label="Total accounts"
                  value={snapshot.executiveOverview.totalAccounts}
                />
                <SnapshotStat
                  label="Total contacts"
                  value={snapshot.executiveOverview.totalContacts}
                />
                <SnapshotStat
                  label="Data gaps documented"
                  value={snapshot.dataGaps.length}
                />
              </CardContent>
            </Card>

            <ExecutiveOverviewReportSection
              report={snapshot.executiveOverview}
              dataSource={dataSource}
            />

            <ImportQualityReportSection report={snapshot.importQuality} />

            <ContactJourneyReportSection report={snapshot.contactJourney} />

            <ActionQueueReportSection report={snapshot.actionQueue} />

            <CommunicationReportSection report={snapshot.communication} />

            <SequenceReportSection report={snapshot.sequences} />

            <AccountContextReportSection report={snapshot.accountContext} />
          </>
        )}

        <AuditLogsReportSection />
      </div>
    </>
  );
}

function SnapshotStat({
  label,
  value,
  isText = false,
}: {
  label: string;
  value: number | string;
  isText?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p
        className={`font-medium text-slate-900 ${isText ? "text-sm" : "text-lg"}`}
      >
        {value}
      </p>
    </div>
  );
}
