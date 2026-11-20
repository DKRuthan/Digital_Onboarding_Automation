import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { AccountContextReport } from "@/lib/reports-snapshot";
import { BreakdownPanel, BreakdownRow } from "./report-breakdown";

type AccountContextReportSectionProps = {
  report: AccountContextReport;
};

export function AccountContextReportSection({
  report,
}: AccountContextReportSectionProps) {
  const hasAccountContext =
    Object.keys(report.planBreakdown).length > 0 ||
    report.lowUsageAccounts > 0 ||
    report.renewalRiskAccounts > 0 ||
    report.accountsWithDataQualityWarnings > 0 ||
    report.accountsWithDataQualityBlockers > 0 ||
    report.missingOwnerDamEmailAccounts > 0;

  const planRows = Object.entries(report.planBreakdown).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const stageRows = Object.entries(report.stageBreakdown).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold text-slate-900">Account Context</h2>
        <p className="mt-1 text-sm text-slate-600">
          Account-level context that supports contact-first journey decisions.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {!hasAccountContext ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
            No account context available yet.
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <StatCard
                label="Low Usage Accounts"
                value={report.lowUsageAccounts}
                variant={report.lowUsageAccounts > 0 ? "warning" : "default"}
              />
              <StatCard
                label="Renewal Risk Accounts"
                value={report.renewalRiskAccounts}
                variant={report.renewalRiskAccounts > 0 ? "warning" : "default"}
              />
              <StatCard
                label="Accounts with Data Quality Warnings"
                value={report.accountsWithDataQualityWarnings}
                variant={
                  report.accountsWithDataQualityWarnings > 0
                    ? "warning"
                    : "default"
                }
              />
              <StatCard
                label="Accounts with Data Quality Blockers"
                value={report.accountsWithDataQualityBlockers}
                variant={
                  report.accountsWithDataQualityBlockers > 0
                    ? "warning"
                    : "default"
                }
              />
              <StatCard
                label="Missing Owner/DAM Email Accounts"
                value={report.missingOwnerDamEmailAccounts}
                variant={
                  report.missingOwnerDamEmailAccounts > 0
                    ? "warning"
                    : "default"
                }
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <BreakdownPanel title="Plan Breakdown">
                {planRows.length === 0 ? (
                  <p className="text-sm text-slate-500">No plan data</p>
                ) : (
                  planRows.map(([label, value]) => (
                    <BreakdownRow key={label} label={label} value={value} />
                  ))
                )}
              </BreakdownPanel>

              <BreakdownPanel title="Stage Breakdown">
                {stageRows.length === 0 ? (
                  <p className="text-sm text-slate-500">No stage data</p>
                ) : (
                  stageRows.map(([label, value]) => (
                    <BreakdownRow key={label} label={label} value={value} />
                  ))
                )}
              </BreakdownPanel>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
