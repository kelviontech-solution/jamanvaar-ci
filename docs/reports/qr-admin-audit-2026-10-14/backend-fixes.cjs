// Run the regression suites against the existing isolated browser-QA database, never the .env database.
const { spawn } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const state = JSON.parse(fs.readFileSync(path.join(root, '.jamanvaar/full-app-audit-2026-10-13/private-state.json')));
if (!new URL(state.databaseUrl).pathname.includes('test')) throw Error('Isolated test database required');
const env = { ...process.env, NODE_ENV: 'test', DATABASE_URL: state.databaseUrl, TEST_DATABASE_URL: state.databaseUrl,
  JWT_ACCESS_SECRET: state.jwtSecret, PAYMENT_CREDENTIAL_ENCRYPTION_KEY: state.encryptionKey, SMTP_HOST: '' };
for (const key of Object.keys(env)) if (/RAZORPAY|SMTP_|AWS_|WHATSAPP/.test(key)) delete env[key];
env.SMTP_HOST = '';
const child = spawn(process.execPath, [path.join(root, 'node_modules/vitest/vitest.mjs'), 'run',
  'test/qr-module.e2e.spec.ts', 'test/qr-mobile-payments.e2e.spec.ts', 'test/qr-operations.e2e.spec.ts',
  'test/multi-branch-dashboard.e2e.spec.ts', '--maxWorkers=1', '--reporter=default'],
  { cwd: path.join(root, 'cloud/api'), env, stdio: ['ignore', 'pipe', 'pipe'] });
const log = fs.createWriteStream(path.join(root, '.jamanvaar/qr-final-backend-tests.log'));
child.stdout.pipe(log); child.stderr.pipe(log);
child.on('exit', code => { console.log('QR backend regression exit:', code); process.exitCode = code || 0; });
