// Creates a fresh, local-only QA database. Existing databases/records are never altered.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { Client } = require('pg');
const dotenv = require('dotenv');
const root = path.resolve(__dirname, '../..');
const stateDir = path.join(root, '.jamanvaar/browser-audit');
async function main() {
  fs.mkdirSync(stateDir, { recursive: true });
  const cfg = dotenv.parse(fs.readFileSync(path.join(root, 'cloud/api/.env')));
  const adminUrl = new URL(cfg.DATABASE_URL);
  const testUrl = new URL(cfg.TEST_DATABASE_URL);
  for (const u of [adminUrl, testUrl]) if (!['localhost', '127.0.0.1'].includes(u.hostname)) throw Error('QA requires local PostgreSQL');
  const dbName = `jamanvaar_browser_test_${Date.now()}`;
  const role = decodeURIComponent(testUrl.username);
  if (!/^[a-z_][a-z0-9_]*$/i.test(role)) throw Error('Invalid local test role');
  const db = new Client({ connectionString: adminUrl.href });
  await db.connect();
  const roleInfo = await db.query('select rolsuper, rolbypassrls from pg_roles where rolname=$1', [role]);
  if (!roleInfo.rows[0] || roleInfo.rows[0].rolsuper || roleInfo.rows[0].rolbypassrls) throw Error('QA database must use an RLS-enforced role');
  await db.query(`CREATE DATABASE "${dbName}" OWNER "${role}"`);
  await db.end();
  testUrl.pathname = `/${dbName}`;
  const state = { databaseUrl: testUrl.href, databaseName: dbName, port: 4010, platformEmail: 'qa-platform@example.invalid', platformPassword: crypto.randomBytes(18).toString('base64url'), ownerPassword: crypto.randomBytes(18).toString('base64url'), jwtSecret: crypto.randomBytes(48).toString('base64url'), encryptionKey: crypto.randomBytes(32).toString('base64'), stamp: Date.now() };
  fs.writeFileSync(path.join(stateDir, 'private-state.json'), JSON.stringify(state, null, 2));
  const env = { ...process.env, DATABASE_URL: state.databaseUrl, NODE_ENV: 'test', SEED_DEMO_DATA: 'false', SEED_SUPER_ADMIN_EMAIL: state.platformEmail, SEED_SUPER_ADMIN_PASSWORD: state.platformPassword };
  const run = (args) => {
    const result = spawnSync(process.execPath, args, { cwd: path.join(root, 'cloud/api'), env, encoding: 'utf8' });
    if (result.status !== 0) throw Error(String(result.stderr).slice(-3000));
  };
  run([path.join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy']);
  run(['dist/prisma/seed.js']);
  console.log(`Isolated browser audit database ready: ${dbName}; non-superuser RLS enabled; credentials kept in ignored local state.`);
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
