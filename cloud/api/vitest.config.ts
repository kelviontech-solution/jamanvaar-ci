import { defineConfig } from 'vitest/config';
import path from 'path';
import swc from 'unplugin-swc';

export default defineConfig({
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
    fileParallelism: false
  },
  resolve: {
    alias: {
      src: path.resolve(__dirname, './src')
    }
  }
});
