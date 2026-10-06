const q = require('./browser-audit-lib.cjs');
async function login(p, app, role) {
  if (app === 'pos' && !await p.getByRole('button', { name: 'UNLOCK TERMINAL', exact: true }).isVisible().catch(() => false)) return;
  if (app !== 'pos' && !await p.getByPlaceholder('• • • •').isVisible().catch(() => false)) return;
  if (app === 'pos') {
    await p.getByRole('button', { name: new RegExp(`QA ${role}`) }).click();
    for (const c of q.state.staff[role].pin) await p.getByRole('button', { name: c, exact: true }).click();
    await p.getByRole('button', { name: 'UNLOCK TERMINAL', exact: true }).click();
  } else if (app === 'captain') {
    await p.getByPlaceholder('• • • •').fill(q.state.staff[role].pin);
    await p.getByRole('button', { name: 'Unlock Captain Terminal', exact: true }).click();
  } else {
    for (const c of q.state.staff[role].pin) await p.getByRole('button', { name: c, exact: true }).click();
  }
  await p.waitForTimeout(1300);
}
async function main() {
  for (const [app, role] of [['pos', 'Cashier'], ['captain', 'Captain'], ['kds', 'Kitchen']]) {
    const p = await q.open(app);
    await q.test(p, `${role} logs into assigned terminal with issued staff PIN`, async () => {
      await login(p, app, role);
      q.expect(await p.getByRole('button', { name: /UNLOCK TERMINAL|Unlock Captain Terminal/ }).count()).toBe(0);
      q.expect(await p.getByPlaceholder('• • • •').count()).toBe(0);
      const entities = await q.mustApi('GET', '/api/v1/entity-sync/STAFF_USER', undefined, q.state[`${app}Activation`].deviceToken);
      q.expect(entities.entities.some(e => e.payload.fullName === `QA ${role}`)).toBe(true);
      return { role, cloudStaffPresent: true, correctTerminal: true };
    });
    const data = await q.snap(p, app + '-staff-authenticated');
    console.log(app, JSON.stringify({ text: data.text.slice(-2200), buttons: data.buttons.slice(-28) }));
    await p._audit.ctx.close();
  }
}
if (require.main === module) main().catch(async e => { console.error(e.message); await q.close(); process.exitCode = 1; });
module.exports = { login };
