const q = require('./browser-audit-lib.cjs');

const viewports = [
  ['320x700', 320, 700],
  ['375x812', 375, 812],
  ['390x844', 390, 844],
  ['768x1024', 768, 1024],
  ['1366x768', 1366, 768],
  ['1920x1080', 1920, 1080]
];

async function capture(page, app, route, label, viewport) {
  const data = await q.snap(page, `${app}-${label}-${viewport}`);
  q.append('page-coverage.jsonl', {
    app,
    page: label,
    route,
    viewport,
    result: /something went wrong|failed to render|could not render/i.test(data.text) ? 'FAIL' : 'RENDERED',
    headings: data.headings,
    buttons: data.buttons.filter((button) => button.visible).length,
    fields: data.inputs.filter((input) => input.visible),
    links: data.links.filter((link) => link.visible).length,
    overflow: data.overflow,
    unlabelledButtons: data.unlabelledButtons,
    brokenImages: data.images.filter((image) => image.visible && !image.loaded).length
  });
}

async function sweep(app, route, label) {
  const page = await q.open(app);
  await page.evaluate((nextRoute) => {
    history.pushState(null, '', nextRoute);
    dispatchEvent(new PopStateEvent('popstate'));
  }, route);
  await page.waitForTimeout(700);
  for (const [viewport, width, height] of viewports) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(150);
    await capture(page, app === 'admin' ? label.split('-')[0] + '-admin' : app, route, label, viewport);
  }
  await page._audit.ctx.close();
}

async function main() {
  await sweep('super', '/', 'dashboard-responsive');
  await sweep('admin', '/restaurant-admin/dashboard', 'restaurant-dashboard-responsive');
  await sweep('admin', '/kiosk-admin/dashboard', 'kiosk-dashboard-responsive');
  await q.close();
}

main().catch(async (error) => {
  console.error(q.scrub(error.message));
  await q.close();
  process.exitCode = 1;
});
