// API fixture setup only; browser tests must separately exercise the user-facing flows.
const q = require('./browser-audit-lib.cjs');
async function main() {
  for (const suffix of ['A', 'B']) {
    const r = q.state[`restaurant${suffix}`];
    if (!r) throw Error('Run browser Super Admin onboarding first');
    const branch = await q.mustApi('POST', '/api/v1/branches', { restaurantId: r.id, name: `QA-Branch-${suffix}`, code: `QA${suffix}` });
    q.state[`branch${suffix}`] = branch;
    if (suffix === 'A') {
      q.state.branchA2 = await q.mustApi('POST', '/api/v1/branches', { restaurantId: r.id, name: 'QA-Branch-A2', code: 'QA2' });
      await q.mustApi('POST', '/api/v1/subscriptions', { restaurantId: r.id, planId: 'seed-plan-kiosk-pro', status: 'TRIAL', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() });
    }
    q.state[`keys${suffix}`] = {};
    for (const type of suffix === 'A' ? ['POS_ADMIN', 'POS', 'CAPTAIN', 'KDS', 'KIOSK', 'KIOSK_ADMIN'] : ['POS_ADMIN', 'POS']) {
      const key = await q.mustApi('POST', '/api/v1/activation-keys', { restaurantId: r.id, branchId: branch.id, allowedDeviceType: type, label: `QA ${suffix} ${type}`, expiresAt: new Date(Date.now() + 86400000).toISOString() });
      q.state[`keys${suffix}`][type] = key;
    }
    q.saveState();
  }
  console.log('Fixture setup complete: two tenants, three branches, trial kiosk add-on, named device activation keys. No existing records modified.');
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
