"use client";

import type { RuleTiming } from "@/lib/types";
import { formatTimingSummary } from "@/lib/automation-rule-scheduling";

interface RuleTimingSummaryProps {
  timing: RuleTiming;
  variant?: "inline" | "panel";
}

export function RuleTimingSummary({
  timing,
  variant = "inline",
}: RuleTimingSummaryProps) {
  const summary = formatTimingSummary(timing);

  if (variant === "panel") {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Timing summary
        </p>
        <p className="mt-1">{summary}</p>
      </div>
    );
  }

  return <p className="text-sm text-slate-600">{summary}</p>;
}
