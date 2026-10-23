import { getApiKey } from "./apiKey";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

export const SECTIONS = ["summary", "skills", "experience"] as const;
export type Section = (typeof SECTIONS)[number];

export const MAX_UPLOAD_MB = 5;
export const JD_MIN_CHARS = 100;
export const JD_MAX_CHARS = 15000;

export interface Experience {
  title: string;
  company: string;
  location: string;
  dates: string;
  bullets: string[];
}

export interface Education {
  degree: string;
  institution: string;
  dates: string;
  details: string;
}

export interface Resume {
  name: string;
  headline: string;
  contact: string[];
  summary: string;
  skills: string[];
  experience: Experience[];
  education: Education[];
  extra_sections: { heading: string; items: string[] }[];
}

export interface AtsCheck {
  label: string;
  passed: boolean;
  tip: string;
}

export interface CustomizeResult {
  original_text: string;
  tailored_text: string;
  tailoring: {
    resume: Resume;
    matched_skills: string[];
    missing_keywords: string[];
    changes: string[];
  };
  scores: { match_before: number; match_after: number; ats: number; ats_checks: AtsCheck[] };
  provider: string;
  model: string;
}

export type ExportFormat = "pdf" | "docx" | "txt";

/** LLM calls can be slow, and free-tier hosts may need to cold-start. */
const TIMEOUT_MS = 150_000;

/** Error codes the backend uses for API-key problems the user can fix in Settings. */
export const KEY_ERROR_CODES = ["no_key", "invalid_key", "quota_exceeded", "key_rejected"];

export class ApiError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
  }

  get isKeyProblem() {
    return !!this.code && KEY_ERROR_CODES.includes(this.code);
  }
}

async function request(path: string, init: RequestInit, apiKey = getApiKey()): Promise<Response> {
  const headers = new Headers(init.headers);
  if (apiKey) headers.set("X-Gemini-Api-Key", apiKey);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error("The request timed out. Please try again.");
    }
    throw new Error(
      "Couldn't reach the server. If this is the first request in a while, the server may be waking up — please retry in a few seconds.",
    );
  }
  if (!res.ok) throw await toApiError(res);
  return res;
}

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const body = await res.json();
    if (typeof body.detail === "string") return new ApiError(body.detail, body.code);
    // FastAPI validation errors come back as a list.
    if (Array.isArray(body.detail) && body.detail[0]?.msg) return new ApiError(body.detail[0].msg);
  } catch {
    // fall through to a generic message
  }
  return new ApiError(`Something went wrong (HTTP ${res.status}). Please try again.`);
}

/** Makes a tiny real LLM call with `apiKey` (or the server's key if empty). */
export async function checkApiKey(apiKey: string) {
  const res = await request("/api/check-key", { method: "POST" }, apiKey);
  return (await res.json()) as { ok: boolean; model: string; source: "user" | "server" };
}

export async function customizeResume(jobDescription: string, file: File, sections: Section[]) {
  const form = new FormData();
  form.append("job_description", jobDescription);
  form.append("file", file);
  form.append("sections", sections.join(","));
  const res = await request("/api/customize", { method: "POST", body: form });
  return (await res.json()) as CustomizeResult;
}

export async function generateCoverLetter(jobDescription: string, resume: Resume) {
  const res = await request("/api/cover-letter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ job_description: jobDescription, resume }),
  });
  return ((await res.json()) as { cover_letter: string }).cover_letter;
}

export async function downloadResume(resume: Resume, format: ExportFormat) {
  const res = await request("/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resume, format }),
  });
  const filename =
    res.headers.get("Content-Disposition")?.match(/filename="(.+?)"/)?.[1] ?? `resume-tailored.${format}`;
  saveBlob(await res.blob(), filename);
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
