const q = require('./browser-audit-lib.cjs');
async function main() {
  for (const [app, type] of [['pos', 'POS'], ['captain', 'CAPTAIN'], ['kds', 'KDS'], ['kiosk', 'KIOSK']]) {
    if (process.argv[2] && process.argv[2] !== app) continue;
    const p = await q.open(app);
    await q.snap(p, app + '-before-activation');
    await q.test(p, 'Actual browser device activation with branch-bound key', async () => {
      if (app === 'kiosk') await p.getByPlaceholder('JM9876543210', { exact: true }).fill(q.state.restaurantA.restaurantCode);
      await p.getByPlaceholder('JMV-XXXX-XXXX-XXXX').fill(q.state.keysA[type].code);
      const response = p.waitForResponse(r => r.url().endsWith('/activation/redeem') && r.request().method() === 'POST');
      await p.locator('button[type=submit]').click();
      const res = await response;
      q.expect(res.status()).toBe(201);
      q.state[`${app}Activation`] = await res.json(); q.saveState();
      await p.waitForTimeout(app === 'kiosk' ? 5500 : 2200);
      const buttons = p.getByRole('button', { name: /continue|start using|let.s go|enter/i });
      if (await buttons.first().isVisible().catch(() => false)) await buttons.first().click();
      return { endpoint: '/api/v1/activation/redeem', status: res.status(), deviceId: q.state[`${app}Activation`].deviceId, branchId: q.state[`${app}Activation`].branchId };
    });
    const data = await q.snap(p, app + '-activated');
    console.log(app, JSON.stringify({ text: data.text.slice(-1500), inputs: data.inputs, buttons: data.buttons.slice(-22) }));
    await p._audit.ctx.close();
  }
}
main().catch(async e => { console.error(e.message); await q.close(); process.exitCode = 1; });
