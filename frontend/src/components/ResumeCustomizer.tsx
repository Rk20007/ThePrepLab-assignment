"use client";

import { useEffect, useState } from "react";
import { customizeResume, JD_MIN_CHARS, SECTIONS, type CustomizeResult, type Section } from "@/lib/api";
import { ErrorAlert } from "./ErrorAlert";
import { JobDescriptionInput } from "./JobDescriptionInput";
import { ResultsPanel, type Version } from "./ResultsPanel";
import { ResumeUpload } from "./ResumeUpload";
import { Spinner } from "./Spinner";

const SECTION_LABELS: Record<Section, string> = {
  summary: "Summary",
  skills: "Skills",
  experience: "Experience",
};

const PROGRESS_STEPS = [
  "Reading your resume…",
  "Analyzing the job description…",
  "Rewriting your summary…",
  "Reordering experience bullets…",
  "Scoring keyword match…",
];

export function ResumeCustomizer() {
  const [jd, setJd] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sections, setSections] = useState<Section[]>([...SECTIONS]);
  const [errors, setErrors] = useState<{ jd?: string; file?: string; form?: Error }>({});
  const [loading, setLoading] = useState(false);
  const [versions, setVersions] = useState<Version[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);

  function toggleSection(section: Section) {
    setSections((prev) =>
      prev.includes(section) ? prev.filter((s) => s !== section) : SECTIONS.filter((s) => s === section || prev.includes(s)),
    );
  }

  function validate() {
    const next: typeof errors = {};
    const length = jd.trim().length;
    if (!length) next.jd = "Please paste a job description.";
    else if (length < JD_MIN_CHARS) next.jd = `The job description looks too short (min ${JD_MIN_CHARS} characters).`;
    if (!file) next.file = "Please upload your resume.";
    if (!sections.length) next.form = new Error("Choose at least one section to customize.");
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading || !validate()) return;
    setLoading(true);
    try {
      const result: CustomizeResult = await customizeResume(jd.trim(), file!, sections);
      const version: Version = {
        id: Date.now(),
        number: versions.length + 1,
        result,
        jobDescription: jd.trim(),
        fileName: file!.name,
        sections,
      };
      setVersions((prev) => [...prev, version]);
      setActiveId(version.id);
    } catch (err) {
      setErrors({ form: err as Error });
    } finally {
      setLoading(false);
    }
  }

  const active = versions.find((v) => v.id === activeId) ?? null;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
      <form onSubmit={handleSubmit} noValidate className="space-y-5 rounded-2xl border border-line bg-surface p-5 shadow-sm lg:sticky lg:top-6">
        <JobDescriptionInput
          value={jd}
          onChange={(value) => {
            setJd(value);
            if (errors.jd) setErrors((p) => ({ ...p, jd: undefined }));
          }}
          error={errors.jd}
        />
        <ResumeUpload
          file={file}
          onChange={(f) => {
            setFile(f);
            setErrors((p) => ({ ...p, file: undefined }));
          }}
          error={errors.file}
          onError={(message) => setErrors((p) => ({ ...p, file: message }))}
        />

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Sections to customize</legend>
          <div className="flex flex-wrap gap-2">
            {SECTIONS.map((s) => {
              const on = sections.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggleSection(s)}
                  className={`rounded-full border px-3 py-1 text-sm transition ${
                    on ? "border-accent bg-accent/10 font-medium text-accent" : "border-line text-muted hover:border-accent/50"
                  }`}
                >
                  {on ? "✓ " : ""}
                  {SECTION_LABELS[s]}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-muted">Unselected sections are kept as written.</p>
        </fieldset>

        {errors.form && <ErrorAlert error={errors.form} />}

        <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
          {loading && <Spinner />}
          {loading ? "Tailoring your resume…" : versions.length ? "Generate new version" : "Tailor my resume"}
        </button>
      </form>

      <div className="min-w-0">
        {loading && !active ? (
          <LoadingState />
        ) : active ? (
          <ResultsPanel
            versions={versions}
            active={active}
            onSelect={setActiveId}
            onCoverLetter={(versionId, letter) =>
              setVersions((prev) => prev.map((v) => (v.id === versionId ? { ...v, coverLetter: letter } : v)))
            }
            busy={loading}
          />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  const steps = [
    ["Paste the job description", "The full posting works best — requirements and nice-to-haves."],
    ["Upload your resume", "PDF or DOCX. Text is extracted on the server; nothing is stored."],
    ["Get a tailored version", "Rewritten summary, prioritized skills, JD-aligned bullets, plus match & ATS scores."],
  ];
  return (
    <div className="rounded-2xl border border-dashed border-line px-6 py-12 sm:px-12">
      <h2 className="text-lg font-semibold">How it works</h2>
      <ol className="mt-5 space-y-5">
        {steps.map(([title, body], i) => (
          <li key={title} className="flex gap-4">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent/10 text-sm font-bold text-accent">
              {i + 1}
            </span>
            <div>
              <p className="font-medium">{title}</p>
              <p className="text-sm text-muted">{body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-8 rounded-lg bg-subtle px-4 py-3 text-sm text-muted">
        The AI is instructed never to invent experience — anything the job asks for that your resume doesn&apos;t
        show is listed separately as a suggestion.
      </p>
    </div>
  );
}

function LoadingState() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => Math.min(s + 1, PROGRESS_STEPS.length - 1)), 3500);
    return () => clearInterval(id);
  }, []);

  return (
    <div aria-live="polite" className="space-y-4">
      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
        <Spinner />
        <span>{PROGRESS_STEPS[step]}</span>
      </div>
      <div className="animate-pulse space-y-3 rounded-xl border border-line bg-surface p-8">
        <div className="mx-auto h-6 w-48 rounded bg-subtle" />
        <div className="mx-auto h-3 w-72 rounded bg-subtle" />
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-3 rounded bg-subtle" style={{ width: `${60 + ((i * 37) % 40)}%` }} />
        ))}
      </div>
    </div>
  );
}
