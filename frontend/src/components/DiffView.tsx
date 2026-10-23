"use client";

import { diffWords } from "diff";
import { useMemo } from "react";

/** Word-level diff between the extracted original text and the tailored resume text. */
export function DiffView({ original, tailored }: { original: string; tailored: string }) {
  const parts = useMemo(() => diffWords(original, tailored), [original, tailored]);
  const added = parts.filter((p) => p.added).reduce((n, p) => n + (p.count ?? 0), 0);
  const removed = parts.filter((p) => p.removed).reduce((n, p) => n + (p.count ?? 0), 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-emerald-700 dark:text-emerald-300">
          + {added} added
        </span>
        <span className="rounded bg-red-500/15 px-2 py-0.5 text-red-700 line-through dark:text-red-300">
          − {removed} removed
        </span>
        <span className="text-muted">Compared against the text extracted from your original file.</span>
      </div>
      <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-line bg-paper p-5 font-sans text-sm leading-relaxed">
        {parts.map((part, i) =>
          part.added ? (
            <ins key={i} className="rounded-sm bg-emerald-500/20 text-emerald-800 no-underline dark:text-emerald-200">
              {part.value}
            </ins>
          ) : part.removed ? (
            <del key={i} className="rounded-sm bg-red-500/15 text-red-700 dark:text-red-300">
              {part.value}
            </del>
          ) : (
            <span key={i}>{part.value}</span>
          ),
        )}
      </pre>
    </div>
  );
}
