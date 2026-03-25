/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly NEXT_PUBLIC_MAPBOX_TOKEN?: string;
  /** "1" = enable verbose client debug logs in production builds */
  readonly VITE_CLIENT_DEBUG_LOGS?: string;
  /** "1" in dev only: POST debug payloads to local NDJSON ingest */
  readonly VITE_CLIENT_DEBUG_INGEST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
