import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { SequenceReport } from "@/lib/reports-snapshot";
import { BreakdownPanel, BreakdownRow } from "./report-breakdown";

type SequenceReportSectionProps = {
  report: SequenceReport;
};

function formatEnrollmentStatus(status: string): string {
  if (!status.trim()) return "Unknown";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function SequenceReportSection({ report }: SequenceReportSectionProps) {
  const hasSequenceData =
    report.totalSequences > 0 || report.totalEnrollments > 0;

  const enrollmentRows = Object.entries(report.enrollmentsByStatus).sort(
    ([a], [b]) => a.localeCompare(b),
  );

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold text-slate-900">Sequences</h2>
        <p className="mt-1 text-sm text-slate-600">
          Manual sequence progression and enrollment status across contact
          journeys.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {!hasSequenceData ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
            No sequence or enrollment data available yet.
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Total Sequences" value={report.totalSequences} />
              <StatCard
                label="Approved Sequences"
                value={report.approvedSequences}
                variant="success"
              />
              <StatCard
                label="Active Sequences"
                value={report.activeSequences}
                variant="info"
              />
              <StatCard
                label="Archived Sequences"
                value={report.archivedSequences}
              />
              <StatCard
                label="Total Enrollments"
                value={report.totalEnrollments}
                variant="info"
              />
              <StatCard
                label="Enrolled Contacts"
                value={report.enrolledContacts}
                variant="info"
              />
              <StatCard
                label="Paused Enrollments"
                value={report.pausedEnrollments}
              />
              <StatCard
                label="Completed Enrollments"
                value={report.completedEnrollments}
                variant="success"
              />
              <StatCard label="Completed Steps" value={report.completedSteps} />
            </div>

            <BreakdownPanel title="Enrollments by status">
              {enrollmentRows.length === 0 ? (
                <p className="text-sm text-slate-500">No enrollments</p>
              ) : (
                enrollmentRows.map(([status, value]) => (
                  <BreakdownRow
                    key={status}
                    label={formatEnrollmentStatus(status)}
                    value={value}
                  />
                ))
              )}
            </BreakdownPanel>
          </>
        )}
      </CardContent>
    </Card>
  );
}
