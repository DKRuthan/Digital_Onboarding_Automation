"use client";

import { useMemo, useState } from "react";
import { useCustomerData } from "@/components/providers/customer-data-provider";
import {
  automationStatusVariant,
  Badge,
  inviteStatusVariant,
} from "@/components/ui/badge";
import { useCan } from "@/components/auth/permissions-provider";
import type { Customer } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { computeCustomerDataQualityIssues } from "@/lib/customer-data-quality";
import {
  computeContactTags,
  computeCustomerTags,
  type ComputedCustomerTag,
  type JourneyTagSequence,
} from "@/lib/customer-tags";
import type { SequenceEnrollment } from "@/lib/email-sequence-types";
import type { SendLog } from "@/lib/types";
import { exportCustomerDataCsv } from "@/lib/session-export";
import { gateByPermission } from "@/lib/auth/permission-ui";
import { recordClientAuditEvent } from "@/lib/audit/client-audit";
import {
  CustomerTagsCell,
  DataQualityBadge,
} from "./customer-insights-ui";
import { CustomerDetailDrawer } from "./customer-detail-drawer";

const ALL = "All";
const ALL_TAGS = "All Tags";
const QUALITY_CLEAN = "Clean";
const QUALITY_WARNINGS = "Has warnings";
const QUALITY_BLOCKERS = "Has blockers";
const IN_SEQUENCE = "In Sequence";
const NOT_IN_SEQUENCE = "Not in Sequence";
const COOLING_ACTIVE = "Cooling Active";
const NOT_COOLING = "Not Cooling Active";

const TAG_FILTER_OPTIONS = [
  "Low Usage",
  "Renewal Risk",
  "Onboarding",
  "New Customer",
  "Activated",
  "High Usage",
  "Dormant",
  "Expansion Opportunity",
  "Onboarding Sequence",
  "Activation Sequence",
  "Education Sequence",
  "Renewal Sequence",
] as const;

type InsightContext = {
  enrollments: SequenceEnrollment[];
  sequences: JourneyTagSequence[];
  sendLogs: SendLog[];
};

interface CustomerTableProps {
  customers: Customer[];
}

