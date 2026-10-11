// Always use an explicitly named local test database, never the development/production .env.
const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const state = JSON.parse(fs.readFileSync(path.join(root, '.jamanvaar/ecosystem-assessment-private.json'), 'utf8'));
const url = new URL(state.databaseUrl);
if (!/test/i.test(url.pathname) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw Error('A local test database is required');
const env = { ...process.env, NODE_ENV: 'test', DATABASE_URL: state.databaseUrl, TEST_DATABASE_URL: state.databaseUrl, JWT_ACCESS_SECRET: 'AssessmentOnly-ThrowawaySecret-2026-10-11-Mr8Z2u', SMTP_HOST: '', ASSESSMENT_OUTPUT_DIR: path.join(__dirname, 'evidence') };
for (const name of Object.keys(env)) if (/RAZORPAY|CASHFREE|AWS_SECRET|JAMANVAAR_SERVICE_SECRET/.test(name)) delete env[name];
const args = process.argv.slice(2);
const command = args[0] === 'migrate'
  ? ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', 'cloud/api/prisma/schema.prisma']
  : ['node_modules/vitest/vitest.mjs', 'run', '--config', 'cloud/api/vitest.config.ts', ...args];
const result = spawnSync(process.execPath, command, { cwd: root, env, encoding: 'utf8' });
const redact = text => (text || '').replaceAll(state.databaseUrl, '<test-database-url>').replaceAll(url.password, '<redacted>');
// Windows PowerShell 5 reports a redirected stderr write as a failed shell command
// even when the native process exits zero. Preserve stderr evidence in the captured
// output and let the actual child exit status determine success.
process.stdout.write(redact(result.stdout));
if (result.stderr) process.stdout.write('\nCaptured runner stderr:\n' + redact(result.stderr));
if (result.error) process.stdout.write('\nRunner error: ' + redact(String(result.error)) + '\n');
writeFileResult();
process.exit(result.status ?? 1);

function writeFileResult() {
  const fingerprint = require('node:crypto').createHash('sha256').update(JSON.stringify(args)).digest('hex').slice(0, 16);
  fs.writeFileSync(path.join(__dirname, 'evidence', `qa-run-${fingerprint}.json`), JSON.stringify({ arguments: args, exitCode: result.status, signal: result.signal, runnerError: result.error?.code ?? null }, null, 2));
}
