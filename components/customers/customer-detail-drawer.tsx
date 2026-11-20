"use client";

import { useMemo } from "react";
import type { Customer } from "@/lib/types";
import { getCustomerRisks } from "@/lib/customer-risks";
import { getMatchedRules } from "@/lib/automation-rules";
import { computeCustomerDataQualityIssues } from "@/lib/customer-data-quality";
import {
  computeAccountTags,
  computeContactTags,
  computeJourneyTags,
} from "@/lib/customer-tags";
import { useCustomerData } from "@/components/providers/customer-data-provider";
import { Drawer } from "@/components/ui/drawer";
import { DetailField, DetailSection } from "@/components/ui/detail-section";
import {
  automationStatusVariant,
  Badge,
  inviteStatusVariant,
} from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import {
  CustomerTagsPanel,
  customerTagSeverityVariant,
  DataQualityIssuesPanel,
} from "./customer-insights-ui";

interface CustomerDetailDrawerProps {
  customer: Customer | null;
  onClose: () => void;
}

export function CustomerDetailDrawer({
  customer,
  onClose,
}: CustomerDetailDrawerProps) {
  const {
    automationRules,
    sequenceEnrollments,
    emailSequences,
    sendLogs,
  } = useCustomerData();

  const insightContext = useMemo(
    () => ({
      enrollments: sequenceEnrollments ?? [],
      sequences: emailSequences ?? [],
      sendLogs: sendLogs ?? [],
    }),
    [sequenceEnrollments, emailSequences, sendLogs],
  );

  if (!customer) return null;

  const risks = getCustomerRisks(customer);
  const matchedRules = getMatchedRules(automationRules, customer);
  const accountTags = computeAccountTags(customer);
  const journeyTags = computeJourneyTags({
    customer,
    enrollments: insightContext.enrollments,
    sequences: insightContext.sequences,
  });
  const qualityIssues = computeCustomerDataQualityIssues(customer, {
    enrollments: insightContext.enrollments,
  });
  const adminContactTags = computeContactTags({
    customer,
    contactEmail: customer.admin_email,
    contactRole: "Admin",
    enrollments: insightContext.enrollments,
    sendLogs: insightContext.sendLogs,
  });

  return (
    <Drawer
      open={!!customer}
      onClose={onClose}
      title={customer.customer_name}
      subtitle={`${customer.customer_id} · ${customer.plan}`}
      headerExtra={
        risks.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {risks.map((risk) => (
              <span
                key={risk.id}
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  risk.severity === "high"
                    ? "bg-red-100 text-red-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {risk.label}
              </span>
            ))}
          </div>
        ) : (
          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
            No active risk flags
          </span>
        )
      }
    >
      <div className="space-y-6">
        <DetailSection title="Tags">
          <CustomerTagsPanel tags={[...accountTags, ...journeyTags]} />
          {adminContactTags.length > 0 ? (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Admin contact context
              </p>
              <div className="flex flex-wrap gap-2">
                {adminContactTags.map((tag) => (
                  <span key={tag.key} title={tag.reason}>
                    <Badge variant={customerTagSeverityVariant(tag.severity)}>
                      {tag.label}
                    </Badge>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </DetailSection>

        <DetailSection title="Data Quality">
          <DataQualityIssuesPanel issues={qualityIssues} />
        </DetailSection>

        <DetailSection title="Customer Info">
          <DetailField label="Account Owner" value={customer.account_owner} />
          <DetailField label="CSM Owner" value={customer.owner} />
          <DetailField label="Admin Email" value={customer.admin_email} />
          <DetailField label="User Email" value={customer.user_email} />
          <DetailField label="Role" value={customer.role} />
          <DetailField label="Plan" value={customer.plan} />
          <DetailField label="Engagement Model" value={customer.engagement_model} />
          <DetailField label="Stage" value={customer.stage} />
          <DetailField label="Use Case" value={customer.use_case} />
          <DetailField label="ICP" value={customer.icp} />
        </DetailSection>

        <DetailSection title="Timeline">
          <DetailField
            label="Term Start"
            value={formatDate(customer.term_start_date)}
          />
          <DetailField
            label="Renewal Date"
            value={formatDate(customer.renewal_date)}
            highlight={
              customer.days_to_renewal <= 90 &&
              customer.usage_threshold_percent < 50
            }
          />
          <DetailField
            label="Days Since Start"
            value={customer.days_since_start}
          />
          <DetailField
            label="Days to Renewal"
            value={customer.days_to_renewal}
            highlight={customer.days_to_renewal <= 90}
          />
        </DetailSection>

        <DetailSection title="Invite Status">
          <DetailField
            label="Status"
            value={
              <Badge variant={inviteStatusVariant(customer.invite_status)}>
                {customer.invite_status}
              </Badge>
            }
          />
          <DetailField
            label="Invite Sent"
            value={formatDate(customer.invite_sent_date)}
          />
          <DetailField
            label="Invite Accepted"
            value={formatDate(customer.invite_accepted_date)}
          />
        </DetailSection>

        <DetailSection title="Seats & Product Access">
          <DetailField
            label="Seats Assigned"
            value={`${customer.seats_assigned} / ${customer.seats_total}`}
          />
          <DetailField
            label="Assignment %"
            value={`${customer.seat_assignment_percent}%`}
            highlight={customer.seat_assignment_percent < 50}
          />
          <DetailField
            label="Graph Desktop"
            value={customer.graph_desktop_assigned}
          />
          <DetailField
            label="Graph Browser"
            value={customer.graph_browser_assigned}
          />
          <DetailField label="Search" value={customer.search_assigned} />
        </DetailSection>

        <DetailSection title="Usage">
          <DetailField label="Sessions" value={customer.usage_sessions} />
          <DetailField label="Activities" value={customer.usage_activities} />
          <DetailField label="Active Users" value={customer.active_users} />
          <DetailField
            label="Last Usage"
            value={formatDate(customer.last_usage_date)}
          />
          <DetailField label="Usage Threshold" value={customer.usage_threshold} />
          <DetailField
            label="Threshold %"
            value={`${customer.usage_threshold_percent}%`}
            highlight={customer.usage_threshold_percent < 30}
          />
        </DetailSection>

        <DetailSection title="Enablement">
          <DetailField
            label="Academy Visited"
            value={
              <Badge
                variant={customer.academy_visited === "Yes" ? "success" : "warning"}
              >
                {customer.academy_visited}
              </Badge>
            }
          />
          <DetailField
            label="Webinar Attended"
            value={
              <Badge
                variant={customer.webinar_attended === "Yes" ? "success" : "warning"}
              >
                {customer.webinar_attended}
              </Badge>
            }
          />
        </DetailSection>

        <DetailSection title="Automation">
          <DetailField
            label="Status"
            value={
              <Badge variant={automationStatusVariant(customer.automation_status)}>
                {customer.automation_status}
              </Badge>
            }
          />
          <DetailField
            label="Next Recommended Action"
            value={customer.next_recommended_action}
            fullWidth
          />
          <DetailField
            label="Matched Triggers"
            value={
              matchedRules.length > 0 ? (
                <ul className="mt-1 space-y-1">
                  {matchedRules.map((r) => (
                    <li key={r.id} className="text-sm text-slate-700">
                      {r.name}
                    </li>
                  ))}
                </ul>
              ) : (
                "None"
              )
            }
            fullWidth
          />
          <DetailField
            label="Last Email Sent"
            value={customer.last_email_sent}
          />
          <DetailField
            label="Last Email Date"
            value={formatDate(customer.last_email_sent_date)}
          />
          <DetailField
            label="Emails Sent Count"
            value={customer.emails_sent_count}
          />
        </DetailSection>

        <DetailSection title="Notes">
          <DetailField
            label="Notes"
            value={customer.notes || "No notes"}
            fullWidth
          />
        </DetailSection>
      </div>
    </Drawer>
  );
}
