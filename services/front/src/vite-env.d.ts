/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_REDIRECT_URI: string
  readonly VITE_CLIENT_ID_BASE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
