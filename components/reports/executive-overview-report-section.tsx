import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { ExecutiveOverviewReport } from "@/lib/reports-snapshot";

type ExecutiveOverviewReportSectionProps = {
  report: ExecutiveOverviewReport;
  dataSource: "demo" | "upload";
};

export function ExecutiveOverviewReportSection({
  report,
  dataSource,
}: ExecutiveOverviewReportSectionProps) {
  const dataSourceLabel =
    dataSource === "upload" ? "Uploaded import" : "Demo data";

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold text-slate-900">
          Executive Overview
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Contact-first operational summary — snapshot/demo reporting, not
          production BI.
        </p>
        <dl className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
          <div>
            <dt className="font-medium text-slate-700">Data source</dt>
            <dd>{dataSourceLabel}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-700">Persistence</dt>
            <dd>Local browser only</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-700">Production database</dt>
            <dd>Not connected</dd>
          </div>
        </dl>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Accounts" value={report.totalAccounts} />
        <StatCard
          label="Total Contacts"
          value={report.totalContacts}
          variant="info"
        />
        <StatCard
          label="Contacts in Sequence"
          value={report.contactsInSequence}
          variant="info"
        />
        <StatCard
          label="Contacts Cooling Active"
          value={report.contactsCoolingActive}
          variant="warning"
        />
        <StatCard
          label="Actions Due Now"
          value={report.actionsDueNow}
          variant="info"
        />
        <StatCard
          label="Communication Logs"
          value={report.totalCommunicationLogs}
        />
        <StatCard
          label="Account Data Quality Warnings"
          value={report.accountDataQualityWarnings}
          variant={report.accountDataQualityWarnings > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Account Data Quality Blockers"
          value={report.accountDataQualityBlockers}
          variant={report.accountDataQualityBlockers > 0 ? "warning" : "default"}
        />
      </CardContent>
    </Card>
  );
}
