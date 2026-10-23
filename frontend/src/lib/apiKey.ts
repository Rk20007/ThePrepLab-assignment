/** The visitor's own Gemini API key, kept only in this browser's localStorage. */

const STORAGE_KEY = "resume-customizer:gemini-api-key";
export const API_KEY_CHANGED_EVENT = "api-key-changed";
export const OPEN_SETTINGS_EVENT = "open-settings";

export function getApiKey(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setApiKey(key: string) {
  try {
    if (key) localStorage.setItem(STORAGE_KEY, key);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked (private mode etc.): the key just won't persist.
  }
  window.dispatchEvent(new Event(API_KEY_CHANGED_EVENT));
}

export function openSettings() {
  window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT));
}

export function maskKey(key: string) {
  return key.length > 10 ? `${key.slice(0, 6)}…${key.slice(-4)}` : "••••";
}
