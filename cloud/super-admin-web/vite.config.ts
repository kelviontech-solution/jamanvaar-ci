import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = {...loadEnv(mode, __dirname, 'VITE_'), ...process.env};
  return {
  // Match assets to the router deployment prefix, never to the current route depth.
  base: (env.VITE_ROUTER_BASENAME || '/').replace(/\/?$/, '/'),
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
};
});
