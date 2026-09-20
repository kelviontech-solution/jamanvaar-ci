/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLOUD_API_BASE_URL?: string;
  readonly VITE_CASHFREE_MODE?: 'sandbox' | 'production';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// The Cashfree SDK ships no type declarations; only the calls kiosk-user makes are described.
declare module '@cashfreepayments/cashfree-js' {
  export interface CashfreeInstance {
    checkout(options: { paymentSessionId: string; redirectTarget?: string }): Promise<unknown>;
  }
  export function load(options: { mode: 'sandbox' | 'production' }): Promise<CashfreeInstance | null>;
}

/** The app's own version, injected from package.json by Vite (see vite.config.ts). */
declare const __APP_VERSION__: string;
