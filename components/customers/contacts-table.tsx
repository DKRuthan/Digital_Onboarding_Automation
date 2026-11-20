"use client";

import { useMemo, useState } from "react";
import type { Customer } from "@/lib/types";
import {
  buildContactsForDisplay,
  computeDerivedContactKey,
  displayContactToImportedExport,
  type DerivedContact,
  type DerivedContactRole,
} from "@/lib/customer-contacts";
import { computeContactTags } from "@/lib/customer-tags";
import type { SequenceEnrollment } from "@/lib/email-sequence-types";
import { exportContactDataCsv, exportImportedContactsCsv } from "@/lib/session-export";
import { gateByPermission } from "@/lib/auth/permission-ui";
import { recordClientAuditEvent } from "@/lib/audit/client-audit";
import { useCustomerData } from "@/components/providers/customer-data-provider";
import { useCan } from "@/components/auth/permissions-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CustomerTagsCell,
} from "./customer-insights-ui";

const ALL = "All";
const IN_SEQUENCE = "In Sequence";
const NOT_IN_SEQUENCE = "Not in Sequence";
const COOLING_ACTIVE = "Cooling Active";
const COOLING_CLEAR = "Clear";

const SAME_ADMIN_USER_EMAIL_TAG = "Same email for Admin and User";

interface ContactsTableProps {
  customers: Customer[];
}

