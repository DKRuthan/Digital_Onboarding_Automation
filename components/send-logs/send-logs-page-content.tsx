"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import {
  logStatusVariant,
  sendLogModeLabel,
  sendLogModeVariant,
  Badge,
} from "@/components/ui/badge";
import { useCustomerData } from "@/components/providers/customer-data-provider";
import { formatDateTime } from "@/lib/utils";
import { exportSendLogsCsv } from "@/lib/session-export";
import {
  displayLogActionReference,
  displayLogContactEmailLabel,
  displayLogDeliveryStatus,
  displayLogDeliveryTarget,
  displayLogProvider,
  displayLogRecipientType,
  displayLogRole,
  displayLogSequenceStep,
  displayLogSource,
  logMatchesSearch,
} from "@/lib/communication-log-display";
import { Button } from "@/components/ui/button";

export function SendLogsPageContent() {
  const { sendLogs, customers } = useCustomerData();
  const [search, setSearch] = useState("");

  const customerIdByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const customer of customers) {
      map.set(customer.customer_name, customer.customer_id);
    }
    return map;
  }, [customers]);

  const filteredLogs = useMemo(
    () => sendLogs.filter((log) => logMatchesSearch(log, search)),
    [sendLogs, search],
  );

  function handleExport() {
    exportSendLogsCsv(sendLogs, customers);
  }

  return (
    <>
      <PageHeader
        title="Communication Logs"
        description="Contact-first history of demo events, simulated logs, test sends, dry runs, live internal alerts, and workflow events. Exports contact-first communication history."
      >
        <Button variant="outline" onClick={handleExport}>
          Export Communication Logs CSV
        </Button>
      </PageHeader>
      <div className="p-6 lg:p-8">
        <p
          role="note"
          className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600"
        >
          Session-only logs: new test, dry-run, and live entries reset on page
          refresh.
        </p>

        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="flex min-w-[240px] flex-1 flex-col gap-1">
            <span className="text-xs font-medium text-slate-500">Search</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Contact, recipient, customer, template, status…"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </label>
          <span className="pb-2 text-sm text-slate-500">
            {filteredLogs.length} of {sendLogs.length} logs
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <Th>Time</Th>
                <Th>Recipient / Contact Email</Th>
                <Th>Role</Th>
                <Th>Customer / Account</Th>
                <Th>Source</Th>
                <Th>Template</Th>
                <Th>Sequence / Step</Th>
                <Th>Status</Th>
                <Th>Send Mode</Th>
                <Th>Delivery Status</Th>
                <Th>Provider</Th>
                <Th>Action / Step Ref</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.map((log) => {
                const contactLabel = displayLogContactEmailLabel(log);
                const contactResolved =
                  contactLabel !== "Contact email not resolved";
                const deliveryTarget = displayLogDeliveryTarget(log);
                const role = displayLogRole(log);
                const recipientType = displayLogRecipientType(log);
                const customerId =
                  log.customer_id ?? customerIdByName.get(log.customer_name);

                return (
                  <tr key={log.id} className="hover:bg-slate-50/80">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {formatDateTime(log.date)}
                    </td>
                    <td className="px-4 py-3">
                      <p
                        className={
                          contactResolved
                            ? "font-medium text-slate-900"
                            : "font-medium text-amber-800"
                        }
                      >
                        {contactLabel}
                      </p>
                      {deliveryTarget ? (
                        <p
                          className="mt-0.5 text-xs text-slate-500"
                          title="Delivery target for internal routing"
                        >
                          Delivery target: {deliveryTarget}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {recipientType ?? role ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">
                        {log.customer_name}
                      </p>
                      {customerId ? (
                        <p className="text-xs text-slate-400">{customerId}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="muted">{displayLogSource(log)}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <code className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                        {log.template || "—"}
                      </code>
                      {log.subject ? (
                        <p
                          className="mt-1 max-w-xs truncate text-xs text-slate-500"
                          title={log.subject}
                        >
                          {log.subject}
                        </p>
                      ) : null}
                    </td>
                    <td className="max-w-xs px-4 py-3 text-slate-600">
                      {displayLogSequenceStep(log)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={logStatusVariant(log.status)}>
                        {log.status}
                      </Badge>
                      {log.note ? (
                        <p
                          className="mt-1 max-w-xs text-xs text-slate-500"
                          title={log.note}
                        >
                          {log.note}
                        </p>
                      ) : null}
                      {log.error ? (
                        <p
                          className="mt-0.5 max-w-xs text-xs text-red-600"
                          title={log.error}
                        >
                          {log.error}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      {log.send_mode ? (
                        <Badge variant={sendLogModeVariant(log.send_mode)}>
                          {sendLogModeLabel(log.send_mode)}
                        </Badge>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {displayLogDeliveryStatus(log)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {displayLogProvider(log)}
                    </td>
                    <td className="max-w-[10rem] truncate px-4 py-3 font-mono text-xs text-slate-500">
                      {displayLogActionReference(log)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
      {children}
    </th>
  );
}
