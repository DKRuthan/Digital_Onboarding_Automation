interface DetailSectionProps {
  title: string;
  children: React.ReactNode;
}

export function DetailSection({ title, children }: DetailSectionProps) {
  return (
    <section className="border-b border-slate-100 pb-5 last:border-0 last:pb-0">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </h3>
      <dl className="grid gap-3 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

export function DetailField({
  label,
  value,
  fullWidth,
  highlight,
}: {
  label: string;
  value: React.ReactNode;
  fullWidth?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className={fullWidth ? "sm:col-span-2" : undefined}>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd
        className={`mt-0.5 text-sm ${
          highlight ? "font-medium text-amber-700" : "text-slate-900"
        }`}
      >
        {value || "—"}
      </dd>
    </div>
  );
}
