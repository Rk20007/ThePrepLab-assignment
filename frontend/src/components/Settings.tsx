"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { checkApiKey } from "@/lib/api";
import { API_KEY_CHANGED_EVENT, getApiKey, maskKey, OPEN_SETTINGS_EVENT, openSettings, setApiKey } from "@/lib/apiKey";
import { Spinner } from "./Spinner";

function subscribe(onChange: () => void) {
  window.addEventListener(API_KEY_CHANGED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(API_KEY_CHANGED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useStoredApiKey() {
  return useSyncExternalStore(subscribe, getApiKey, () => "");
}

type Status = { kind: "idle" | "testing" | "ok" | "error"; message?: string };

/** Top-right Settings button plus the dialog where visitors can use their own Gemini API key. */
export function Settings() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const savedKey = useStoredApiKey();
  const [draft, setDraft] = useState("");
  const [reveal, setReveal] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  // Opened via an event so error banners elsewhere in the app can open it too.
  useEffect(() => {
    function open() {
      setDraft(getApiKey());
      setStatus({ kind: "idle" });
      setReveal(false);
      dialogRef.current?.showModal();
    }
    window.addEventListener(OPEN_SETTINGS_EVENT, open);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, open);
  }, []);

  async function test(key: string) {
    setStatus({ kind: "testing" });
    try {
      const res = await checkApiKey(key);
      setStatus({
        kind: "ok",
        message: `${res.source === "user" ? "Your key" : "The app's default key"} works (model: ${res.model}).`,
      });
      return true;
    } catch (err) {
      setStatus({ kind: "error", message: (err as Error).message });
      return false;
    }
  }

  async function save() {
    const key = draft.trim();
    if (key && !(await test(key))) return;
    setApiKey(key);
    if (!key) setStatus({ kind: "ok", message: "Switched back to the app's default key." });
  }

  function remove() {
    setDraft("");
    setApiKey("");
    setStatus({ kind: "ok", message: "Your key was removed. The app's default key will be used." });
  }

  return (
    <>
      <button type="button" onClick={openSettings} className="btn-secondary relative" aria-label="Settings">
        <GearIcon />
        <span className="hidden sm:inline">Settings</span>
        {savedKey && (
          <span
            title="Using your own API key"
            className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-background"
          />
        )}
      </button>

      <dialog
        ref={dialogRef}
        onClick={(e) => e.target === dialogRef.current && dialogRef.current?.close()}
        className="m-auto w-[min(520px,calc(100vw-32px))] rounded-2xl border border-line bg-surface p-0 text-foreground shadow-xl backdrop:bg-black/40"
      >
        <form
          method="dialog"
          className="space-y-4 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Settings</h2>
              <p className="text-sm text-muted">
                Currently using:{" "}
                <span className="font-medium text-foreground">
                  {savedKey ? `your key (${maskKey(savedKey)})` : "the app's default key"}
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              aria-label="Close"
              className="rounded-md px-2 py-1 text-muted hover:bg-subtle hover:text-foreground"
            >
              ✕
            </button>
          </div>

          <div>
            <label htmlFor="gemini-key" className="mb-1.5 block text-sm font-medium">
              Your Gemini API key <span className="font-normal text-muted">(optional)</span>
            </label>
            <div className="flex gap-2">
              <input
                id="gemini-key"
                type={reveal ? "text" : "password"}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setStatus({ kind: "idle" });
                }}
                placeholder="AIza…"
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 rounded-lg border border-line bg-background px-3 py-2 font-mono text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
              <button type="button" onClick={() => setReveal((r) => !r)} className="btn-secondary">
                {reveal ? "Hide" : "Show"}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-muted">
              Use this if the app&apos;s key runs out of quota. Get a free key at{" "}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-accent underline underline-offset-2"
              >
                Google AI Studio
              </a>
              . It&apos;s stored only in this browser and sent with your requests — never saved on our server.
            </p>
          </div>

          {status.kind !== "idle" && (
            <div
              role="status"
              className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
                status.kind === "error"
                  ? "bg-red-500/10 text-red-700 dark:text-red-300"
                  : status.kind === "ok"
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "bg-subtle text-muted"
              }`}
            >
              {status.kind === "testing" ? (
                <>
                  <Spinner /> Checking key…
                </>
              ) : (
                status.message
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => test(draft.trim())}
              disabled={status.kind === "testing"}
              className="btn-secondary"
            >
              {draft.trim() ? "Test key" : "Test default key"}
            </button>
            <div className="flex gap-2">
              {savedKey && (
                <button type="button" onClick={remove} className="btn-secondary text-red-600">
                  Remove my key
                </button>
              )}
              <button type="submit" disabled={status.kind === "testing"} className="btn-primary">
                Save
              </button>
            </div>
          </div>
        </form>
      </dialog>
    </>
  );
}

function GearIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path
        d="M10.3 4.3c.4-1.7 2.9-1.7 3.4 0a1.7 1.7 0 0 0 2.6 1.1c1.5-.9 3.3.8 2.4 2.4a1.7 1.7 0 0 0 1 2.5c1.8.5 1.8 3 0 3.4a1.7 1.7 0 0 0-1 2.6c.9 1.5-.9 3.3-2.4 2.4a1.7 1.7 0 0 0-2.6 1c-.5 1.8-3 1.8-3.4 0a1.7 1.7 0 0 0-2.6-1c-1.5.9-3.3-.9-2.4-2.4a1.7 1.7 0 0 0-1-2.6c-1.8-.4-1.8-2.9 0-3.4a1.7 1.7 0 0 0 1-2.5c-.9-1.6.9-3.3 2.4-2.4a1.7 1.7 0 0 0 2.6-1.1Z"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
