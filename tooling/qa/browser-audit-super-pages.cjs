const q = require('./browser-audit-lib.cjs');
async function main() {
  const p = await q.open('super');
  const src = q.fs.readFileSync(q.path.join(q.root, 'cloud/super-admin-web/src/app/App.tsx'), 'utf8');
  const routes = [...src.matchAll(/<Route path="([^"]+)"/g)].map(m => m[1]).filter(r => !['/login', '/activate', '*', '/dashboard'].includes(r));
  const details = { '/restaurants/:id': q.state.restaurantA.id, '/owners/:id': q.state.restaurantA.ownerId, '/branches/:id': q.state.branchA.id, '/plans/:id': 'seed-plan-pro', '/devices/:id': q.state.adminActivation.deviceId };
  const inventory = [];
  for (let route of routes) {
    const actual = route.includes(':id') ? (details[route] ? route.replace(':id', details[route]) : null) : route;
    if (!actual) { inventory.push({ app: 'super', route, result: 'BLOCKED', reason: 'No fixture ID known yet' }); continue; }
    const responses = []; const errors = [];
    const onResponse = r => { if (new URL(r.url()).pathname.startsWith('/api/v1/')) responses.push({ endpoint: new URL(r.url()).pathname, status: r.status() }); };
    const onError = e => errors.push(e.message);
    p.on('response', onResponse); p.on('pageerror', onError);
    await p.goto(`http://localhost:5180${actual}`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(900);
    const data = await q.snap(p, 'super-route-' + (actual.replace(/\//g, '-') || 'dashboard'));
    const crashed = /something went wrong|failed to render|could not render/i.test(data.text) || errors.length > 0;
    const result = crashed ? 'FAIL' : responses.some(r => r.status >= 400) ? 'PARTIAL' : 'RENDERED';
    inventory.push({ app: 'super', route, actual, result, headings: data.headings, api: responses, errors, buttons: data.buttons, inputs: data.inputs, overflow: data.overflow });
    q.append('page-coverage.jsonl', inventory[inventory.length - 1]);
    console.log(`${result} Super ${route} (${responses.length} API responses)`);
    p.off('response', onResponse); p.off('pageerror', onError);
    // Preserve production throttling: pace the sweep instead of disabling guards.
    await p.waitForTimeout(700);
  }
  q.fs.writeFileSync(q.path.join(q.reportDir, 'super-route-inventory.json'), JSON.stringify(inventory, null, 2));
  await q.close();
}
main().catch(async e => { console.error(e.message); await q.close(); process.exitCode = 1; });
