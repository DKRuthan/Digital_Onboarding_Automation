import type { ImportIssue, ValidationResult } from "@/lib/upload-validation";
import { ContactsImportQualityPreview } from "./contacts-import-quality-preview";

type MultisheetImportPreviewProps = {
  result: ValidationResult;
};

export function MultisheetImportPreview({ result }: MultisheetImportPreviewProps) {
  const summary = result.importSummary;
  if (!summary || summary.format !== "option_c") {
    return null;
  }

  const isFlatImport = summary.headerMode === "flat_row2";
  const blockers = (result.importIssues ?? []).filter(
    (issue) => issue.severity === "blocker",
  );
  const crossWarnings = (result.importIssues ?? []).filter(
    (issue) => issue.severity === "warning",
  );
  const infoIssues = (result.importIssues ?? []).filter(
    (issue) => issue.severity === "info",
  );
  const rollupWarnings = result.importWarnings ?? [];
  const infoMessages = new Set(infoIssues.map((issue) => issue.message));
  const extraNotes = (result.importNotes ?? []).filter(
    (note) => !infoMessages.has(note),
  );
  const notesCount = extraNotes.length;
  const signalsCount = summary.signalsCount ?? 0;
  const signalsSheetFound = summary.signalsSheetFound ?? false;
  const hasBlockers = blockers.length > 0;
  const issueScopeLabel = isFlatImport ? "Import" : "Cross-sheet";

  return (
    <div className="mt-4 rounded-lg border border-indigo-200 bg-white p-4 shadow-sm">
      <h4 className="text-sm font-semibold text-slate-900">
        {isFlatImport ? "Flat Import Preview" : "Multi-Sheet Import Preview"}
      </h4>
      <p className="mt-1 text-xs text-slate-600">
        {isFlatImport ? (
          <>
            Applying a valid workbook replaces current session customer data.
            Data starts at Row 3 on Journey Import (Row 1 labels, Row 2 system
            keys). One row = one account + one contact. All contact rows are
            stored in session and shown on Contacts / Emails. Prior send history
            and Signals are not imported — no Communication Logs or emails are
            created.
          </>
        ) : (
          <>
            Applying a valid workbook replaces current session customer data. All
            Contacts sheet rows are stored in session and shown on Contacts /
            Emails. The customer rollup still maps the first Admin and first User
            per account on the Customer model. Signals are validated and previewed
            only — they do not create contacts, Communication Logs, or emails.
          </>
        )}
      </p>

      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <PreviewStat label="Accounts" value={summary.accountsCount ?? 0} />
        <PreviewStat label="Contacts" value={summary.contactsCount ?? 0} />
        {!isFlatImport ? (
          <PreviewStat
            label="Signals"
            value={
              signalsSheetFound
                ? `${signalsCount} (preview only)`
                : "—"
            }
            isText
          />
        ) : null}
        <PreviewStat
          label="Customers after rollup"
          value={summary.customersCount ?? result.customers.length}
        />
        <PreviewStat label="Blockers" value={summary.blockerCount ?? blockers.length} />
        <PreviewStat label="Warnings" value={summary.warningCount ?? crossWarnings.length} />
        <PreviewStat
          label="Duplicate contact emails"
          value={summary.duplicateContactEmailCount ?? 0}
        />
        {!isFlatImport ? (
          <>
            <PreviewStat
              label="Orphan contacts"
              value={summary.orphanContactCount ?? 0}
            />
            <PreviewStat
              label="Orphan signals"
              value={summary.orphanSignalCount ?? 0}
            />
          </>
        ) : null}
        <PreviewStat label="Rollup warnings" value={rollupWarnings.length} />
      </div>

      <div className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-sm text-slate-700">
        {isFlatImport ? (
          <>
            <p>
              <span className="font-medium text-slate-800">Journey Import sheet:</span>{" "}
              Found (data from Row 3+)
            </p>
            <p>
              <span className="font-medium text-slate-800">Signals:</span> Not
              imported in flat workbooks
            </p>
          </>
        ) : (
          <>
            <p>
              <span className="font-medium text-slate-800">Accounts sheet:</span>{" "}
              Found
            </p>
            <p>
              <span className="font-medium text-slate-800">Contacts sheet:</span>{" "}
              Found
            </p>
            <p>
              <span className="font-medium text-slate-800">Signals sheet:</span>{" "}
              {signalsSheetFound ? "Found (preview only, not imported)" : "Not present"}
            </p>
          </>
        )}
      </div>

      {!isFlatImport && signalsSheetFound && signalsCount > 0 ? (
        <p className="mt-3 text-xs text-slate-600">
          Signals are previewed only. They are not written to Communication Logs
          and do not create contacts.
        </p>
      ) : null}

      <ContactsImportQualityPreview result={result} isFlatImport={isFlatImport} />

      {hasBlockers ? (
        <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2">
          <p className="text-sm font-medium text-red-950">
            {issueScopeLabel} blockers ({blockers.length})
          </p>
          <p className="mt-1 text-xs text-red-800">
            Apply Uploaded Data is blocked until these issues are resolved.
          </p>
          <IssueList issues={blockers} tone="red" />
        </div>
      ) : null}

      {crossWarnings.length > 0 ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-sm font-medium text-amber-950">
            {issueScopeLabel} warnings ({crossWarnings.length})
          </p>
          <p className="mt-1 text-xs text-amber-800">
            Non-blocking — Apply Uploaded Data is allowed when validation passes.
          </p>
          <IssueList issues={crossWarnings} tone="amber" />
        </div>
      ) : !hasBlockers ? (
        <p className="mt-4 text-sm text-emerald-800">
          No {isFlatImport ? "import" : "cross-sheet"} warnings found.
        </p>
      ) : null}

      {rollupWarnings.length > 0 ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-sm font-medium text-amber-950">
            Rollup warnings ({rollupWarnings.length})
          </p>
          <p className="mt-1 text-xs text-amber-800">
            Non-blocking — first Admin/User contact wins in MVP rollup.
          </p>
          <ul className="mt-1 max-h-48 space-y-1 overflow-auto text-sm text-amber-900">
            {rollupWarnings.map((warning, index) => (
              <li key={`${warning.code}-${index}`}>
                [{warning.code}] {warning.message}
                {warning.customer_id ? ` (${warning.customer_id})` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : !hasBlockers ? (
        <p className="mt-4 text-sm text-emerald-800">No rollup warnings found.</p>
      ) : null}

      {infoIssues.length > 0 || notesCount > 0 ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-sm font-medium text-slate-800">
            Import notes ({infoIssues.length + notesCount})
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Informational only — does not block Apply.
          </p>
          {infoIssues.length > 0 ? (
            <IssueList issues={infoIssues} tone="slate" />
          ) : null}
          {result.importNotes && result.importNotes.length > 0 ? (
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
              {extraNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function IssueList({
  issues,
  tone,
}: {
  issues: ImportIssue[];
  tone: "red" | "amber" | "slate";
}) {
  const textClass =
    tone === "red"
      ? "text-red-900"
      : tone === "amber"
        ? "text-amber-900"
        : "text-slate-700";

  return (
    <ul className={`mt-1 max-h-48 space-y-1 overflow-auto text-sm ${textClass}`}>
      {issues.map((issue, index) => (
        <li key={`${issue.code}-${index}`}>
          [{issue.code}] {issue.message}
          {issue.sheet ? ` (${issue.sheet}` : ""}
          {issue.rowNumber ? ` row ${issue.rowNumber}` : ""}
          {issue.sheet ? ")" : ""}
          {issue.customer_id ? ` · ${issue.customer_id}` : ""}
          {issue.contact_email ? ` · ${issue.contact_email}` : ""}
        </li>
      ))}
    </ul>
  );
}

function PreviewStat({
  label,
  value,
  isText = false,
}: {
  label: string;
  value: number | string;
  isText?: boolean;
}) {
  return (
    <div className="rounded-md border border-slate-100 bg-slate-50/80 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`font-medium text-slate-900 ${isText ? "text-sm" : ""}`}>
        {value}
      </p>
    </div>
  );
}
