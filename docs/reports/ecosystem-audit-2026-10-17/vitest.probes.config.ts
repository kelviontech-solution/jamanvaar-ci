import {defineConfig} from 'vitest/config';
import base from '../../../vitest.config';
export default defineConfig({...base,test:{...base.test,include:['docs/reports/ecosystem-audit-2026-10-17/probes.test.ts'],exclude:['**/node_modules/**'],reporters:['verbose'],fileParallelism:false}});
