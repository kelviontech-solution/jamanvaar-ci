import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // cloud/api is its own NestJS project with its own vitest config, its own
    // live-database requirements, and its own module resolution — it must not
    // be picked up (or slow down) the root offline-runtime test suite.
    exclude: ['**/node_modules/**', '**/dist/**', 'cloud/**', '.claude/**', '.playwright-mcp/**']
  },
  resolve: {
    alias: {
      '@jamanvaar/config': path.resolve(__dirname, './packages/config/src'),
      '@jamanvaar/types': path.resolve(__dirname, './packages/types/src'),
      '@jamanvaar/utils': path.resolve(__dirname, './packages/utils/src'),
      '@jamanvaar/i18n': path.resolve(__dirname, './packages/i18n/src'),
      '@jamanvaar/validation': path.resolve(__dirname, './packages/validation/src'),
      '@jamanvaar/business': path.resolve(__dirname, './packages/business/src'),
      '@jamanvaar/database': path.resolve(__dirname, './packages/database/src'),
      '@jamanvaar/api': path.resolve(__dirname, './packages/api/src'),
      '@jamanvaar/sync': path.resolve(__dirname, './packages/sync/src'),
      '@jamanvaar/ui': path.resolve(__dirname, './packages/ui/src/index.ts')
    }
  }
});