export function CustomerTable({ customers }: CustomerTableProps) {
  const {
    isCustomerDataHydrated,
    sequenceEnrollments,
    emailSequences,
    sendLogs,
  } = useCustomerData();
  const canExport = useCan("export_reports");
  const exportGate = gateByPermission(canExport, "export_reports");

  const [plan, setPlan] = useState(ALL);
  const [stage, setStage] = useState(ALL);
  const [owner, setOwner] = useState(ALL);
  const [inviteStatus, setInviteStatus] = useState(ALL);
  const [automationStatus, setAutomationStatus] = useState(ALL);
  const [dataQuality, setDataQuality] = useState(ALL);
  const [tagFilter, setTagFilter] = useState(ALL_TAGS);
  const [sequenceStatus, setSequenceStatus] = useState(ALL);
  const [coolingStatus, setCoolingStatus] = useState(ALL);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const insightContext = useMemo<InsightContext>(
    () => ({
      enrollments: isCustomerDataHydrated ? (sequenceEnrollments ?? []) : [],
      sequences: isCustomerDataHydrated ? (emailSequences ?? []) : [],
      sendLogs: sendLogs ?? [],
    }),
    [isCustomerDataHydrated, sequenceEnrollments, emailSequences, sendLogs],
  );

  const customerInsights = useMemo(() => {
    const map = new Map<
      string,
      {
        tags: ComputedCustomerTag[];
        issues: ReturnType<typeof computeCustomerDataQualityIssues>;
        inSequence: boolean;
        coolingActive: boolean;
      }
    >();

    for (const customer of customers) {
      const tags = computeCustomerTags({
        customer,
        ...insightContext,
      });

      map.set(customer.customer_id, {
        tags,
        issues: computeCustomerDataQualityIssues(customer, {
          enrollments: insightContext.enrollments,
        }),
        inSequence: customerHasActiveSequence(
          customer.customer_id,
          insightContext.enrollments,
        ),
        coolingActive: isCustomerDataHydrated
          ? customerHasCoolingActive(customer, insightContext)
          : false,
      });
    }

    return map;
  }, [customers, insightContext, isCustomerDataHydrated]);

  const availableTagOptions = useMemo(() => {
    const labelsInData = new Set<string>();
    for (const insights of customerInsights.values()) {
      for (const tag of insights.tags) {
        labelsInData.add(tag.label);
      }
    }

    const curated = TAG_FILTER_OPTIONS.filter((label) => labelsInData.has(label));
    const extra = [...labelsInData]
      .filter((label) => !TAG_FILTER_OPTIONS.includes(label as (typeof TAG_FILTER_OPTIONS)[number]))
      .sort();

    return [...curated, ...extra];
  }, [customerInsights]);

  const stages = useMemo(
    () => [...new Set(customers.map((c) => c.stage))].sort(),
    [customers],
  );
  const owners = useMemo(
    () => [...new Set(customers.map((c) => c.owner))].sort(),
    [customers],
  );
  const plans = useMemo(
    () => [...new Set(customers.map((c) => c.plan))].sort(),
    [customers],
  );
  const inviteStatuses = useMemo(
    () => [...new Set(customers.map((c) => c.invite_status))].sort(),
    [customers],
  );
  const automationStatuses = useMemo(
    () => [...new Set(customers.map((c) => c.automation_status))].sort(),
    [customers],
  );

  const filtered = customers.filter((c) => {
    if (plan !== ALL && c.plan !== plan) return false;
    if (stage !== ALL && c.stage !== stage) return false;
    if (owner !== ALL && c.owner !== owner) return false;
    if (inviteStatus !== ALL && c.invite_status !== inviteStatus) return false;
    if (automationStatus !== ALL && c.automation_status !== automationStatus)
      return false;

    const insights = customerInsights.get(c.customer_id);
    const issues = insights?.issues ?? [];
    const tags = insights?.tags ?? [];

    if (dataQuality === QUALITY_CLEAN && issues.length > 0) return false;
    if (
      dataQuality === QUALITY_WARNINGS &&
      !issues.some((issue) => issue.severity === "warning")
    ) {
      return false;
    }
    if (
      dataQuality === QUALITY_BLOCKERS &&
      !issues.some((issue) => issue.severity === "blocker")
    ) {
      return false;
    }

    if (tagFilter !== ALL_TAGS && !tags.some((tag) => tag.label === tagFilter)) {
      return false;
    }

    if (sequenceStatus === IN_SEQUENCE && !insights?.inSequence) return false;
    if (sequenceStatus === NOT_IN_SEQUENCE && insights?.inSequence) return false;

    if (coolingStatus === COOLING_ACTIVE && !insights?.coolingActive) return false;
    if (coolingStatus === NOT_COOLING && insights?.coolingActive) return false;

    return true;
  });

  const hasActiveFilters =
    plan !== ALL ||
    stage !== ALL ||
    owner !== ALL ||
    inviteStatus !== ALL ||
    automationStatus !== ALL ||
    dataQuality !== ALL ||
    tagFilter !== ALL_TAGS ||
    sequenceStatus !== ALL ||
    coolingStatus !== ALL;

  function clearFilters() {
    setPlan(ALL);
    setStage(ALL);
    setOwner(ALL);
    setInviteStatus(ALL);
    setAutomationStatus(ALL);
    setDataQuality(ALL);
    setTagFilter(ALL_TAGS);
    setSequenceStatus(ALL);
    setCoolingStatus(ALL);
  }

  function handleExportFiltered() {
    exportCustomerDataCsv(filtered, insightContext);
    recordClientAuditEvent({
      action: "export.customers_csv",
      targetType: "customer_data",
      metadata: { row_count: filtered.length, filters_applied: hasActiveFilters },
    });
  }

  function handleExportAll() {
    exportCustomerDataCsv(customers, insightContext);
    recordClientAuditEvent({
      action: "export.customers_csv",
      targetType: "customer_data",
      metadata: { row_count: customers.length, filters_applied: false },
    });
  }

  return (
    <div className="space-y-4">
      <CustomerDetailDrawer
        customer={selectedCustomer}
        onClose={() => setSelectedCustomer(null)}
      />

      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-700">
              Showing {filtered.length} of {customers.length} customers
            </p>
            <p className="text-xs text-slate-500">
              Exports account-level customer context, tags, and data quality.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              onClick={handleExportFiltered}
              disabled={exportGate.disabled || filtered.length === 0}
              title={
                exportGate.title ??
                (filtered.length === 0 ? "No rows to export" : undefined)
              }
            >
              Export Filtered Accounts CSV
            </Button>
            {hasActiveFilters ? (
              <>
                <Button
                  variant="secondary"
                  onClick={handleExportAll}
                  disabled={exportGate.disabled}
                  title={exportGate.title}
                >
                  Export All Accounts CSV
                </Button>
                <Button variant="ghost" onClick={clearFilters}>
                  Clear filters
                </Button>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <FilterSelect
            label="Tag"
            value={tagFilter}
            onChange={setTagFilter}
            allValue={ALL_TAGS}
            allLabel="All Tags"
            options={availableTagOptions}
          />
          <FilterSelect
            label="Data Quality"
            value={dataQuality}
            onChange={setDataQuality}
            options={[QUALITY_CLEAN, QUALITY_WARNINGS, QUALITY_BLOCKERS]}
          />
          <FilterSelect
            label="Lifecycle / Stage"
            value={stage}
            onChange={setStage}
            allLabel="All Stages"
            options={stages}
          />
          <FilterSelect
            label="Owner / DAM"
            value={owner}
            onChange={setOwner}
            allLabel="All Owners"
            options={owners}
          />
          <FilterSelect
            label="Sequence Status"
            value={sequenceStatus}
            onChange={setSequenceStatus}
            options={[IN_SEQUENCE, NOT_IN_SEQUENCE]}
          />
          <FilterSelect
            label="Cooling"
            value={coolingStatus}
            onChange={setCoolingStatus}
            options={[COOLING_ACTIVE, NOT_COOLING]}
          />
          <FilterSelect label="Plan" value={plan} onChange={setPlan} options={plans} />
          <FilterSelect
            label="Invite Status"
            value={inviteStatus}
            onChange={setInviteStatus}
            options={inviteStatuses}
          />
          <FilterSelect
            label="Automation Status"
            value={automationStatus}
            onChange={setAutomationStatus}
            options={automationStatuses}
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <Th>Customer</Th>
              <Th>Tags</Th>
              <Th>Data Quality</Th>
              <Th>Plan</Th>
              <Th>Stage</Th>
              <Th>Owner</Th>
              <Th>Invite</Th>
              <Th>Seats %</Th>
              <Th>Usage %</Th>
              <Th>Last Usage</Th>
              <Th>Automation</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={11}
                  className="px-4 py-8 text-center text-sm text-slate-500"
                >
                  No customers match the current filters.
                </td>
              </tr>
            ) : (
              filtered.map((c) => {
                const insights = customerInsights.get(c.customer_id);
                const tags = insights?.tags ?? [];
                const issues = insights?.issues ?? [];

                return (
                  <tr
                    key={c.customer_id}
                    onClick={() => setSelectedCustomer(c)}
                    className="cursor-pointer hover:bg-indigo-50/50"
                  >
                    <Td className="font-medium text-slate-900">{c.customer_name}</Td>
                    <Td>
                      <CustomerTagsCell tags={tags} />
                    </Td>
                    <Td>
                      <DataQualityBadge issues={issues} />
                    </Td>
                    <Td>{c.plan}</Td>
                    <Td>{c.stage}</Td>
                    <Td>{c.owner}</Td>
                    <Td>
                      <Badge variant={inviteStatusVariant(c.invite_status)}>
                        {c.invite_status}
                      </Badge>
                    </Td>
                    <Td>
                      <PercentCell value={c.seat_assignment_percent} warnBelow={50} />
                    </Td>
                    <Td>
                      <PercentCell value={c.usage_threshold_percent} warnBelow={30} />
                    </Td>
                    <Td className="whitespace-nowrap">{formatDate(c.last_usage_date)}</Td>
                    <Td>
                      <Badge variant={automationStatusVariant(c.automation_status)}>
                        {c.automation_status}
                      </Badge>
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function customerHasActiveSequence(
  customerId: string,
  enrollments: SequenceEnrollment[],
): boolean {
  return enrollments.some(
    (entry) =>
      entry.account_id === customerId &&
      (entry.enrollment_status === "active" ||
        entry.enrollment_status === "paused"),
  );
}

function customerHasCoolingActive(
  customer: Customer,
  context: InsightContext,
): boolean {
  const contacts: Array<{ email: string; role: "Admin" | "User" }> = [];

  if (customer.admin_email?.trim()) {
    contacts.push({ email: customer.admin_email, role: "Admin" });
  }
  if (customer.user_email?.trim()) {
    contacts.push({ email: customer.user_email, role: "User" });
  }

  return contacts.some((contact) =>
    computeContactTags({
      customer,
      contactEmail: contact.email,
      contactRole: contact.role,
      enrollments: context.enrollments,
      sendLogs: context.sendLogs,
    }).some((tag) => tag.key === "contact-cooling-active"),
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  allValue = ALL,
  allLabel = ALL,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  allValue?: string;
  allLabel?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        <option value={allValue}>{allLabel}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <td className={`px-4 py-3 text-slate-600 ${className}`} title={title}>
      {children}
    </td>
  );
}

function PercentCell({
  value,
  warnBelow,
}: {
  value: number;
  warnBelow: number;
}) {
  const isLow = value < warnBelow;
  return (
    <span className={isLow ? "font-medium text-amber-700" : ""}>
      {value}%
    </span>
  );
}
