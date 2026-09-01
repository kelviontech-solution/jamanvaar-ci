import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@jamanvaar/config': path.resolve(__dirname, '../../../shared/config/src'),
      '@jamanvaar/types': path.resolve(__dirname, '../../../shared/types/src'),
      '@jamanvaar/utils': path.resolve(__dirname, '../../../shared/utils/src'),
      '@jamanvaar/i18n': path.resolve(__dirname, '../../../shared/i18n/src'),
      '@jamanvaar/validation': path.resolve(__dirname, '../../../shared/validation/src'),
      '@jamanvaar/business': path.resolve(__dirname, '../../../shared/business/src'),
      '@jamanvaar/database': path.resolve(__dirname, '../../../shared/database/src'),
      '@jamanvaar/api': path.resolve(__dirname, '../../../shared/api/src'),
      '@jamanvaar/sync': path.resolve(__dirname, '../../../shared/sync/src'),
      '@jamanvaar/ui': path.resolve(__dirname, '../../../shared/ui/src'),
      '@jamanvaar/kiosk-shared': path.resolve(__dirname, '../shared/src')
    }
  },
  server: {
    port: 5174,
    strictPort: true
  }
});
