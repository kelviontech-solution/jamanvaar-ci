// Uses the already-provisioned isolated, non-bypass-RLS browser QA database.
const fs = require('node:fs'); const path = require('node:path'); const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const state = JSON.parse(fs.readFileSync(path.join(root, '.jamanvaar/browser-audit/private-state.json')));
if (!/test/i.test(new URL(state.databaseUrl).pathname)) throw Error('Dedicated test database required');
const env = { ...process.env, NODE_ENV: 'test', TEST_DATABASE_URL: state.databaseUrl, DATABASE_URL: state.databaseUrl, JWT_ACCESS_SECRET: state.jwtSecret, PAYMENT_CREDENTIAL_ENCRYPTION_KEY: state.encryptionKey, SMTP_HOST: '', BACKUP_SCHEDULE: 'off' };
const result = spawnSync(process.execPath, [path.join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--config', 'cloud/api/vitest.config.ts', 'cloud/api/test/kiosk-management.e2e.spec.ts', 'cloud/api/test/merged-admin-access.e2e.spec.ts', 'cloud/api/test/entity-sync.e2e.spec.ts', '--reporter=json', '--outputFile=../../logs/kiosk-management-api-tests.json'], { cwd: root, env, stdio: 'inherit' });
process.exitCode = result.status ?? 1;
