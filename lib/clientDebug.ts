/**
 * Client-side debug output (console + optional localStorage ring + optional local ingest).
 *
 * Verbose client logs (_dbg, WC:/tabResume/sync, AuthGate DBG): off unless VITE_CLIENT_DEBUG_LOGS=1
 * (including local dev). Localhost ingest: dev only + VITE_CLIENT_DEBUG_INGEST=1.
 *
 * Local NDJSON ingest (127.0.0.1:7242): only in dev and when VITE_CLIENT_DEBUG_INGEST=1
 */
export function isClientDebugLogsEnabled(): boolean {
  if (typeof import.meta === 'undefined') return false;
  if (import.meta.env.VITE_CLIENT_DEBUG_LOGS === '1') return true;
  if (import.meta.env.VITE_CLIENT_DEBUG_LOGS === '0') return false;
  /* Off by default (including dev); set VITE_CLIENT_DEBUG_LOGS=1 for WC:/tabResume/sync/_dbg noise */
  return false;
}

export function isClientDebugIngestEnabled(): boolean {
  if (typeof import.meta === 'undefined') return false;
  if (!import.meta.env.DEV) return false;
  return import.meta.env.VITE_CLIENT_DEBUG_INGEST === '1';
}
