import { StatCard } from "@/components/ui/stat-card";
import type { WorkflowSummary } from "@/lib/types";

export function WorkflowSummaryCard({ summary }: { summary: WorkflowSummary }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <StatCard
        label="Needs Review"
        value={summary.needsReview}
        variant="warning"
      />
      <StatCard label="Test Sent" value={summary.testSent} variant="info" />
      <StatCard label="Approved" value={summary.approved} variant="success" />
      <StatCard label="Skipped" value={summary.skipped} variant="default" />
      <StatCard label="Blocked" value={summary.blocked} variant="warning" />
    </div>
  );
}
