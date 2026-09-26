/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Where the platform API lives, e.g. https://api.example.com. Required in production; there is no built-in address. */
  readonly VITE_CLOUD_API_BASE_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
