"use client";

import { useEffect, useState } from "react";
import { useCan } from "@/components/auth/permissions-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { gateByPermission } from "@/lib/auth/permission-ui";
import { formatDateTime } from "@/lib/utils";

type AuditLogRow = {
  id: string;
  created_at: string;
  action: string;
  result: string;
  source: string;
  severity: string;
  actor_role: string | null;
  target_type: string;
  target_id: string | null;
  permission: string | null;
  send_mode: string | null;
  request_id: string | null;
};

type AuditLogsResponse = {
  success: boolean;
  configured: boolean;
  enabled: boolean;
  rows: AuditLogRow[];
  message?: string;
};

export function AuditLogsReportSection() {
  const canView = useCan("view_audit_logs");
  const viewGate = gateByPermission(canView, "view_audit_logs");

  const [loading, setLoading] = useState(canView);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AuditLogsResponse | null>(null);

  useEffect(() => {
    if (!canView) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/audit-logs");
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error ?? `Request failed (${response.status})`);
        }
        const body = (await response.json()) as AuditLogsResponse;
        if (!cancelled) {
          setData(body);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load audit logs.",
          );
          setData(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canView]);

  if (!canView) {
    return null;
  }

  const configured = data?.configured ?? false;
  const enabled = data?.enabled ?? false;
  const rows = data?.rows ?? [];
  const statusMessage =
    data?.message ??
    error ??
    (loading ? "Loading audit log status…" : undefined);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Audit Logs</h2>
            <p className="mt-1 text-sm text-slate-500">
              Read-only append-only operator audit trail. UI-origin events are
              non-authoritative until Phase I server persistence.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={viewGate.disabled || loading || rows.length === 0}
            title={
              viewGate.title ??
              (rows.length === 0 ? "No audit rows to export" : undefined)
            }
            onClick={() => {
              window.open("/api/audit-logs?format=csv", "_blank", "noopener");
            }}
          >
            Export Audit CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatusStat label="Audit enabled" value={enabled ? "Yes" : "No"} />
          <StatusStat
            label="Database configured"
            value={configured ? "Yes" : "No"}
          />
          <StatusStat label="Rows shown" value={String(rows.length)} />
        </div>

        {statusMessage && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              configured && rows.length > 0
                ? "border-slate-200 bg-slate-50 text-slate-700"
                : "border-amber-200 bg-amber-50 text-amber-950"
            }`}
          >
            {statusMessage}
          </div>
        )}

        {rows.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">Result</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">Target</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id} className="text-slate-700">
                    <td className="whitespace-nowrap px-3 py-2 text-xs">
                      {formatDateTime(row.created_at)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{row.action}</td>
                    <td className="px-3 py-2">{row.result}</td>
                    <td className="px-3 py-2">{row.source}</td>
                    <td className="px-3 py-2">{row.actor_role ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className="text-slate-500">{row.target_type}</span>
                      {row.target_id ? (
                        <span className="ml-1 font-mono text-xs">
                          {row.target_id}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function StatusStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-medium text-slate-900">{value}</p>
    </div>
  );
}
