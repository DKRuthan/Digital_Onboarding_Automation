"use client";

import { useMemo, useState } from "react";
import type { Customer } from "@/lib/types";
import type { SequenceEnrollment } from "@/lib/email-sequence-types";
import {
  aggregateCustomerDataQualityIssues,
  computeCustomerDataQualitySummary,
  type AggregatedDataQualityIssue,
  type DataQualitySeverity,
} from "@/lib/customer-data-quality";
import { Badge } from "@/components/ui/badge";
import type { BadgeVariant } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { CustomerDataSummaryStrip } from "./customer-insights-ui";

const ADVISORY_COPY =
  "Data quality insights are advisory and display-only in MVP. They do not block triggers, sequences, Action Queue, or sends.";

const UPLOAD_ADVISORY_COPY =
  "Upload validation checks required schema and row format. Data quality warnings highlight operational risks.";

function dataQualitySeverityVariant(severity: DataQualitySeverity): BadgeVariant {
  switch (severity) {
    case "blocker":
      return "danger";
    case "warning":
      return "warning";
    case "info":
    default:
      return "info";
  }
}

export function DataQualityReviewPanel({
  customers,
  enrollments = [],
}: {
  customers: Customer[];
  enrollments?: SequenceEnrollment[];
}) {
  return (
    <Card className="mb-6">
      <CardHeader>
        <h2 className="font-semibold text-slate-900">Data Quality Review</h2>
        <p className="mt-1 text-sm text-slate-600">{ADVISORY_COPY}</p>
      </CardHeader>
      <CardContent>
        <DataQualityReviewContent
          customers={customers}
          enrollments={enrollments}
          sectionTitle="Current Data Quality"
        />
      </CardContent>
    </Card>
  );
}

export function UploadedDataQualityPreview({
  customers,
  enrollments = [],
}: {
  customers: Customer[];
  enrollments?: SequenceEnrollment[];
}) {
  if (customers.length === 0) return null;

  return (
    <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50/60 p-4">
      <h4 className="font-semibold text-indigo-950">Uploaded Data Quality Preview</h4>
      <p className="mt-1 text-sm text-indigo-900">{UPLOAD_ADVISORY_COPY}</p>
      <div className="mt-4">
        <DataQualityReviewContent
          customers={customers}
          enrollments={enrollments}
          compact
        />
      </div>
    </div>
  );
}

function DataQualityReviewContent({
  customers,
  enrollments,
  sectionTitle,
  compact = false,
}: {
  customers: Customer[];
  enrollments: SequenceEnrollment[];
  sectionTitle?: string;
  compact?: boolean;
}) {
  const summary = useMemo(
    () =>
      computeCustomerDataQualitySummary(customers, {
        enrollments,
      }),
    [customers, enrollments],
  );

  const aggregatedIssues = useMemo(
    () =>
      aggregateCustomerDataQualityIssues(customers, {
        enrollments,
      }),
    [customers, enrollments],
  );

  return (
    <div className={compact ? "space-y-4" : "space-y-6"}>
      {sectionTitle ? (
        <h3 className="text-sm font-semibold text-slate-900">{sectionTitle}</h3>
      ) : null}

      <CustomerDataSummaryStrip
        totalCustomers={customers.length}
        customersWithIssues={summary.customersWithIssues}
        blockerCount={summary.blockerCount}
        warningCount={summary.warningCount}
        infoCount={summary.infoCount}
      />

      <TopIssuesList issues={aggregatedIssues} />
    </div>
  );
}

function TopIssuesList({
  issues,
}: {
  issues: AggregatedDataQualityIssue[];
}) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  if (issues.length === 0) {
    return (
      <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        No data quality issues detected across the current customer set.
      </p>
    );
  }

  function toggleIssue(groupKey: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  }

  return (
    <div>
      <h4 className="mb-3 text-sm font-semibold text-slate-900">Top issues</h4>
      <ul className="space-y-2">
        {issues.map((issue) => {
          const expanded = expandedKeys.has(issue.groupKey);
          const customerLabel =
            issue.count === 1 ? "1 customer" : `${issue.count} customers`;

          return (
            <li
              key={issue.groupKey}
              className="overflow-hidden rounded-lg border border-slate-200 bg-white"
            >
              <button
                type="button"
                onClick={() => toggleIssue(issue.groupKey)}
                className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
                aria-expanded={expanded}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={dataQualitySeverityVariant(issue.severity)}>
                      {issue.severity}
                    </Badge>
                    <span className="font-medium text-slate-900">{issue.label}</span>
                    <span className="text-sm text-slate-500">— {customerLabel}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{issue.impact}</p>
                </div>
                <span className="shrink-0 text-xs font-medium text-indigo-600">
                  {expanded ? "Hide" : "Show"} affected
                </span>
              </button>

              {expanded ? (
                <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
                  <ul className="space-y-3">
                    {issue.affectedCustomers.map((customer) => (
                      <li
                        key={`${issue.groupKey}-${customer.customer_id}`}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                      >
                        <p className="font-medium text-slate-900">
                          {customer.customer_name}{" "}
                          <span className="font-normal text-slate-500">
                            ({customer.customer_id})
                          </span>
                        </p>
                        {customer.owner ? (
                          <p className="mt-0.5 text-xs text-slate-500">
                            Owner/DAM: {customer.owner}
                          </p>
                        ) : null}
                        <p className="mt-1 text-slate-700">{customer.message}</p>
                        <p className="mt-1 text-xs text-slate-500">{customer.impact}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
