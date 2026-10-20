const q = require('./browser-audit-lib.cjs');
const { login } = require('./browser-audit-terminal-login.cjs');

async function main() {
  const page = await q.open('pos');
  await login(page, 'pos', 'Cashier');
  await q.test(page, 'POS status actions are keyboard controls and shared modal locks background scroll', async () => {
    const profile = page.getByTitle(/User Profile & Session Options/);
    await profile.click();
    const printer = page.getByRole('button', { name: /Thermal Printer/i }).filter({ visible: true }).first();
    q.expect(await printer.evaluate((element) => element.tagName)).toBe('BUTTON');
    await printer.press('Enter');
    const dialog = page.getByRole('dialog');
    await q.expect(dialog).toBeVisible();
    const state = await page.evaluate(() => ({
      bodyOverflow: document.body.style.overflow,
      dialogOverscroll: document.querySelector('[role="dialog"]')?.classList.contains('overscroll-contain'),
      bodyOverscroll: document.querySelector('.jv-dialog-body')?.classList.contains('overscroll-contain')
    }));
    q.expect(state).toEqual({ bodyOverflow: 'hidden', dialogOverscroll: true, bodyOverscroll: true });
    await page.keyboard.press('Escape');
    await q.expect(dialog).toHaveCount(0);
    q.expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');

    await profile.click();
    const network = page.getByRole('button', { name: /LAN \/ Cloud Sync/i }).filter({ visible: true }).first();
    q.expect(await network.evaluate((element) => element.tagName)).toBe('BUTTON');
    await q.snap(page, 'pos-keyboard-status-actions');
    return { printerKeyboardActivation: true, networkSemanticButton: true, modalScrollLocked: true, escapeCloses: true };
  });
  await q.close();
}

main().catch(async (error) => {
  console.error(q.scrub(error.message));
  await q.close();
  process.exitCode = 1;
});
