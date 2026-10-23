"use client";

import { ApiError } from "@/lib/api";
import { openSettings } from "@/lib/apiKey";

/** Error banner; API-key problems get a direct shortcut to Settings. */
export function ErrorAlert({ error }: { error: Error }) {
  const keyProblem = error instanceof ApiError && error.isKeyProblem;
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
    >
      {keyProblem && <p className="mb-0.5 font-semibold">API key problem</p>}
      <p>{error.message}</p>
      {keyProblem && (
        <button
          type="button"
          onClick={openSettings}
          className="mt-2 rounded-md bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700"
        >
          Open Settings
        </button>
      )}
    </div>
  );
}
