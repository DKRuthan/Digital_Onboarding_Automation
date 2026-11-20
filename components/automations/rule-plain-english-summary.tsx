import type { EditableAutomationRule } from "@/lib/types";
import { getRulePlainEnglishSummary } from "@/lib/automation-rule-engine";

interface RulePlainEnglishSummaryProps {
  rule: EditableAutomationRule;
  variant?: "card" | "panel";
}

export function RulePlainEnglishSummary({
  rule,
  variant = "card",
}: RulePlainEnglishSummaryProps) {
  const summary = getRulePlainEnglishSummary(rule);

  const containerClass =
    variant === "panel"
      ? "rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
      : "rounded-md border border-slate-200 bg-white px-3 py-2";

  return (
    <div className={containerClass}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Plain-English summary
      </p>
      <p className="mt-2 text-sm text-slate-700">{summary.intro}</p>
      {summary.items.length > 0 && (
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">
          {summary.items.map((item, index) => (
            <li key={`${rule.id}-summary-${index}`}>{item}</li>
          ))}
        </ol>
      )}
    </div>
  );
}