export function ContactsTable({ customers }: ContactsTableProps) {
  const { sequenceEnrollments, sendLogs, importedContacts, dataSource } =
    useCustomerData();
  const canExport = useCan("export_reports");
  const exportGate = gateByPermission(canExport, "export_reports");

  const [roleFilter, setRoleFilter] = useState(ALL);
  const [sequenceFilter, setSequenceFilter] = useState(ALL);
  const [coolingFilter, setCoolingFilter] = useState(ALL);
  const [search, setSearch] = useState("");

  const enrollments = useMemo(
    () => sequenceEnrollments ?? [],
    [sequenceEnrollments],
  );
  const logs = useMemo(() => sendLogs ?? [], [sendLogs]);

  const customerMap = useMemo(
    () => new Map(customers.map((customer) => [customer.customer_id, customer])),
    [customers],
  );

  const { contacts: allContacts, source: contactDataSource } = useMemo(
    () =>
      buildContactsForDisplay({
        customers,
        importedContacts,
        dataSource,
      }),
    [customers, importedContacts, dataSource],
  );

  const roleOptions = useMemo(() => {
    const roles = new Set(allContacts.map((contact) => contact.contact_role));
    return Array.from(roles).sort((a, b) => a.localeCompare(b));
  }, [allContacts]);

  const contactInsights = useMemo(() => {
    const map = new Map<
      string,
      {
        tags: ReturnType<typeof computeContactTags>;
        inSequence: boolean;
        coolingActive: boolean;
        dataQualityLabel: string;
      }
    >();

    for (const contact of allContacts) {
      const customer = customerMap.get(contact.customer_id);
      if (!customer) continue;

      const tags = computeContactTags({
        customer,
        contactEmail: contact.contact_email,
        contactRole: contact.contact_role,
        enrollments,
        sendLogs: logs,
      });

      const inSequence = contactInSequence(contact.contact_email, enrollments);
      const coolingActive = tags.some((tag) => tag.key === "contact-cooling-active");

      map.set(computeDerivedContactKey(contact), {
        tags,
        inSequence,
        coolingActive,
        dataQualityLabel: contactDataQualityLabel(contact),
      });
    }

    return map;
  }, [allContacts, customerMap, enrollments, logs]);

  const searchNorm = search.trim().toLowerCase();

  const filtered = allContacts.filter((contact) => {
    if (roleFilter !== ALL && contact.contact_role !== roleFilter) return false;

    const insights = contactInsights.get(computeDerivedContactKey(contact));
    if (sequenceFilter === IN_SEQUENCE && !insights?.inSequence) return false;
    if (sequenceFilter === NOT_IN_SEQUENCE && insights?.inSequence) return false;

    if (coolingFilter === COOLING_ACTIVE && !insights?.coolingActive) return false;
    if (coolingFilter === COOLING_CLEAR && insights?.coolingActive) return false;

    if (searchNorm) {
      const haystack =
        `${contact.contact_email} ${contact.contact_name ?? ""} ${contact.customer_name} ${contact.customer_id}`.toLowerCase();
      if (!haystack.includes(searchNorm)) return false;
    }

    return true;
  });

  const countLabel =
    contactDataSource === "imported"
      ? `Showing ${filtered.length} of ${allContacts.length} contacts from Excel import`
      : `Showing ${filtered.length} of ${allContacts.length} derived contacts`;

  const hasActiveFilters =
    roleFilter !== ALL ||
    sequenceFilter !== ALL ||
    coolingFilter !== ALL ||
    searchNorm.length > 0;

  function clearFilters() {
    setRoleFilter(ALL);
    setSequenceFilter(ALL);
    setCoolingFilter(ALL);
    setSearch("");
  }

  const exportContext = useMemo(
    () => ({
      enrollments,
      sendLogs: logs,
      allCustomers: customers,
    }),
    [enrollments, logs, customers],
  );

  function handleExportFiltered() {
    if (contactDataSource === "imported") {
      exportImportedContactsCsv(
        filtered.map((contact) => displayContactToImportedExport(contact)),
      );
    } else {
      exportContactDataCsv(filtered, exportContext);
    }
    recordClientAuditEvent({
      action: "export.contacts_csv",
      targetType: "contact_data",
      metadata: {
        row_count: filtered.length,
        filters_applied: hasActiveFilters,
        contact_source: contactDataSource,
      },
    });
  }

  function handleExportAll() {
    if (contactDataSource === "imported") {
      exportImportedContactsCsv(
        allContacts.map((contact) => displayContactToImportedExport(contact)),
      );
    } else {
      exportContactDataCsv(allContacts, exportContext);
    }
    recordClientAuditEvent({
      action: "export.contacts_csv",
      targetType: "contact_data",
      metadata: {
        row_count: allContacts.length,
        filters_applied: false,
        contact_source: contactDataSource,
      },
    });
  }

  if (allContacts.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500">
        {dataSource === "upload"
          ? "No contacts found from the uploaded workbook. Validate and apply an Excel import with contact rows."
          : "No contacts found from the current customer data. Upload customer data with admin_email or user_email fields."}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-700">{countLabel}</p>
            <p className="text-xs text-slate-500">
              {contactDataSource === "imported"
                ? "One row per unique contact email from the import. Exports include contact_name and do_not_contact."
                : "Exports one row per derived contact email with account context, sequence status, cooling status, and data quality."}
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
              Export Filtered Contacts CSV
            </Button>
            {hasActiveFilters ? (
              <>
                <Button
                  variant="secondary"
                  onClick={handleExportAll}
                  disabled={exportGate.disabled}
                  title={exportGate.title}
                >
                  Export All Contacts CSV
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
            label="Role"
            value={roleFilter}
            onChange={setRoleFilter}
            options={roleOptions}
          />
          <FilterSelect
            label="Sequence"
            value={sequenceFilter}
            onChange={setSequenceFilter}
            options={[IN_SEQUENCE, NOT_IN_SEQUENCE]}
          />
          <FilterSelect
            label="Cooling"
            value={coolingFilter}
            onChange={setCoolingFilter}
            options={[COOLING_ACTIVE, COOLING_CLEAR]}
          />
          <label className="flex min-w-[200px] flex-1 flex-col gap-1">
            <span className="text-xs font-medium text-slate-500">Search</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Email or customer name"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </label>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <Th>Contact Email</Th>
              <Th>Contact Name</Th>
              <Th>Role</Th>
              <Th>Customer / Account</Th>
              <Th>Do Not Contact</Th>
              <Th>Owner / DAM</Th>
              <Th>Plan</Th>
              <Th>Stage</Th>
              <Th>Tags</Th>
              <Th>Sequence Status</Th>
              <Th>Cooling</Th>
              <Th>Data Quality</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={12}
                  className="px-4 py-8 text-center text-sm text-slate-500"
                >
                  No contacts match the current filters.
                </td>
              </tr>
            ) : (
              filtered.map((contact) => {
                const insights = contactInsights.get(
                  computeDerivedContactKey(contact),
                );
                const tags = insights?.tags ?? [];

                return (
                  <tr key={computeDerivedContactKey(contact)} className="hover:bg-indigo-50/40">
                    <Td className="font-medium text-slate-900">
                      {contact.contact_email}
                      {contact.display_source === "excel_import" ? (
                        <span className="mt-1 block text-xs font-normal text-indigo-600">
                          Excel Import
                        </span>
                      ) : null}
                    </Td>
                    <Td>{contact.contact_name ?? "—"}</Td>
                    <Td>
                      <Badge variant={roleVariant(contact.contact_role)}>
                        {contact.contact_role}
                      </Badge>
                      {contact.is_internal ? (
                        <span className="mt-1 block text-xs text-slate-400">
                          Internal
                        </span>
                      ) : null}
                    </Td>
                    <Td>
                      <p className="font-medium text-slate-800">
                        {contact.customer_name}
                      </p>
                      <p className="text-xs text-slate-400">{contact.customer_id}</p>
                    </Td>
                    <Td>
                      {contact.do_not_contact === true ? (
                        <Badge variant="warning">Yes</Badge>
                      ) : contact.do_not_contact === false ? (
                        <span className="text-slate-600">No</span>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td>{contact.owner ?? "—"}</Td>
                    <Td>{contact.plan ?? "—"}</Td>
                    <Td>{contact.stage ?? "—"}</Td>
                    <Td>
                      <CustomerTagsCell tags={tags} maxVisible={3} />
                    </Td>
                    <Td>
                      <Badge
                        variant={insights?.inSequence ? "info" : "muted"}
                      >
                        {insights?.inSequence ? IN_SEQUENCE : NOT_IN_SEQUENCE}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge
                        variant={
                          insights?.coolingActive ? "warning" : "success"
                        }
                      >
                        {insights?.coolingActive ? COOLING_ACTIVE : COOLING_CLEAR}
                      </Badge>
                    </Td>
                    <Td>
                      <ContactQualityBadge label={insights?.dataQualityLabel ?? "Valid"} />
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

function contactInSequence(
  contactEmail: string,
  enrollments: SequenceEnrollment[],
): boolean {
  const normalized = contactEmail.trim().toLowerCase();
  return enrollments.some(
    (entry) =>
      entry.contact_email.trim().toLowerCase() === normalized &&
      (entry.enrollment_status === "active" ||
        entry.enrollment_status === "paused"),
  );
}

function contactDataQualityLabel(contact: DerivedContact): string {
  if (contact.quality_issue_keys?.length) {
    return contact.quality_issue_keys.join("; ");
  }
  if (!contact.is_valid_email) return "Invalid email";
  if (contact.tags?.includes(SAME_ADMIN_USER_EMAIL_TAG)) {
    return SAME_ADMIN_USER_EMAIL_TAG;
  }
  return "Valid";
}

function roleVariant(role: DerivedContactRole | string) {
  switch (role) {
    case "Admin":
      return "default" as const;
    case "User":
      return "info" as const;
    case "CSM":
      return "muted" as const;
    default:
      return "muted" as const;
  }
}

function ContactQualityBadge({ label }: { label: string }) {
  let variant: "success" | "warning" | "danger" | "info" = "success";
  if (label === "Invalid email") variant = "danger";
  else if (label === SAME_ADMIN_USER_EMAIL_TAG) variant = "warning";
  else if (label !== "Valid") variant = "info";

  return <Badge variant={variant}>{label}</Badge>;
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        <option value={ALL}>{ALL}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
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
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={`px-4 py-3 text-slate-600 ${className}`}>{children}</td>
  );
}
