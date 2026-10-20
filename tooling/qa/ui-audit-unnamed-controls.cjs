const q = require('./browser-audit-lib.cjs');

async function inspect(app, role, routes) {
  const page = await q.open(app, role);
  for (const route of routes) {
    await page.evaluate((nextRoute) => {
      history.pushState(null, '', nextRoute);
      dispatchEvent(new PopStateEvent('popstate'));
    }, route);
    await page.waitForTimeout(500);
    if (app === 'pos') {
      const menu = page.getByRole('button', { name: 'Pages & categories', exact: true });
      if (await menu.isVisible().catch(() => false)) await menu.click();
      const allPages = page.getByTitle('Back to the main menu', { exact: true }).filter({ visible: true });
      if (await allPages.count()) await allPages.click();
      let settings = page.getByRole('button', { name: 'Settings', exact: true }).filter({ visible: true });
      if (!await settings.count()) {
        const more = page.getByRole('button', { name: 'More tools', exact: true }).filter({ visible: true });
        if (await more.count()) await more.click();
        settings = page.getByRole('button', { name: 'Settings', exact: true }).filter({ visible: true });
      }
      if (await settings.count()) await settings.first().click();
      await page.waitForTimeout(800);
    }
    if (app === 'super') await q.snap(page, `super-route-${route.replace(/\//g, '-') || 'dashboard'}`);
    const controls = await page.locator('button').evaluateAll((buttons) => buttons
      .map((button) => {
        const style = getComputedStyle(button);
        return {
          visible: button.getClientRects().length > 0 && style.visibility !== 'hidden' && style.display !== 'none',
          text: (button.innerText || button.textContent || '').trim(),
          aria: button.getAttribute('aria-label'),
          title: button.title,
          html: button.outerHTML.slice(0, 900)
        };
      })
      .filter((button) => button.visible && !button.text && !button.aria && !button.title)
      .map((button) => button.html));
    if (controls.length) console.log(JSON.stringify({ app, route, controls }, null, 2));
  }
  await page._audit.ctx.close();
}

async function main() {
  await inspect('super', 'super', [`/restaurants/${q.state.restaurantA.id}`]);
  await inspect('admin', 'admin', ['/restaurant-admin/dashboard', '/restaurant-admin/sync', '/restaurant-admin/qr-ordering?tab=RESTAURANT_PAGE', '/restaurant-admin/qr-ordering?tab=MENU']);
  await inspect('pos', 'pos', ['/']);
  await inspect('kiosk', 'kiosk', ['/']);
  await q.close();
}

main().catch(async (error) => {
  console.error(q.scrub(error.message));
  await q.close();
  process.exitCode = 1;
});
