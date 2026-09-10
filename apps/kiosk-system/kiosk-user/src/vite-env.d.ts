/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLOUD_API_BASE_URL?: string;
  readonly VITE_CASHFREE_MODE?: 'sandbox' | 'production';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
