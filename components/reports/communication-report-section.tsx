import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { CommunicationReport } from "@/lib/reports-snapshot";
import { BreakdownPanel, BreakdownRow } from "./report-breakdown";

type CommunicationReportSectionProps = {
  report: CommunicationReport;
};

export function CommunicationReportSection({
  report,
}: CommunicationReportSectionProps) {
  const hasLogs = report.totalLogs > 0;

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold text-slate-900">Communication</h2>
        <p className="mt-1 text-sm text-slate-600">
          Contact-first communication history across demo seed logs, simulated
          ledger rows, tests, dry runs, and internal alerts. Demo Delivered rows
          are not counted as actual provider sends.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {!hasLogs ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
            No communication logs available yet.
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <StatCard label="Total Logs" value={report.totalLogs} />
              <StatCard
                label="Simulated Sent"
                value={report.simulatedSentCount}
                variant="warning"
              />
              <StatCard
                label="Actual Sent (Provider)"
                value={report.actualSentCount}
                variant="info"
              />
              <StatCard
                label="Not Sent"
                value={report.notSentCount}
                variant="default"
              />
              <StatCard
                label="Failed"
                value={report.failedCount}
                variant={report.failedCount > 0 ? "warning" : "default"}
              />
              <StatCard
                label="Contact Resolved Logs"
                value={report.contactResolvedLogs}
                variant="info"
              />
              <StatCard
                label="Unresolved Contact Logs"
                value={report.unresolvedContactLogs}
                variant={
                  report.unresolvedContactLogs > 0 ? "warning" : "default"
                }
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <RecordBreakdown title="By Source" counts={report.bySource} />
              <RecordBreakdown title="By Status" counts={report.byStatus} />
              <RecordBreakdown title="By Send Mode" counts={report.bySendMode} />
              <RecordBreakdown title="By Template" counts={report.byTemplate} />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function RecordBreakdown({
  title,
  counts,
}: {
  title: string;
  counts: Record<string, number>;
}) {
  const rows = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));

  return (
    <BreakdownPanel title={title}>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">No data</p>
      ) : (
        rows.map(([label, value]) => (
          <BreakdownRow key={label} label={label} value={value} />
        ))
      )}
    </BreakdownPanel>
  );
}
