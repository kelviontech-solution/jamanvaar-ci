import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  // Relative, not Vite's default absolute '/' -- this console is served at the domain
  // root in production (system.kelviontech.in) but under a path prefix on a dedicated
  // testing box (e.g. /admin/ -- see nginx/oracle-testing-proxy.conf). A relative base
  // resolves correctly either way, same pattern every other app in this monorepo
  // already uses (apps/*/vite.config.ts). Confirmed live, not assumed: absolute '/'
  // asset paths 404'd under /admin/ on kelviontech-prod-2 since they resolved against
  // the proxy's root instead of the subpath the HTML was actually served from.
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@jamanvaar/config': path.resolve(__dirname, '../../packages/config/src'),
      '@jamanvaar/types': path.resolve(__dirname, '../../packages/types/src'),
      '@jamanvaar/utils': path.resolve(__dirname, '../../packages/utils/src'),
      '@jamanvaar/i18n': path.resolve(__dirname, '../../packages/i18n/src'),
      '@jamanvaar/validation': path.resolve(__dirname, '../../packages/validation/src'),
      '@jamanvaar/business': path.resolve(__dirname, '../../packages/business/src'),
      '@jamanvaar/database': path.resolve(__dirname, '../../packages/database/src'),
      '@jamanvaar/api': path.resolve(__dirname, '../../packages/api/src'),
      '@jamanvaar/sync': path.resolve(__dirname, '../../packages/sync/src'),
      '@jamanvaar/ui': path.resolve(__dirname, '../../packages/ui/src')
    }
  },
  server: {
    port: 5180,
    strictPort: true
  }
});
