import type { ContactsImportQualitySummary } from "@/lib/import-contacts-quality-summary";
import type { ValidationResult } from "@/lib/upload-validation";

type ContactsImportQualityPreviewProps = {
  result: ValidationResult;
  isFlatImport?: boolean;
};

export function ContactsImportQualityPreview({
  result,
  isFlatImport = false,
}: ContactsImportQualityPreviewProps) {
  const quality = result.importSummary?.contactsQuality;
  if (!quality || result.importSummary?.format !== "option_c") {
    return null;
  }

  const extraNotPersisted =
    quality.extraAdminNotPersisted +
    quality.extraUserNotPersisted +
    quality.extraCsmNotPersisted;

  const hasContactIssues =
    quality.accountsMissingAdmin > 0 ||
    quality.accountsWithNoContacts > 0 ||
    quality.duplicateContactEmails > 0 ||
    quality.duplicateContactRows > 0 ||
    quality.orphanContacts > 0 ||
    quality.orphanSignals > 0 ||
    quality.emailsAcrossAccounts > 0 ||
    quality.doNotContactContacts > 0 ||
    extraNotPersisted > 0;

  return (
    <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50/50 p-4">
      <h4 className="text-sm font-semibold text-violet-950">
        Contacts Data Quality Preview
      </h4>
      <p className="mt-1 text-xs text-violet-900/80">
        Preview-only insights from imported contact rows. contact_email is the
        primary operational identity; account is context. Does not change
        validation pass/fail.
      </p>

      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <QualityStat label="Total contacts" value={quality.totalContacts} />
        <QualityStat label="Admin contacts" value={quality.adminContacts} />
        <QualityStat label="User contacts" value={quality.userContacts} />
        <QualityStat label="CSM contacts" value={quality.csmContacts} />
        <QualityStat
          label="Do-not-contact contacts"
          value={quality.doNotContactContacts}
          highlight={quality.doNotContactContacts > 0 ? "warning" : undefined}
        />
        <QualityStat
          label="Accounts missing Admin"
          value={quality.accountsMissingAdmin}
          highlight={quality.accountsMissingAdmin > 0 ? "warning" : undefined}
        />
        <QualityStat
          label="Duplicate contact emails"
          value={quality.duplicateContactEmails}
          highlight={quality.duplicateContactEmails > 0 ? "danger" : undefined}
        />
        {!isFlatImport ? (
          <QualityStat
            label="Orphan signals"
            value={quality.orphanSignals}
            highlight={quality.orphanSignals > 0 ? "danger" : undefined}
          />
        ) : null}
        <QualityStat
          label="Duplicate contact rows"
          value={quality.duplicateContactRows}
          highlight={quality.duplicateContactRows > 0 ? "danger" : undefined}
        />
        <QualityStat
          label="Orphan contacts"
          value={quality.orphanContacts}
          highlight={quality.orphanContacts > 0 ? "danger" : undefined}
        />
        <QualityStat
          label="Same email across accounts"
          value={quality.emailsAcrossAccounts}
          highlight={quality.emailsAcrossAccounts > 0 ? "warning" : undefined}
        />
        <QualityStat
          label="Extra Admin not in account rollup"
          value={quality.extraAdminNotPersisted}
          highlight={quality.extraAdminNotPersisted > 0 ? "info" : undefined}
        />
        <QualityStat
          label="Extra User not in account rollup"
          value={quality.extraUserNotPersisted}
          highlight={quality.extraUserNotPersisted > 0 ? "info" : undefined}
        />
        <QualityStat
          label="Extra CSM not in account rollup"
          value={quality.extraCsmNotPersisted}
          highlight={quality.extraCsmNotPersisted > 0 ? "info" : undefined}
        />
      </div>

      {extraNotPersisted > 0 ? (
        <p className="mt-3 text-xs text-violet-900/80">
          Imported contact rows are preserved in session and shown in Contacts /
          Emails. MVP account rollup still maps the first Admin and first User
          per account on the Customer model ({extraNotPersisted} extra Admin,
          User, or CSM row(s) are not mapped into account admin/user fields).
        </p>
      ) : (
        <p className="mt-3 text-xs text-violet-900/80">
          Imported contact rows are preserved in session and shown in Contacts /
          Emails after apply.
        </p>
      )}

      {quality.doNotContactContacts > 0 ? (
        <p className="mt-2 text-xs text-amber-900">
          {quality.doNotContactContacts} contact(s) marked do_not_contact=Yes.
          Values are preserved in imported contacts and shown on the Contacts /
          Emails tab.
        </p>
      ) : null}

      {!hasContactIssues ? (
        <p className="mt-3 text-sm text-emerald-800">
          No contact quality issues detected in preview.
        </p>
      ) : null}
    </div>
  );
}

function QualityStat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
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
    <div className="rounded-md border border-violet-100 bg-white/80 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`font-medium ${valueClass}`}>{value}</p>
    </div>
  );
}

export type { ContactsImportQualitySummary };
