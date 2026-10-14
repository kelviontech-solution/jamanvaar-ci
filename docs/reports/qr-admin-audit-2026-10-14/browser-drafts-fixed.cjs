const q = require('./qa.cjs'), {admin, go, capture} = require('./browser-pages.cjs');
const checks = [];
async function check(p, name, fn) { const passed = await q.test(p, name, fn); checks.push({name, passed}); }
async function main() {
  const p = await admin();
  await go(p, 'ADVANCED', 'Promotions');
  await check(p, 'Promotion navigation preserves an unsaved coupon', async () => {
    await p.getByLabel('Coupon code', {exact:true}).fill('KEEPDRAFT');
    await p.getByRole('button', {name:'Overview',exact:true}).click();
    await q.expect(p.getByRole('dialog', {name:'Leave without saving?'})).toBeVisible();
    await p.getByRole('button', {name:'Keep editing',exact:true}).click();
    await q.expect(p.getByLabel('Coupon code', {exact:true})).toHaveValue('KEEPDRAFT');
    return {draftPreserved:true};
  });
  await go(p, 'ADVANCED', 'Translations');
  await check(p, 'Changing translation records asks before replacing text', async () => {
    const selector = p.getByLabel('Menu record', {exact:true});
    await selector.selectOption({label:'UI Audit Dish 100'});
    await p.getByLabel('Translated name', {exact:true}).fill('KEEP RECORD TEXT');
    await selector.selectOption({label:'UI Audit Dish 001'});
    await q.expect(p.getByRole('dialog', {name:'Leave without saving?'})).toBeVisible();
    await p.getByRole('button', {name:'Keep editing',exact:true}).click();
    await q.expect(p.getByLabel('Translated name', {exact:true})).toHaveValue('KEEP RECORD TEXT');
    return {draftPreserved:true};
  });
  await go(p,'CRM');
  await check(p, 'Closing a point adjustment preserves the draft until discarded', async () => {
    await p.getByRole('button',{name:'Points & history',exact:true}).first().click();
    const detail = p.getByRole('dialog',{name:'Customer points & history'});
    await detail.getByLabel('Point adjustment',{exact:true}).fill('1');
    await detail.getByLabel('Reason',{exact:true}).fill('Unsaved browser check');
    await p.keyboard.press('Escape');
    await q.expect(p.getByRole('dialog',{name:'Leave without saving?'})).toBeVisible();
    await p.getByRole('button',{name:'Keep editing',exact:true}).click();
    await q.expect(detail.getByLabel('Point adjustment',{exact:true})).toHaveValue('1');
    await p.keyboard.press('Escape');
    await p.getByRole('button',{name:'Discard & continue',exact:true}).click();
    await q.expect(detail).toHaveCount(0);
    await q.expect(p.getByLabel('QR loyalty readiness')).toContainText('Phone verification: Ready');
    await capture(p,'crm-readiness-desktop');
    const link=p.getByRole('button',{name:'Open branch reward settings',exact:true});
    if(await link.isVisible()) {
      await link.click();
      await q.expect(p.getByRole('heading',{name:'Advanced QR capabilities',exact:true})).toBeVisible();
    }
    return {draftProtected:true,readinessActionWorks:true};
  });
  await go(p,'BRAND');
  await check(p, 'Mobile leave confirmation stays above the sidebar', async () => {
    await p.getByLabel('Welcome heading',{exact:true}).fill('MOBILE KEEP DRAFT');
    await p.setViewportSize({width:390,height:844});
    await p.getByRole('button',{name:'Browse workspace',exact:true}).click();
    await p.getByRole('button',{name:'Overview',exact:true}).click();
    await q.expect(p.getByRole('dialog',{name:'Leave without saving?'})).toBeVisible();
    await p.getByRole('button',{name:'Keep editing',exact:true}).click();
    await p.getByRole('button',{name:'Close menu',exact:true}).click();
    await q.expect(p.getByLabel('Welcome heading',{exact:true})).toHaveValue('MOBILE KEEP DRAFT');
    return {confirmationClickable:true};
  });
  q.fs.writeFileSync(q.path.join(q.reportDir,'evidence','draft-verification.json'),JSON.stringify({tests:checks,passed:checks.filter(t=>t.passed).length,total:checks.length},null,2));
  await q.close();if(checks.some(t=>!t.passed))process.exitCode=1;
}
main().catch(async e=>{console.error(q.scrub(e.message));await q.close();process.exitCode=1;});
