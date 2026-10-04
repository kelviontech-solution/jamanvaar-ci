/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_RESTAURANT_ADMIN_URL?: string;
  readonly VITE_KIOSK_ADMIN_URL?: string;
  // Set only when this console is served under a path prefix instead of a domain's root
  // (e.g. "/admin" on a dedicated testing box routing every app by path -- see
  // nginx/oracle-testing-proxy.conf). Empty/unset on production (system.kelviontech.in),
  // where this console owns the root. Passed to BrowserRouter's basename in App.tsx.
  readonly VITE_ROUTER_BASENAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
