import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readFileSync } from 'fs';

const appVersion = (JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')) as { version: string }).version;

export default defineConfig({
  base: './',
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  resolve: {
    alias: {
      '@jamanvaar/config': path.resolve(__dirname, '../../../packages/config/src'),
      '@jamanvaar/types': path.resolve(__dirname, '../../../packages/types/src'),
      '@jamanvaar/utils': path.resolve(__dirname, '../../../packages/utils/src'),
      '@jamanvaar/i18n': path.resolve(__dirname, '../../../packages/i18n/src'),
      '@jamanvaar/validation': path.resolve(__dirname, '../../../packages/validation/src'),
      '@jamanvaar/business': path.resolve(__dirname, '../../../packages/business/src'),
      '@jamanvaar/database': path.resolve(__dirname, '../../../packages/database/src'),
      '@jamanvaar/api': path.resolve(__dirname, '../../../packages/api/src'),
      '@jamanvaar/sync': path.resolve(__dirname, '../../../packages/sync/src'),
      '@jamanvaar/ui': path.resolve(__dirname, '../../../packages/ui/src')
    }
  },
  server: {
    port: 5175,
    strictPort: true
  }
});
