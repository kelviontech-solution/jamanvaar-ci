// Creates a fresh local-only database and least-privilege role for UI browser audits.
// Credentials stay in the ignored .jamanvaar directory and are never printed.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { Client } = require('pg');
const dotenv = require('dotenv');

const root = path.resolve(__dirname, '../..');
const stateDir = path.resolve(root, process.env.JAMANVAAR_QA_STATE_DIR || '.jamanvaar/full-app-audit-2026-10-13');

async function main() {
  fs.mkdirSync(stateDir, { recursive: true });
  const cfg = dotenv.parse(fs.readFileSync(path.join(root, 'cloud/api/.env')));
  const adminUrl = new URL(cfg.DATABASE_URL);
  if (!['localhost', '127.0.0.1'].includes(adminUrl.hostname)) {
    throw new Error('UI audit setup requires local PostgreSQL.');
  }

  const suffix = `${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const databaseName = `jamanvaar_ui_audit_${suffix}`;
  const databaseRole = `jamanvaar_ui_audit_${suffix}`;
  const databasePassword = crypto.randomBytes(24).toString('base64url');
  const admin = new Client({ connectionString: adminUrl.href });
  await admin.connect();
  try {
    await admin.query(`CREATE ROLE "${databaseRole}" LOGIN PASSWORD '${databasePassword}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`);
    await admin.query(`CREATE DATABASE "${databaseName}" OWNER "${databaseRole}"`);
  } catch (error) {
    await admin.query(`DROP ROLE IF EXISTS "${databaseRole}"`).catch(() => {});
    throw error;
  } finally {
    await admin.end();
  }

  const databaseUrl = new URL(adminUrl.href);
  databaseUrl.username = databaseRole;
  databaseUrl.password = databasePassword;
  databaseUrl.pathname = `/${databaseName}`;
  const state = {
    databaseUrl: databaseUrl.href,
    databaseName,
    databaseRole,
    port: Number(process.env.JAMANVAAR_QA_PORT || 4011),
    platformEmail: 'ui-audit-platform@example.invalid',
    platformPassword: crypto.randomBytes(18).toString('base64url'),
    ownerPassword: crypto.randomBytes(18).toString('base64url'),
    jwtSecret: crypto.randomBytes(48).toString('base64url'),
    encryptionKey: crypto.randomBytes(32).toString('base64'),
    stamp: Date.now()
  };
  fs.writeFileSync(path.join(stateDir, 'private-state.json'), JSON.stringify(state, null, 2));

  const env = {
    ...process.env,
    DATABASE_URL: state.databaseUrl,
    NODE_ENV: 'test',
    SEED_DEMO_DATA: 'false',
    SEED_SUPER_ADMIN_EMAIL: state.platformEmail,
    SEED_SUPER_ADMIN_PASSWORD: state.platformPassword
  };
  const run = (args) => {
    const result = spawnSync(process.execPath, args, {
      cwd: path.join(root, 'cloud/api'),
      env,
      encoding: 'utf8'
    });
    if (result.status !== 0) throw new Error(String(result.stderr || result.stdout).slice(-3000));
  };
  run([path.join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy']);
  run(['dist/prisma/seed.js']);
  console.log('Fresh local UI-audit database ready with a non-superuser, non-bypass role.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
