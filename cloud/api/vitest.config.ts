import { defineConfig } from 'vitest/config';
import path from 'path';
import swc from 'unplugin-swc';

export default defineConfig({
  root: __dirname,
  // NestJS's dependency injection reads constructor parameter types from
  // decorator metadata (`emitDecoratorMetadata`), which esbuild (Vitest's
  // default transform) does not emit — DI silently resolves providers as
  // `undefined` without this. SWC's plugin transform does emit it correctly.
  plugins: [swc.vite()],
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    testTimeout: 20000,
    fileParallelism: false,
    // The default reporter collapses a passing test's own console.log output, which has
    // silently hidden real load-test numbers before (see docs/reports/robustness-scalability-
    // audit-2026-10-11). 'verbose' always prints it; override with --reporter=default for a
    // quiet run.
    reporters: ['verbose'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/target/**']
  },
  resolve: {
    alias: {
      src: path.resolve(__dirname, './src')
    }
  }
});
