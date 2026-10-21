/* Run via node tooling/qa/browser-kiosk-card-polish.cjs --actions [--before].
 * Uses the existing real-App harness with isolated data and blocked external APIs.
 */
const fs = require('node:fs');
const path = require('node:path');

module.exports = async function ({phase,output,root,send,evaluate,until,tap,button,screenshot,check,checks,cartState,inspect,results,errors,sleep}) {
  const viewports = [[320,740],[360,800],[390,844],[430,932],[768,1024],[1080,1920],[1366,768]];
  const resize = async (width,height) => {
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await sleep(120);
  };
  const firstAdd = `document.querySelector('[data-testid="kiosk-menu-card"] button[title="Add to Cart"]')`;
  const dockButton = `document.querySelector('[data-testid="kiosk-cart-dock"] button')`;
  const details = () => evaluate(`(() => {
    const cards=[...document.querySelectorAll('[data-testid="kiosk-menu-card"]')];
    const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
    return cards.map(c=>{
      const row=c.querySelector('.kiosk-product-actions'),add=c.querySelector('.kiosk-product-add'),custom=c.querySelector('.kiosk-product-customize');
      return {row:rect(row),add:rect(add),radius:getComputedStyle(add).borderRadius,icon:rect(add.querySelector('svg')),custom:custom?rect(custom):null,labelFits:!custom||custom.scrollWidth<=custom.clientWidth,nowrap:!custom||getComputedStyle(custom).whiteSpace==='nowrap'};
    });
  })()`);
  for(const [width,height] of viewports){
    await resize(width,height);
    await screenshot('menu-'+width+'x'+height);
    results.push({name:'menu '+width+'x'+height,...await inspect(),actions:await details()});
  }
  await resize(1080,1920);
  // Observe CSS animation events without relying on timing-sensitive screenshots.
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await evaluate(`window.__cartAnimations=[];document.addEventListener('animationstart',event=>{if(event.target.matches('.kiosk-cart-summary,.kiosk-cart-total'))window.__cartAnimations.push({target:event.target.className,name:event.animationName});});`);
  await tap(firstAdd);
  await until(`Boolean(${dockButton})`, 'cart appears');
  if(phase==='after') {
    check(await evaluate(`window.__cartAnimations.some(a=>a.name==='kioskCartEnter')`) ,'First item reveals the cart with upward motion');
    check((await cartState()).quantity===1,'First add updates quantity immediately');
  }
  await sleep(320);
  const initialEvents=await evaluate('window.__cartAnimations.length');
  // Changing the search UI causes unrelated App renders, with no cart mutation.
  await evaluate(`(async()=>{const {db}=await import('/@fs/${path.join(root,'packages/database/src/index.ts').replaceAll('\\','/')}');db.notify();})()`);
  await sleep(160);
  if(phase==='after') check(await evaluate('window.__cartAnimations.length')===initialEvents,'Unrelated renders do not replay cart animations');
  await tap(firstAdd);
  if(phase==='after') {
    check(await evaluate(`window.__cartAnimations.some(a=>a.name==='kioskCartPulse')`),'Second addition pulses the cart');
    check(await evaluate(`window.__cartAnimations.some(a=>a.target.includes('kiosk-cart-total'))`),'Changed total receives brief text emphasis');
    await evaluate(`for(let n=0;n<5;n++)${firstAdd}.click()`);
    await sleep(40);
    check((await cartState()).quantity===7,'Rapid additions update all quantities');
    check(await evaluate(`${dockButton}.getAnimations().length<=1`),'Rapid additions never overlap cart animations');
  }
  await sleep(350);
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  for(const [width,height] of viewports){
    await resize(width,height);
    await screenshot('cart-'+width+'x'+height);
    results.push({name:'cart '+width+'x'+height,...await inspect(),actions:await details()});
    await evaluate(`document.querySelector('[data-testid="kiosk-menu-scroll"]').scrollTop=1e7`);
    await sleep(100);
    await screenshot('last-row-'+width+'x'+height);
    results.push({name:'last row '+width+'x'+height,...await inspect(),actions:await details()});
    if(phase==='after') check(await evaluate(`(() => {const c=[...document.querySelectorAll('[data-testid="kiosk-menu-card"]')].at(-1);return [...c.querySelectorAll('.kiosk-product-action')].every(e=>{const r=e.getBoundingClientRect(),top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return e===top||e.contains(top);});})()`),width+': final row actions are unobstructed');
    await evaluate(`document.querySelector('[data-testid="kiosk-menu-scroll"]').scrollTop=0`);
  }
  if(phase==='before') { console.log('Baseline saved: '+output); return; }
  for(const result of results){
    const name=result.name;
    check(!result.overflow,name+': no horizontal page overflow');
    check(result.actions.every(a=>a.add.height>=39.5&&a.add.height<=44.5&&Math.abs(a.add.width-a.add.height)<0.5),name+': consistent circular Add controls');
    check(result.actions.every(a=>!a.custom||(Math.abs(a.custom.height-a.add.height)<0.5&&Math.abs(a.row.right-a.add.right)<0.5&&a.add.x-a.custom.right>=7.5&&a.add.x-a.custom.right<=10.5&&a.labelFits&&a.nowrap)),name+': matching controls, balanced gap, legible single-line label');
    check(result.actions.every(a=>a.icon.width>=16&&a.icon.width<=18),name+': restrained plus icons');
    if(result.dock){
      check(result.dock.width<=520.5&&result.dock.x>=19&&result.dock.right<=result.viewport.width-19,name+': compact cart fits viewport');
      check(Math.abs(result.dock.x-(result.viewport.width-result.dock.width)/2)<1,name+': cart centered');
      const gap=result.viewport.height-result.dock.bottom;
      check(gap>=13.5&&gap<=20.5,name+': comfortable bottom gap');
      check(result.dock.height>=54&&result.dock.height<=64.5,name+': compact cart height');
      if(name.startsWith('last row'))check(result.cards.at(-1).rect.bottom<=result.dock.y-12,name+': final row clears cart');
    }
  }
  const baseline=JSON.parse(fs.readFileSync(path.join(output,'before-results.json'),'utf8'));
  const oldCart=baseline.results.find(r=>r.name==='cart 1080x1920').dock;
  const newCart=results.find(r=>r.name==='cart 1080x1920').dock;
  check(newCart.width<oldCart.width-100,'Cart is visibly narrower than baseline',{before:oldCart.width,after:newCart.width});
  check(results.find(r=>r.name==='menu 1080x1920').columns.split(' ').length===3,'Target 1080x1920 retains three product columns');
  await resize(1366,768);
  await send('Emulation.setTouchEmulationEnabled',{enabled:false});
  await sleep(100);
  check((await details()).every(a=>a.add.width===40&&a.add.height===40&&(!a.custom||a.custom.height===40)),'Mouse controls use the requested matching 40px dimensions');
  const addBefore=await evaluate(`(() => {const e=document.querySelector('.kiosk-product-add');const r=e.getBoundingClientRect();return {width:r.width,height:r.height};})()`);
  await evaluate(`document.querySelector('.kiosk-product-add').disabled=true`);
  check(await evaluate(`(() => {const e=document.querySelector('.kiosk-product-add');const r=e.getBoundingClientRect();return r.width===${addBefore.width}&&r.height===${addBefore.height}&&Number(getComputedStyle(e).opacity)<1;})()`),'Disabled Add remains round and retains its dimensions');
  await evaluate(`document.querySelector('.kiosk-product-add').disabled=false`);
  await screenshot('mouse-controls-1366x768');
  await send('Emulation.setTouchEmulationEnabled',{enabled:true});
  await resize(320,740);
  const previous=await cartState();
  const events=await evaluate('window.__cartAnimations.length');
  await tap(firstAdd);
  check((await cartState()).quantity===previous.quantity+1,'Reduced motion preserves add behavior');
  check(await evaluate('window.__cartAnimations.length')===events,'Reduced motion disables cart animation');
  check(await evaluate(`getComputedStyle(${dockButton}).transitionDuration==='0s'&&getComputedStyle(document.querySelector('.kiosk-product-action')).transitionDuration==='0s'`),'Reduced motion disables press transitions');
  await evaluate(`document.querySelector('.kiosk-product-add').focus()`);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  check(await evaluate(`document.activeElement.matches('button')&&getComputedStyle(document.activeElement).outlineStyle!=='none'`),'Keyboard navigation retains visible focus');
  await tap(dockButton);
  check(await evaluate(`document.querySelector('.kiosk-cart-drawer').parentElement.getAttribute('aria-hidden')==='false'`),'Cart opens existing order drawer');
  const beforeIncrement=await cartState();
  await tap(`[...document.querySelectorAll('button')].find(e=>e.getAttribute('aria-label')?.startsWith('Increase quantity of'))`);
  check((await cartState()).quantity===beforeIncrement.quantity+1&&(await cartState()).total>beforeIncrement.total,'Quantity increment updates existing totals');
  await tap(`[...document.querySelectorAll('button')].find(e=>e.getAttribute('aria-label')?.startsWith('Decrease quantity of'))`);
  check((await cartState()).quantity===beforeIncrement.quantity&&(await cartState()).total===beforeIncrement.total,'Quantity decrement restores existing totals');
  await tap(button('Close order summary'));
  const reopenedEvents=await evaluate('window.__cartAnimations.length');
  await sleep(300);
  check(await evaluate('window.__cartAnimations.length')===reopenedEvents,'Closing the drawer does not replay entry feedback');
  await evaluate(`(async()=>{const {db}=await import('/@fs/${path.join(root,'packages/database/src/index.ts').replaceAll('\\','/')}');const items=db.menuItems.filter(i=>i.isAvailable);items[0].name='A very long freshly prepared seasonal special with accompaniments';items[1].description='A long description with seasonal vegetables and fragrant spices, freshly prepared and served with accompaniments for the whole table.';items[2].description='';db.notify();})()`);
  await resize(1080,1920);
  const mixed=await inspect();
  check(mixed.cards.slice(0,3).every(c=>Math.abs(c.buttons.at(-1).rect.bottom-mixed.cards[0].buttons.at(-1).rect.bottom)<1),'Long names and mixed descriptions retain row alignment');
  await screenshot('mixed-content-1080x1920');
  await resize(390,844);
  await tap(`document.querySelector('.kiosk-product-customize')`);
  check(await evaluate(`Boolean([...document.querySelectorAll('[role="dialog"]')].find(e=>e.textContent.includes('Add to Cart')))`),'Customize retains modifier dialog');
  await screenshot('customize-390x844');
  await tap(`[...document.querySelectorAll('[role="dialog"] button')].find(e=>e.textContent.trim().startsWith('Add to Cart'))`);
  check((await cartState()).quantity===beforeIncrement.quantity+1,'Customization confirmation adds correctly');
  // Long count and price through the existing draft recovery state, without changing calculations.
  await evaluate(`const key='jamanvaar-kiosk-draft:isolated-card-polish';const draft=JSON.parse(sessionStorage.getItem(key));draft.items[0].quantity=12345;draft.items[0].itemTotal=draft.items[0].unitPrice*12345;draft.at=Date.now();sessionStorage.setItem(key,JSON.stringify(draft));`);
  await send('Page.reload');
  await until(`Boolean(${button('Resume saved cart')})`,'draft recovery');
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await evaluate(`window.__restoredEntries=0;document.addEventListener('animationstart',event=>{if(event.animationName==='kioskCartEnter')window.__restoredEntries++;});`);
  await tap(button('Resume saved cart'));
  await tap(`[...document.querySelectorAll('button')].find(e=>e.textContent.includes('Takeaway'))`);
  await until(`Boolean(${dockButton})`,'restored cart');
  check(await evaluate('window.__restoredEntries')===1,'A recovered cart animates only on its first visible appearance');
  await sleep(300);
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  for(const [width,height] of [[320,740],[390,844],[1080,1920]]){
    await resize(width,height);
    for(const mode of ['standard','large']){
      await evaluate(`document.documentElement.dataset.jvDisplay='${mode}'`);await sleep(100);
      const fit=await evaluate(`(() => {const e=${dockButton};return [e,...e.querySelectorAll('.kiosk-cart-info,.kiosk-cart-checkout,.kiosk-cart-total')].map(n=>({class:n.className,width:n.clientWidth,scrollWidth:n.scrollWidth,text:n.textContent}));})()`);
      check(fit.every(n=>n.scrollWidth<=n.width),width+' '+mode+': long count and price fit cart',fit);
      await screenshot('long-values-'+mode+'-'+width);
      if(mode==='large'){
        const actions=await details();
        check(actions.every(a=>a.add.width===48&&a.add.height===48&&(!a.custom||(a.custom.height===48&&a.labelFits))),width+': large display preserves round 48px touch controls and readable labels');
        await evaluate(`document.querySelector('[data-testid="kiosk-menu-scroll"]').scrollTop=1e7`);await sleep(100);
        const last=await inspect();
        check(last.cards.at(-1).rect.bottom<=last.dock.y-12,width+': large display final row clears cart');
        await screenshot('large-last-row-'+width);
        await evaluate(`document.querySelector('[data-testid="kiosk-menu-scroll"]').scrollTop=0`);
      }
    }
  }
  await evaluate(`document.documentElement.dataset.jvDisplay='standard'`);
  await resize(1080,1920);
  await tap(dockButton);
  // Only navigates to payment selection; never confirms or submits an order.
  await tap(`[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Proceed to Payment')`);
  check(await evaluate(`document.body.textContent.includes('Confirm & Get Token')||document.body.textContent.includes('Payment Method')`),'Existing checkout reaches payment selection');
  check(errors.length===0,'No uncaught browser errors',errors);
  console.log(JSON.stringify({output,viewports,checks:checks.length,failed:checks.filter(c=>c.status==='FAIL'),errors},null,2));
};
