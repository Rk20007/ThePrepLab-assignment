"use client";

import { useRef, useState } from "react";
import { formatBytes, MAX_UPLOAD_MB } from "@/lib/api";

const ACCEPTED = [".pdf", ".docx"];

/** Returns an error message, or null if the file is acceptable. */
export function validateResumeFile(file: File): string | null {
  const name = file.name.toLowerCase();
  if (!ACCEPTED.some((ext) => name.endsWith(ext))) return "Only PDF and DOCX files are supported.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) return `File is too large (max ${MAX_UPLOAD_MB} MB).`;
  return null;
}

interface Props {
  file: File | null;
  onChange: (file: File | null) => void;
  error?: string;
  onError: (message: string) => void;
}

export function ResumeUpload({ file, onChange, error, onError }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function accept(candidate: File | undefined) {
    if (!candidate) return;
    const problem = validateResumeFile(candidate);
    if (problem) {
      onError(problem);
      return;
    }
    onChange(candidate);
  }

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium">Resume</span>
      {file ? (
        <div className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-3">
          <FileIcon ext={file.name.split(".").pop()!.toUpperCase()} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" title={file.name}>
              {file.name}
            </p>
            <p className="text-xs text-muted">{formatBytes(file.size)}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
            className="rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-subtle hover:text-foreground"
          >
            Remove
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            accept(e.dataTransfer.files[0]);
          }}
          className={`flex w-full flex-col items-center gap-1 rounded-lg border-2 border-dashed px-4 py-7 text-center transition ${
            dragging ? "border-accent bg-accent/5" : error ? "border-red-400" : "border-line hover:border-accent/60 hover:bg-subtle"
          }`}
        >
          <svg aria-hidden viewBox="0 0 24 24" className="mb-1 h-7 w-7 text-muted" fill="none" stroke="currentColor" strokeWidth={1.6}>
            <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-sm font-medium">
            Drop your resume here or <span className="text-accent">browse</span>
          </span>
          <span className="text-xs text-muted">PDF or DOCX, up to {MAX_UPLOAD_MB} MB</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        className="hidden"
        onChange={(e) => accept(e.target.files?.[0])}
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function FileIcon({ ext }: { ext: string }) {
  const color = ext === "PDF" ? "bg-red-500" : "bg-blue-600";
  return (
    <span className={`grid h-10 w-9 shrink-0 place-items-center rounded-md text-[10px] font-bold text-white ${color}`}>
      {ext}
    </span>
  );
}
