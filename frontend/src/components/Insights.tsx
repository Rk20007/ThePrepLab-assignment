import type { CustomizeResult } from "@/lib/api";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Chips({ items, tone }: { items: string[]; tone: "good" | "warn" }) {
  if (!items.length) return <p className="text-sm text-muted">None.</p>;
  const cls =
    tone === "good"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : "bg-amber-500/15 text-amber-800 dark:text-amber-300";
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li key={item} className={`rounded-full px-2.5 py-0.5 text-sm ${cls}`}>
          {item}
        </li>
      ))}
    </ul>
  );
}

export function Insights({ result }: { result: CustomizeResult }) {
  const { tailoring, scores } = result;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Missing keywords to consider">
        <p className="mb-3 text-sm text-muted">
          The JD asks for these but your resume doesn&apos;t show them. Add only the ones you genuinely have.
        </p>
        <Chips items={tailoring.missing_keywords} tone="warn" />
      </Card>
      <Card title="Skills that match the JD">
        <Chips items={tailoring.matched_skills} tone="good" />
      </Card>
      <Card title="What the AI changed">
        <ul className="list-disc space-y-1.5 pl-5 text-sm marker:text-muted">
          {tailoring.changes.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      </Card>
      <Card title={`ATS checklist — ${scores.ats}/100`}>
        <ul className="space-y-2 text-sm">
          {scores.ats_checks.map((check) => (
            <li key={check.label} className="flex gap-2">
              <span
                aria-label={check.passed ? "Passed" : "Needs work"}
                className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white ${
                  check.passed ? "bg-emerald-500" : "bg-amber-500"
                }`}
              >
                {check.passed ? "✓" : "!"}
              </span>
              <span>
                {check.label}
                {!check.passed && <span className="block text-xs text-muted">{check.tip}</span>}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
