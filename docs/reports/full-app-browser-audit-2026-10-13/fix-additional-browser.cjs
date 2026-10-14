const q = require('./qa.cjs');
const {login} = require('./terminal-login.cjs');
async function check(p,name,run){if(!await q.test(p,'Additional fix: '+name,run))process.exitCode=1;}
async function main(){
  const kiosk=await q.open('kiosk');
  await kiosk.getByRole('region',{name:'JAMANVAAR Startup',exact:true}).waitFor({state:'hidden'});
  const start=kiosk.getByRole('button',{name:'Start Order',exact:true});
  await start.click();
  const english=kiosk.getByRole('button',{name:/English/}).first();
  await english.click();
  const takeaway=kiosk.getByRole('button',{name:/Takeaway/i}).first();
  await takeaway.click();
  await check(kiosk,'touch menu search and reset',async()=>{
    const search=kiosk.getByPlaceholder(/Search dish/).first();await search.waitFor();
    q.expect(await search.getAttribute('readonly')).not.toBeNull();await search.click();
    await q.expect(kiosk.getByRole('dialog',{name:'Search dishes'})).toBeVisible();
    await kiosk.getByRole('button',{name:'123',exact:true}).click();
    for(const key of '100')await kiosk.getByRole('button',{name:'Search key '+key,exact:true}).click();
    await kiosk.getByRole('button',{name:'Show results',exact:true}).click();
    await q.expect(kiosk.getByRole('button',{name:'Add UI Audit Dish 100 to cart',exact:true})).toBeVisible();
    await kiosk.getByRole('button',{name:'All Menu',exact:true}).first().click();
    await q.expect(search).toHaveValue('');await q.snap(kiosk,'fix-touch-menu-search');return {touchSearch:true,clearFilters:true};
  });
  await kiosk._audit.ctx.close();
  const kds=await q.open('kds');await login(kds,'kds','Kitchen');
  await check(kds,'canonical order history and compact kitchen',async()=>{
    const history=kds.getByRole('button',{name:/Order activity for token/}).first();
    await history.waitFor();
    const response=kds.waitForResponse(r=>/orders\/sync\/[^/]+\/activity/.test(r.url())&&r.request().method()==='GET');
    await history.click();const r=await response;q.expect(r.status()).toBe(200);
    const body=await r.json();q.expect(body.balance.outstandingPaise).toBeGreaterThanOrEqual(0);
    await q.expect(kds.getByRole('dialog',{name:'Order history'})).toBeVisible();
    await q.expect(kds.getByText(/Server version/)).toBeVisible();await q.snap(kds,'fix-kds-canonical-history');
    await kds.keyboard.press('Escape');await q.expect(kds.getByRole('dialog',{name:'Order history'})).toHaveCount(0);
    await kds.setViewportSize({width:390,height:844});const d=await q.snap(kds,'fix-kds-phone-final');q.expect(d.overflow).toBe(false);q.expect(d.unlabelledButtons).toBe(0);
    return {canonicalHistory:true,keyboardClose:true,phoneFits:true};
  });
  await q.close();
}
main().catch(async e=>{console.error(q.scrub(e.message));await q.close();process.exitCode=1;});
