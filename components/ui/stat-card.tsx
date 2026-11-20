import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: number | string;
  hint?: string;
  variant?: "default" | "warning" | "success" | "info";
}

const variantStyles = {
  default: "border-slate-200 bg-white",
  warning: "border-amber-200 bg-amber-50",
  success: "border-emerald-200 bg-emerald-50",
  info: "border-indigo-200 bg-indigo-50",
};

const valueStyles = {
  default: "text-slate-900",
  warning: "text-amber-900",
  success: "text-emerald-900",
  info: "text-indigo-900",
};

export function StatCard({
  label,
  value,
  hint,
  variant = "default",
}: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border p-5 shadow-sm",
        variantStyles[variant],
      )}
    >
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p
        className={cn(
          "mt-2 text-3xl font-semibold tracking-tight",
          valueStyles[variant],
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
