const q = require('./browser-audit-lib.cjs');

function productPages(source, product) {
  const routeMap = source.indexOf('export const PRODUCT_PAGES');
  const start = source.indexOf(`${product}: {`, routeMap);
  if (start < 0) throw new Error(`Cannot find ${product} route map`);
  const end = source.indexOf('\n  }', start);
  return [...source.slice(start, end).matchAll(/([A-Z_]+):\s*'([^']+)'/g)]
    .map((match) => ({ id: match[1], slug: match[2] }));
}

async function main() {
  const p = await q.open('admin');
  const source = q.fs.readFileSync(q.path.join(q.root, 'apps/restaurant-system/pos-admin/src/adminProducts.ts'), 'utf8');
  const products = [
    { product: 'POS_ADMIN', app: 'restaurant-admin', prefix: 'restaurant-admin' },
    { product: 'KIOSK_ADMIN', app: 'kiosk-admin', prefix: 'kiosk-admin' }
  ].filter(({ app }) => !process.argv[2] || app === process.argv[2]);

  for (const { product, app, prefix } of products) {
    for (const { id, slug } of productPages(source, product)) {
      const responses = [];
      const errors = [];
      const onResponse = (response) => {
        const path = new URL(response.url()).pathname;
        if (path.startsWith('/api/v1/')) responses.push({ endpoint: path, status: response.status() });
      };
      const onError = (error) => errors.push(error.message);
      p.on('response', onResponse);
      p.on('pageerror', onError);
      await p.setViewportSize({ width: 1440, height: 960 });
      await p.evaluate((path) => {
        history.pushState(null, '', path);
        dispatchEvent(new PopStateEvent('popstate'));
      }, `/${prefix}/${slug}`);
      await p.waitForTimeout(700);
      const desktop = await q.snap(p, `${app}-${slug}-desktop`);
      const blocked = /Choose a branch to continue|Sign in again|Connect this admin device/.test(desktop.text);
      const crashed = /something went wrong|failed to render|could not render/i.test(desktop.text) || errors.length > 0;
      const result = crashed ? 'FAIL' : blocked ? 'BLOCKED' : responses.some((response) => response.status >= 400) ? 'PARTIAL' : 'RENDERED';
      q.append('page-coverage.jsonl', {
        app,
        page: id,
        route: `/${prefix}/${slug}`,
        viewport: '1440x960',
        result,
        headings: desktop.headings,
        api: responses,
        errors,
        buttons: desktop.buttons.filter((button) => button.visible).length,
        fields: desktop.fields,
        overflow: desktop.overflow,
        unlabelledButtons: desktop.unlabelledButtons
      });

      await p.setViewportSize({ width: 390, height: 844 });
      await p.waitForTimeout(150);
      const mobile = await q.snap(p, `${app}-${slug}-mobile`);
      q.append('page-coverage.jsonl', {
        app,
        page: id,
        route: `/${prefix}/${slug}`,
        viewport: '390x844',
        result: /something went wrong|failed to render|could not render/i.test(mobile.text) ? 'FAIL' : blocked ? 'BLOCKED' : 'RENDERED',
        headings: mobile.headings,
        buttons: mobile.buttons.filter((button) => button.visible).length,
        fields: mobile.fields,
        overflow: mobile.overflow,
        unlabelledButtons: mobile.unlabelledButtons
      });
      console.log(`${result} ${app} ${slug}`);
      p.off('response', onResponse);
      p.off('pageerror', onError);
    }
  }
  await q.close();
}

main().catch(async (error) => {
  console.error(error.message);
  await q.close();
  process.exitCode = 1;
});
