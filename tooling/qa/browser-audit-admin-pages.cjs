const q = require('./browser-audit-lib.cjs');
async function main() {
  const p = await q.open('admin');
  const src = q.fs.readFileSync(q.path.join(q.root, 'apps/restaurant-system/pos-admin/src/navSections.ts'), 'utf8');
  const labels = [...src.matchAll(/id: '([^']+)', label: '([^']+)'/g)].map(m => ({ id: m[1], label: m[2] }));
  for (const { id, label } of labels) {
    const responses = [], errors = [];
    const onResponse = r => { if (new URL(r.url()).pathname.startsWith('/api/v1/')) responses.push({ endpoint: new URL(r.url()).pathname, status: r.status() }); };
    const onError = e => errors.push(e.message);
    p.on('response', onResponse); p.on('pageerror', onError);
    const button = p.getByRole('button', { name: label, exact: true }).first();
    if (!await button.isVisible().catch(() => false)) { q.append('page-coverage.jsonl', { app: 'admin', page: id, label, result: 'BLOCKED', reason: 'Navigation not available to current plan/session' }); continue; }
    await button.click(); await p.waitForTimeout(700);
    const data = await q.snap(p, 'admin-page-' + id);
    const result = /something went wrong|failed to render|could not render/i.test(data.text) || errors.length ? 'FAIL' : responses.some(r => r.status >= 400) ? 'PARTIAL' : 'RENDERED';
    q.append('page-coverage.jsonl', { app: 'admin', page: id, label, result, headings: data.headings, api: responses, errors, buttons: data.buttons.slice(45), inputs: data.inputs, overflow: data.overflow });
    console.log(`${result} Admin ${id}`);
    p.off('response', onResponse); p.off('pageerror', onError);
  }
  await q.close();
}
main().catch(async e => { console.error(e.message); await q.close(); process.exitCode = 1; });
