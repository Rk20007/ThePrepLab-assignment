"use client";

import { useState } from "react";
import { generateCoverLetter, saveBlob, type Resume } from "@/lib/api";
import { ErrorAlert } from "./ErrorAlert";
import { Spinner } from "./Spinner";

interface Props {
  jobDescription: string;
  resume: Resume;
  letter: string | undefined;
  onGenerated: (letter: string) => void;
}

export function CoverLetter({ jobDescription, resume, letter, onGenerated }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      onGenerated(await generateCoverLetter(jobDescription, resume));
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(letter ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!letter) {
    return (
      <div className="rounded-xl border border-dashed border-line px-6 py-12 text-center">
        <p className="font-medium">Generate a matching cover letter</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">
          Uses your tailored resume and the job description. Only facts from your resume are used.
        </p>
        <button onClick={generate} disabled={loading} className="btn-primary mt-5">
          {loading && <Spinner />}
          {loading ? "Writing…" : "Generate cover letter"}
        </button>
        {error && (
          <div className="mx-auto mt-4 max-w-md text-left">
            <ErrorAlert error={error} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <button onClick={copy} className="btn-secondary">
          {copied ? "Copied!" : "Copy"}
        </button>
        <button
          onClick={() => saveBlob(new Blob([letter], { type: "text/plain" }), "cover-letter.txt")}
          className="btn-secondary"
        >
          Download .txt
        </button>
        <button onClick={generate} disabled={loading} className="btn-secondary">
          {loading && <Spinner />}
          Regenerate
        </button>
      </div>
      {error && (
        <div className="mb-3">
          <ErrorAlert error={error} />
        </div>
      )}
      <div className="mx-auto max-w-[800px] whitespace-pre-wrap rounded-xl border border-line bg-paper px-6 py-8 leading-relaxed sm:px-10">
        {letter}
      </div>
    </div>
  );
}
