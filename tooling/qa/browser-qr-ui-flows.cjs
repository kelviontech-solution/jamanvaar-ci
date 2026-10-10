const {expect:baseExpect} = require('playwright/test');
const expect=baseExpect.configure({timeout:30000});
module.exports = async ({q, base, product, guest, check, api}) => {
  const pages = [
    ['OVERVIEW','Overview'], ['MENU','Menu & Availability'], ['TABLES','Tables & QR'],
    ['DESIGN','QR Design Studio'], ['ORDERS','QR Orders'], ['PAYMENTS','Payment Settings'],
    ['RULES','Ordering Rules'], ['ANALYTICS','Analytics'], ['SETTINGS','QR Settings'],
    ['ADVANCED','Advanced Features'], ['SERVICE','Service Requests'], ['PICKUP','Pickup Scheduling'],
    ['PERFORMANCE','Menu Performance'], ['BRAND','Customer Branding'],
  ];
  const failures = [];
  product.on('response',r => {if(new URL(r.url()).pathname.startsWith('/api/') && r.status() >= 500) failures.push({path:new URL(r.url()).pathname,status:r.status()});});
  const visit = async (id,label,width) => {
    await product.setViewportSize({width,height:960});
    await product.goto(base+'/qr/admin/?tab='+id);
    await expect(product.getByTestId('qr-console')).toBeVisible({timeout:30000});
    await expect(product.locator('h1')).toHaveText(label);
    if (id === 'OVERVIEW') await expect(product.getByText(/checks passed/)).toBeVisible({timeout:30000});
    await expect.poll(()=>product.locator('.qr-workspace-page').innerText()).not.toMatch(/Loading|Checking gateway readiness/);
    await expect.poll(()=>product.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    expect(await product.locator('h1').evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeLessThanOrEqual(32);
    await expect(product.locator('.qr-workspace-page [role=alert]')).toHaveCount(0);
    await product.screenshot({path:q.path.join(q.reportDir,'evidence',`admin-${id.toLowerCase()}-${width}.png`),fullPage:true});
  };
  await check('All 14 QR Admin pages keep their deep links, fit desktop/mobile, and load real backend data',async()=>{
    for(const width of [1440,390]) for(const [id,label] of pages) await visit(id,label,width);
    for(const feature of ['Translations','Promotions','Feedback','Alerts','Collections','License']) {
      await product.setViewportSize({width:1440,height:960});
      await product.goto(base+'/qr/admin/?tab=ADVANCED&feature='+feature);
      await expect(product.getByTestId('qr-console')).toBeVisible({timeout:30000});
      await expect(product.locator('h1')).toHaveText('Advanced Features');
      await expect.poll(()=>product.locator('.qr-workspace-page').innerText()).not.toMatch(/Loading licensed/);
      await expect(product.getByRole('button',{name:feature,exact:true})).toHaveAttribute('aria-current','page');
      await expect(product.locator('.qr-workspace-page [role=alert]')).toHaveCount(0);
      expect(await product.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
      await product.screenshot({path:q.path.join(q.reportDir,'evidence',`admin-feature-${feature.toLowerCase()}.png`),fullPage:true});
    }
    for(const [id,label] of [pages[2],pages[6],pages[13]]) await visit(id,label,320);
    await visit('OVERVIEW','Overview',768);
    expect(failures).toEqual([]);
    return {sections:14,advancedSubsections:7,widths:[320,390,768,1440],checks:38,apiServerErrors:0,headingsAtMost32px:true};
  });
  await check('Mobile sidebar is keyboard accessible and browser Back restores the previous section',async()=>{
    await product.setViewportSize({width:390,height:844});
    await product.goto(base+'/qr/admin/?tab=MENU');
    const trigger=product.getByRole('button',{name:'Browse workspace',exact:true});
    await trigger.click();
    await expect(product.getByRole('button',{name:'Customer Branding',exact:true})).toBeVisible();
    await product.keyboard.press('Escape'); await expect(trigger).toBeFocused();
    await trigger.click(); await product.getByRole('button',{name:'Payment Settings',exact:true}).click();
    await expect(product.locator('h1')).toHaveText('Payment Settings');
    expect(new URL(product.url()).searchParams.get('tab')).toBe('PAYMENTS');
    await product.goBack(); await expect(product.locator('h1')).toHaveText('Menu & Availability');
    return {escapeRestoresFocus:true,backRestoresSection:true};
  });
  await check('QR menu photos use the QR asset route and menu search finds real draft dishes',async()=>{
    await visit('MENU','Menu & Availability',1440);
    const card=product.locator('.qr-dish-card').filter({has:product.getByRole('heading',{name:'QA fresh meal',exact:true})});
    await card.getByRole('button',{name:'Edit',exact:true}).click();
    await product.getByLabel('Image URL',{exact:true}).fill('/assets/menu/thali/gujarati-thali.jpg');
    await product.getByRole('button',{name:'Save draft',exact:true}).click();
    await expect(card.locator('img')).toHaveAttribute('src','/qr/assets/menu/thali/gujarati-thali.jpg');
    await expect.poll(()=>card.locator('img').evaluate(e=>e.complete && e.naturalWidth>0)).toBe(true);
    await product.getByLabel('Search shared menu',{exact:true}).fill('QA fresh');
    await expect(product.locator('.qr-dish-card')).toHaveCount(1);
    await product.getByLabel('Search shared menu',{exact:true}).fill('not a real dish');
    await expect(product.getByText('No dishes match your filters. Try another name or category.')).toBeVisible();
    await product.getByLabel('Search shared menu',{exact:true}).fill('');
    await product.getByRole('button',{name:'Publish shared menu',exact:true}).click();
    await expect(product.getByRole('status')).toContainText('Menu published');
    await product.screenshot({path:q.path.join(q.reportDir,'evidence/admin-menu-repaired.png'),fullPage:true});
    return {photoRoute:'/qr/assets/menu/',imageLoaded:true,searchUsesRealRecords:true,published:true};
  });
  await check('QR settings and pickup changes persist after save and refresh',async()=>{
    await visit('PICKUP','Pickup Scheduling',1440);
    await product.getByLabel('Customer instructions',{exact:true}).fill('Collect your meal at the pickup counter.');
    await product.getByRole('button',{name:'Save settings',exact:true}).click();
    await expect(product.getByRole('status')).toContainText('Settings saved');
    await product.reload(); await expect(product.getByLabel('Customer instructions',{exact:true})).toHaveValue('Collect your meal at the pickup counter.');
    await visit('RULES','Ordering Rules',1440);
    await product.getByLabel('Preparation estimate (minutes)',{exact:true}).fill('18');
    await product.getByRole('button',{name:'Save ordering rules',exact:true}).click();
    await expect(product.getByRole('status')).toContainText('Settings saved');
    await product.reload(); await expect(product.getByLabel('Preparation estimate (minutes)',{exact:true})).toHaveValue('18');
    return {pickupInstructionsSaved:true,preparationMinutesSaved:18};
  });
  await check('Unsaved branding stays on its page until the owner saves or discards it',async()=>{
    await visit('BRAND','Customer Branding',1440);
    const original=await product.getByLabel('Welcome heading',{exact:true}).inputValue();
    await product.getByLabel('Welcome heading',{exact:true}).fill('Unsaved preview only');
    product.once('dialog',d=>d.dismiss());
    await product.getByRole('button',{name:'Overview',exact:true}).click();
    await expect(product.locator('h1')).toHaveText('Customer Branding');
    await expect(product.getByLabel('Welcome heading',{exact:true})).toHaveValue('Unsaved preview only');
    await product.getByRole('button',{name:'Discard changes',exact:true}).click();
    await expect(product.getByLabel('Welcome heading',{exact:true})).toHaveValue(original);
    await product.getByRole('button',{name:'Overview',exact:true}).click();
    await expect(product.locator('h1')).toHaveText('Overview');
    return {navigationProtected:true,discardRestoresSavedBranding:true};
  });
};
