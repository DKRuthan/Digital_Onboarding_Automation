"use client";

import type { BadgeVariant } from "@/components/ui/badge";
import { Badge } from "@/components/ui/badge";
import type { DataQualityIssue } from "@/lib/customer-data-quality";
import type { ComputedCustomerTag, CustomerTagSeverity } from "@/lib/customer-tags";

export function customerTagSeverityVariant(
  severity: CustomerTagSeverity,
): BadgeVariant {
  switch (severity) {
    case "success":
      return "success";
    case "warning":
      return "warning";
    case "risk":
      return "danger";
    case "info":
    default:
      return "info";
  }
}

export function formatDataQualityBadgeLabel(
  issues: DataQualityIssue[],
): string {
  if (issues.length === 0) return "Clean";

  const blockers = issues.filter((issue) => issue.severity === "blocker").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  const infos = issues.filter((issue) => issue.severity === "info").length;

  const parts: string[] = [];
  if (blockers > 0) {
    parts.push(blockers === 1 ? "1 blocker" : `${blockers} blockers`);
  }
  if (warnings > 0) {
    parts.push(warnings === 1 ? "1 warning" : `${warnings} warnings`);
  }
  if (infos > 0) {
    parts.push(infos === 1 ? "1 info" : `${infos} info`);
  }

  return parts.join(", ");
}

export function dataQualityBadgeVariant(
  issues: DataQualityIssue[],
): BadgeVariant {
  if (issues.length === 0) return "success";
  if (issues.some((issue) => issue.severity === "blocker")) return "danger";
  if (issues.some((issue) => issue.severity === "warning")) return "warning";
  return "info";
}

export function CustomerTagsCell({
  tags,
  maxVisible = 3,
}: {
  tags: ComputedCustomerTag[];
  maxVisible?: number;
}) {
  if (tags.length === 0) {
    return <span className="text-xs text-slate-400">—</span>;
  }

  const visible = tags.slice(0, maxVisible);
  const remaining = tags.length - visible.length;

  return (
    <div
      className="flex max-w-[220px] flex-wrap items-center gap-1"
      title={tags.map((tag) => `${tag.label}: ${tag.reason}`).join("\n")}
    >
      {visible.map((tag) => (
        <Badge
          key={tag.key}
          variant={customerTagSeverityVariant(tag.severity)}
          className="max-w-[120px] truncate"
        >
          {tag.label}
        </Badge>
      ))}
      {remaining > 0 && (
        <span className="text-xs font-medium text-slate-500">+{remaining} more</span>
      )}
    </div>
  );
}

export function DataQualityBadge({ issues }: { issues: DataQualityIssue[] }) {
  const label = formatDataQualityBadgeLabel(issues);
  const variant = dataQualityBadgeVariant(issues);

  return (
    <span title={issues.map((issue) => issue.message).join("\n") || "No data quality issues"}>
      <Badge
        variant={variant}
        className={issues.some((issue) => issue.severity === "blocker") ? "font-semibold" : ""}
      >
        {label}
      </Badge>
    </span>
  );
}

export function CustomerDataSummaryStrip({
  totalCustomers,
  customersWithIssues,
  blockerCount,
  warningCount,
  infoCount,
}: {
  totalCustomers: number;
  customersWithIssues: number;
  blockerCount: number;
  warningCount: number;
  infoCount: number;
}) {
  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <SummaryStat label="Total customers" value={totalCustomers} />
      <SummaryStat
        label="With data quality issues"
        value={customersWithIssues}
        highlight={customersWithIssues > 0}
      />
      <SummaryStat
        label="Blockers"
        value={blockerCount}
        highlight={blockerCount > 0}
        highlightClass="text-red-700"
      />
      <SummaryStat
        label="Warnings"
        value={warningCount}
        highlight={warningCount > 0}
        highlightClass="text-amber-700"
      />
      <SummaryStat label="Info items" value={infoCount} />
    </div>
  );
}

function SummaryStat({
  label,
  value,
  highlight = false,
  highlightClass = "text-slate-900",
}: {
  label: string;
  value: number;
  highlight?: boolean;
  highlightClass?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-semibold ${
          highlight ? highlightClass : "text-slate-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export function DataQualityIssuesPanel({
  issues,
}: {
  issues: DataQualityIssue[];
}) {
  if (issues.length === 0) {
    return (
      <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        No data quality issues detected for this account.
      </p>
    );
  }

  const blockers = issues.filter((issue) => issue.severity === "blocker");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  const infos = issues.filter((issue) => issue.severity === "info");

  return (
    <div className="space-y-4">
      {blockers.length > 0 && (
        <IssueGroup title="Blockers" issues={blockers} tone="blocker" />
      )}
      {warnings.length > 0 && (
        <IssueGroup title="Warnings" issues={warnings} tone="warning" />
      )}
      {infos.length > 0 && (
        <IssueGroup title="Info" issues={infos} tone="info" />
      )}
    </div>
  );
}

function IssueGroup({
  title,
  issues,
  tone,
}: {
  title: string;
  issues: DataQualityIssue[];
  tone: "blocker" | "warning" | "info";
}) {
  const toneClasses = {
    blocker: "border-red-200 bg-red-50",
    warning: "border-amber-200 bg-amber-50",
    info: "border-slate-200 bg-slate-50",
  };

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </p>
      <ul className="space-y-2">
        {issues.map((issue) => (
          <li
            key={issue.key}
            className={`rounded-lg border px-3 py-2 text-sm ${toneClasses[tone]}`}
          >
            <p className="font-medium text-slate-900">{issue.label}</p>
            {issue.field ? (
              <p className="mt-0.5 font-mono text-xs text-slate-500">{issue.field}</p>
            ) : null}
            <p className="mt-1 text-slate-700">{issue.message}</p>
            <p className="mt-1 text-xs text-slate-500">{issue.impact}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CustomerTagsPanel({ tags }: { tags: ComputedCustomerTag[] }) {
  const accountTags = tags.filter((tag) => tag.category === "account");
  const journeyTags = tags.filter((tag) => tag.category === "journey");

  if (accountTags.length === 0 && journeyTags.length === 0) {
    return (
      <p className="text-sm text-slate-500">No computed tags for this account.</p>
    );
  }

  return (
    <div className="space-y-4">
      {accountTags.length > 0 && (
        <TagGroup title="Account tags" tags={accountTags} />
      )}
      {journeyTags.length > 0 && (
        <TagGroup title="Journey tags" tags={journeyTags} />
      )}
    </div>
  );
}

function TagGroup({
  title,
  tags,
}: {
  title: string;
  tags: ComputedCustomerTag[];
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </p>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span key={tag.key} title={tag.reason}>
            <Badge variant={customerTagSeverityVariant(tag.severity)}>
              {tag.label}
            </Badge>
          </span>
        ))}
      </div>
    </div>
  );
}
