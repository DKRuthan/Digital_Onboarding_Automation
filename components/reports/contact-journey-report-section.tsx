import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { ContactJourneyReport } from "@/lib/reports-snapshot";

type ContactJourneyReportSectionProps = {
  report: ContactJourneyReport;
};

export function ContactJourneyReportSection({
  report,
}: ContactJourneyReportSectionProps) {
  const hasContacts = report.totalContacts > 0;

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold text-slate-900">Contact Journey</h2>
        <p className="mt-1 text-sm text-slate-600">
          Contact-first view of journey coverage, sequence participation, cooling
          state, and unresolved contact actions.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {!hasContacts ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
            No contact data available yet. Use Demo Data or upload customer
            data.
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Total Contacts" value={report.totalContacts} />
              <StatCard
                label="Admin Contacts"
                value={report.contactsByRole.admin}
                variant="info"
              />
              <StatCard
                label="User Contacts"
                value={report.contactsByRole.user}
                variant="info"
              />
              <StatCard
                label="CSM Contacts"
                value={report.contactsByRole.csm}
                variant="info"
              />
              <StatCard
                label="Contacts in Sequence"
                value={report.contactsInSequence}
                variant="info"
              />
              <StatCard
                label="Contacts Not in Sequence"
                value={report.contactsNotInSequence}
              />
              <StatCard
                label="Cooling Active"
                value={report.contactsCoolingActive}
                variant={
                  report.contactsCoolingActive > 0 ? "warning" : "default"
                }
              />
              <StatCard label="Cooling Clear" value={report.contactsCoolingClear} />
              <StatCard
                label="Unresolved Contact Email Actions"
                value={report.unresolvedContactEmailActions}
                variant={
                  report.unresolvedContactEmailActions > 0 ? "warning" : "default"
                }
              />
              {report.doNotContactWarnings != null ? (
                <StatCard
                  label="Do-Not-Contact Warnings"
                  value={report.doNotContactWarnings}
                  variant={report.doNotContactWarnings > 0 ? "warning" : "default"}
                />
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <BreakdownPanel title="Role breakdown">
                <BreakdownRow label="Admin" value={report.contactsByRole.admin} />
                <BreakdownRow label="User" value={report.contactsByRole.user} />
                <BreakdownRow label="CSM" value={report.contactsByRole.csm} />
              </BreakdownPanel>

              <BreakdownPanel title="Journey status">
                <BreakdownRow
                  label="In sequence"
                  value={report.contactsInSequence}
                />
                <BreakdownRow
                  label="Not in sequence"
                  value={report.contactsNotInSequence}
                />
                <BreakdownRow
                  label="Cooling active"
                  value={report.contactsCoolingActive}
                />
                <BreakdownRow
                  label="Cooling clear"
                  value={report.contactsCoolingClear}
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
