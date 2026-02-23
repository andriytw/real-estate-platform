/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly NEXT_PUBLIC_MAPBOX_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
