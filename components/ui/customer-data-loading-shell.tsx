export function CustomerDataLoadingShell({
  label = "Loading local demo state…",
}: {
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-600"
    >
      {label}
    </div>
  );
}
