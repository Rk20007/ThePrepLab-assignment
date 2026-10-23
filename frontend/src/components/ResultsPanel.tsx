"use client";

import { useState } from "react";
import { downloadResume, type CustomizeResult, type ExportFormat, type Section } from "@/lib/api";
import { CoverLetter } from "./CoverLetter";
import { DiffView } from "./DiffView";
import { Insights } from "./Insights";
import { ResumeView } from "./ResumeView";
import { ScoreCards } from "./ScoreCards";
import { Spinner } from "./Spinner";

export interface Version {
  id: number;
  number: number;
  result: CustomizeResult;
  jobDescription: string;
  fileName: string;
  sections: Section[];
  coverLetter?: string;
}

const TABS = [
  ["resume", "Tailored resume"],
  ["diff", "What changed"],
  ["insights", "Insights"],
  ["cover", "Cover letter"],
] as const;
type Tab = (typeof TABS)[number][0];

interface Props {
  versions: Version[];
  active: Version;
  onSelect: (id: number) => void;
  onCoverLetter: (versionId: number, letter: string) => void;
  busy: boolean;
}

export function ResultsPanel({ versions, active, onSelect, onCoverLetter, busy }: Props) {
  const [tab, setTab] = useState<Tab>("resume");
  const [downloading, setDownloading] = useState<ExportFormat | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const { result } = active;

  async function download(format: ExportFormat) {
    setDownloading(format);
    setDownloadError(null);
    try {
      await downloadResume(result.tailoring.resume, format);
    } catch (err) {
      setDownloadError((err as Error).message);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className={`space-y-4 transition-opacity ${busy ? "opacity-60" : ""}`}>
      {versions.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Versions:</span>
          {versions.map((v) => (
            <button
              key={v.id}
              onClick={() => onSelect(v.id)}
              title={`${v.fileName} · ${v.sections.join(", ")}`}
              className={`rounded-full border px-3 py-1 transition ${
                v.id === active.id ? "border-accent bg-accent text-white" : "border-line hover:border-accent/50"
              }`}
            >
              v{v.number} · {v.result.scores.match_after}%
            </button>
          ))}
        </div>
      )}

      <ScoreCards scores={result.scores} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" className="flex gap-1 overflow-x-auto rounded-lg bg-subtle p-1">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition ${
                tab === id ? "bg-surface shadow-sm" : "text-muted hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {(["pdf", "docx", "txt"] as const).map((format) => (
            <button key={format} onClick={() => download(format)} disabled={!!downloading} className="btn-secondary">
              {downloading === format ? <Spinner /> : <DownloadIcon />}
              {format.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      {downloadError && <p className="text-sm text-red-600">{downloadError}</p>}

      <div role="tabpanel">
        {tab === "resume" && <ResumeView resume={result.tailoring.resume} matched={result.tailoring.matched_skills} />}
        {tab === "diff" && <DiffView original={result.original_text} tailored={result.tailored_text} />}
        {tab === "insights" && <Insights result={result} />}
        {tab === "cover" && (
          <CoverLetter
            key={active.id}
            jobDescription={active.jobDescription}
            resume={result.tailoring.resume}
            letter={active.coverLetter}
            onGenerated={(letter) => onCoverLetter(active.id, letter)}
          />
        )}
      </div>

      <p className="text-right text-xs text-muted">
        Generated with {result.provider} · {result.model}
      </p>
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 4v12m0 0-4-4m4 4 4-4M4 20h16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
