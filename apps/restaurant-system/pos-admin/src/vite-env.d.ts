/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLOUD_API_BASE_URL?: string;
  /** Where this app is really, publicly reachable (BUG-119) — a guest's table QR code is built from this, never from window.location.origin. */
  readonly VITE_RESTAURANT_ADMIN_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** The app's own version, injected from package.json by Vite (see vite.config.ts). */
declare const __APP_VERSION__: string;
