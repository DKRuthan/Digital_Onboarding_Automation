import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { ImportQualityReport } from "@/lib/reports-snapshot";
import type { ContactsImportQualitySummary } from "@/lib/import-contacts-quality-summary";

type ImportQualityReportSectionProps = {
  report: ImportQualityReport;
};

function formatImportLabel(format: ImportQualityReport["lastImportFormat"]): string {
  if (format === "option_a") return "Legacy single-row CSV format";
  if (format === "option_c") return "Journey Import workbook (flat Row 2 primary)";
  return "No import snapshot";
}

export function ImportQualityReportSection({
  report,
}: ImportQualityReportSectionProps) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold text-slate-900">Import Quality</h2>
        <p className="mt-1 text-sm text-slate-600">
          Last upload validation snapshot from Customer Data. Applied import
          data persists locally in this browser after refresh. Workflow
          progress and communication logs remain session/demo state. Production
          durability requires server/database persistence. Legacy multi-sheet
          formats are still supported as fallback.
        </p>
      </CardHeader>
      <CardContent>
        {!report.available ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
            No import validation snapshot available yet. Upload and validate a
            file in Customer Data to populate this report.
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <ReportMetric
                label="Last import format"
                value={formatImportLabel(report.lastImportFormat)}
                isText
              />
              <ReportMetric
                label="Accounts imported"
                value={report.accountsImported ?? "—"}
              />
              <ReportMetric
                label="Contacts imported"
                value={report.contactsImported ?? "—"}
              />
              <ReportMetric
                label="Signals detected"
                value={report.signalsDetected ?? "—"}
              />
              <ReportMetric
                label="Customers after rollup"
                value={report.customersAfterRollup ?? "—"}
              />
              <ReportMetric
                label="Import blockers"
                value={report.importBlockers}
                highlight={report.importBlockers > 0 ? "danger" : undefined}
              />
              <ReportMetric
                label="Import warnings"
                value={report.importWarnings}
                highlight={report.importWarnings > 0 ? "warning" : undefined}
              />
              <ReportMetric
                label="Import info"
                value={report.importInfo}
              />
              <ReportMetric
                label="Rollup warnings"
                value={report.rollupWarnings}
                highlight={report.rollupWarnings > 0 ? "warning" : undefined}
              />
            </div>

            {report.signalsNotImported && report.signalsNote ? (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {report.signalsNote}
              </p>
            ) : null}

            {report.contactsQuality ? (
              <ContactsQualityBlock quality={report.contactsQuality} />
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ContactsQualityBlock({
  quality,
}: {
  quality: ContactsImportQualitySummary;
}) {
  const extraNotPersisted =
    quality.extraAdminNotPersisted +
    quality.extraUserNotPersisted +
    quality.extraCsmNotPersisted;

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-4">
      <h3 className="text-sm font-semibold text-violet-950">
        Contacts quality summary
      </h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <ReportMetric label="Total contacts" value={quality.totalContacts} />
        <ReportMetric label="Admin contacts" value={quality.adminContacts} />
        <ReportMetric label="User contacts" value={quality.userContacts} />
        <ReportMetric label="CSM contacts" value={quality.csmContacts} />
        <ReportMetric
          label="Do-not-contact count"
          value={quality.doNotContactContacts}
          highlight={quality.doNotContactContacts > 0 ? "warning" : undefined}
        />
        <ReportMetric
          label="Missing Admin accounts"
          value={quality.accountsMissingAdmin}
          highlight={quality.accountsMissingAdmin > 0 ? "warning" : undefined}
        />
        <ReportMetric
          label="Duplicate contact rows"
          value={quality.duplicateContactRows}
          highlight={quality.duplicateContactRows > 0 ? "danger" : undefined}
        />
        <ReportMetric
          label="Orphan contacts"
          value={quality.orphanContacts}
          highlight={quality.orphanContacts > 0 ? "danger" : undefined}
        />
        <ReportMetric
          label="Multi-account emails"
          value={quality.emailsAcrossAccounts}
          highlight={quality.emailsAcrossAccounts > 0 ? "warning" : undefined}
        />
        <ReportMetric
          label="Extra contacts not in account rollup"
          value={extraNotPersisted}
          highlight={extraNotPersisted > 0 ? "info" : undefined}
        />
      </div>
    </div>
  );
}

function ReportMetric({
  label,
  value,
  isText = false,
  highlight,
}: {
  label: string;
  value: number | string;
  isText?: boolean;
  highlight?: "warning" | "danger" | "info";
}) {
  const valueClass =
    highlight === "danger"
      ? "text-red-800"
      : highlight === "warning"
        ? "text-amber-900"
        : highlight === "info"
          ? "text-violet-900"
          : "text-slate-900";

  return (
    <div className="rounded-md border border-slate-100 bg-white/80 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`font-medium ${valueClass} ${isText ? "text-sm" : ""}`}>
        {value}
      </p>
    </div>
  );
}
