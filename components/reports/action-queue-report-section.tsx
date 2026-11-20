import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { ActionQueueReport } from "@/lib/reports-snapshot";

type ActionQueueReportSectionProps = {
  report: ActionQueueReport;
};

const WORKFLOW_ROWS = [
  { key: "needsReview", label: "Needs Review" },
  { key: "previewed", label: "Previewed" },
  { key: "testSent", label: "Test Sent" },
  { key: "approved", label: "Approved" },
  { key: "skipped", label: "Skipped" },
  { key: "blocked", label: "Blocked" },
] as const;

export function ActionQueueReportSection({
  report,
}: ActionQueueReportSectionProps) {
  const hasQueueItems = report.totalQueueItems > 0;

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold text-slate-900">Action Queue</h2>
        <p className="mt-1 text-sm text-slate-600">
          Review workload and send-readiness report across trigger and sequence
          actions.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {!hasQueueItems ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
            No action queue items available yet. Refresh Action Queue or load
            demo data.
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Total Queue Items" value={report.totalQueueItems} />
              <StatCard
                label="Needs Review"
                value={report.needsReview}
                variant="info"
              />
              <StatCard label="Previewed" value={report.previewed} />
              <StatCard label="Test Sent" value={report.testSent} />
              <StatCard label="Approved" value={report.approved} variant="success" />
              <StatCard label="Skipped" value={report.skipped} />
              <StatCard
                label="Blocked"
                value={report.blocked}
                variant={report.blocked > 0 ? "warning" : "default"}
              />
              <StatCard
                label="Due Now"
                value={report.dueNow}
                variant="info"
              />
              <StatCard
                label="Conflict Blocked"
                value={report.conflictBlocked}
                variant={report.conflictBlocked > 0 ? "warning" : "default"}
              />
              <StatCard
                label="Unresolved Contact Emails"
                value={report.unresolvedContactEmails}
                variant={
                  report.unresolvedContactEmails > 0 ? "warning" : "default"
                }
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <BreakdownPanel title="Workflow status">
                {WORKFLOW_ROWS.map((row) => (
                  <BreakdownRow
                    key={row.key}
                    label={row.label}
                    value={report[row.key]}
                  />
                ))}
              </BreakdownPanel>

              <BreakdownPanel title="Source breakdown">
                <BreakdownRow
                  label="Trigger actions"
                  value={report.bySource.trigger}
                />
                <BreakdownRow
                  label="Sequence actions"
                  value={report.bySource.sequence}
                />
                <BreakdownRow
                  label="Unknown source"
                  value={report.bySource.unknown}
                />
              </BreakdownPanel>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function BreakdownPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <div className="mt-3 space-y-2">{children}</div>
    </div>
  );
}

function BreakdownRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="font-medium text-slate-900">{value}</span>
    </div>
  );
}
