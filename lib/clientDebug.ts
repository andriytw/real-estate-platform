/**
 * Client-side debug output (console + optional localStorage ring + optional local ingest).
 *
 * - `VITE_CLIENT_DEBUG_LOGS=1` — enable `isClientDebugLogsEnabled()` / `clientDebugLog` (including production if set).
 * - `VITE_CLIENT_DEBUG_LOGS=0` — force off even when overriding.
 * - Default: off everywhere; use for rare prod diagnostics or opt-in verbose paths (`_dbg`, AuthGate DBG).
 *
 * - `devConsoleLog` — local Vite dev only (`import.meta.env.DEV`); use for developer-only chatter.
 *
 * Local NDJSON ingest (127.0.0.1:7242): dev only + `VITE_CLIENT_DEBUG_INGEST=1` via `isClientDebugIngestEnabled()`.
 */
export function isClientDebugLogsEnabled(): boolean {
  if (typeof import.meta === 'undefined') return false;
  if (import.meta.env.VITE_CLIENT_DEBUG_LOGS === '1') return true;
  if (import.meta.env.VITE_CLIENT_DEBUG_LOGS === '0') return false;
  return false;
}

/** Verbose opt-in logs (e.g. WC:/tabResume/sync when wired). Off unless VITE_CLIENT_DEBUG_LOGS=1. */
export function clientDebugLog(...args: unknown[]): void {
  if (!isClientDebugLogsEnabled()) return;
  console.log(...args);
}

/** Local development only; no-op in production builds. */
export function devConsoleLog(...args: unknown[]): void {
  if (typeof import.meta === 'undefined' || !import.meta.env.DEV) return;
  console.log(...args);
}

export function isClientDebugIngestEnabled(): boolean {
  if (typeof import.meta === 'undefined') return false;
  if (!import.meta.env.DEV) return false;
  return import.meta.env.VITE_CLIENT_DEBUG_INGEST === '1';
}
