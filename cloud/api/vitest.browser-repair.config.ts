import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vitest.config';

// Explicit acceptance target: needs the locally built customer page and installed Chrome.
// Keep it out of the ordinary API-only suite rather than making Chrome a hidden dependency.
export default mergeConfig(base, defineConfig({ test: { include: ['test/qr-repair-browser.acceptance.ts'], testTimeout: 60000, hookTimeout: 90000 } }));
