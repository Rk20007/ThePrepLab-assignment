import type { CustomizeResult } from "@/lib/api";

function tone(score: number) {
  if (score >= 75) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function Bar({ value }: { value: number }) {
  return (
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-subtle">
      <div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${value}%` }} />
    </div>
  );
}

export function ScoreCards({ scores }: { scores: CustomizeResult["scores"] }) {
  const delta = scores.match_after - scores.match_before;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-line bg-surface p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">JD keyword match</p>
        <p className="mt-1 flex items-baseline gap-2">
          <span className="text-sm text-muted line-through decoration-1">{scores.match_before}%</span>
          <span className="text-muted">→</span>
          <span className={`text-3xl font-bold tabular-nums ${tone(scores.match_after)}`}>{scores.match_after}%</span>
          {delta !== 0 && (
            <span className={`text-sm font-medium ${delta > 0 ? "text-emerald-600" : "text-red-600"}`}>
              {delta > 0 ? "+" : ""}
              {delta}
            </span>
          )}
        </p>
        <Bar value={scores.match_after} />
      </div>
      <div className="rounded-xl border border-line bg-surface p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">ATS friendliness</p>
        <p className={`mt-1 text-3xl font-bold tabular-nums ${tone(scores.ats)}`}>
          {scores.ats}
          <span className="text-base font-medium text-muted">/100</span>
        </p>
        <Bar value={scores.ats} />
      </div>
    </div>
  );
}
