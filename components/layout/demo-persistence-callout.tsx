type DemoPersistenceCalloutProps = {
  compact?: boolean;
};

export function DemoPersistenceCallout({
  compact = false,
}: DemoPersistenceCalloutProps) {
  if (compact) {
    return (
      <p className="mt-1.5 text-xs text-slate-600">
        Local prototype: applied imports persist in this browser. Workflow
        progress, communication logs, and reports snapshots are session/demo
        state. No customer emails are sent. Send APIs are gated. Production
        database not connected.
      </p>
    );
  }

  return (
    <div
      role="note"
      className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
    >
      <p className="font-medium text-slate-900">Persistence in this demo</p>
      <p className="mt-1 text-xs text-slate-600">
        Controlled local prototype — not production. No customer emails are sent.
        Send APIs are gated by default.
      </p>
      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Persists after refresh
          </p>
          <ul className="mt-1 list-inside list-disc text-xs text-slate-700">
            <li>Applied uploaded customers</li>
            <li>Imported contacts</li>
            <li>Active import metadata</li>
            <li>Automation rules, templates, sequences (localStorage)</li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Session / demo state
          </p>
          <ul className="mt-1 list-inside list-disc text-xs text-slate-700">
            <li>Action Queue workflow progress</li>
            <li>Communication Logs</li>
            <li>Reports snapshot</li>
            <li>Audit logs (unless DB configured)</li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Not active
          </p>
          <ul className="mt-1 list-inside list-disc text-xs text-slate-700">
            <li>Server / Neon persistence</li>
            <li>Customer-facing sending</li>
            <li>Automatic sends</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
