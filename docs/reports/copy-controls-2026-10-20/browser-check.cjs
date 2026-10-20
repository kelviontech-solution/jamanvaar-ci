const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{pathToFileURL}=require('url');
const root=path.resolve(__dirname,'../../..');
(async()=>{
  const{createServer,loadConfigFromFile}=await import('vite'),react=(await import('@vitejs/plugin-react')).default;
  const config=await loadConfigFromFile({command:'serve',mode:'development'},path.join(root,'cloud/super-admin-web/vite.config.ts'));
  const tw=(await import(pathToFileURL(path.join(root,'cloud/super-admin-web/tailwind.config.js')).href)).default;
  tw.content=[path.join(root,'cloud/super-admin-web/src/**/*.{js,ts,jsx,tsx}'),path.join(root,'packages/ui/src/**/*.{js,ts,jsx,tsx}')];
  const tailwind=(await import('tailwindcss')).default,autoprefixer=(await import('autoprefixer')).default;
  const api=`export class ApiError extends Error{};export const api={get:async url=>{window.__copyFixture.requests.push(url);if(url==='/api/v1/restaurants')return[{id:'fixture-internal-uuid',restaurantCode:'JM1234567890',mobile:'1234567890',name:'River House',legalName:null,city:'Ahmedabad',state:'Gujarat',status:'ACTIVE',createdAt:'2026-10-20T08:00:00Z',users:[],subscriptions:[],_count:{branches:1,devices:0}}];throw Error('Unexpected isolated request '+url);},post:async()=>{throw Error('No mutations permitted in copy fixture');}};`;
  const server=await createServer({root,configFile:false,cacheDir:path.join(root,'.jamanvaar/copy-browser-vite'),publicDir:false,resolve:config.config.resolve,plugins:[react(),{name:'isolated-copy-fixture',enforce:'pre',load(id){id=id.replaceAll('\\','/');if(id.endsWith('/super-admin-web/src/api/client.ts'))return api;if(id.endsWith('/super-admin-web/src/auth/AuthContext.tsx'))return 'export const useAuth=()=>({can:()=>true,user:{role:"PLATFORM_OWNER"}});';}}],css:{postcss:{plugins:[tailwind(tw),autoprefixer()]}},server:{host:'127.0.0.1',port:5547,strictPort:true,watch:null,fs:{allow:[root]}}});
  await server.listen();const{chromium}=require('playwright'),browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
  const origin='https://system.example.test',url=origin+'/docs/reports/copy-controls-2026-10-20/fixture.html';
  let restorePage,originalClipboard;
  async function context(width,mode='native'){
    const ctx=await browser.newContext({viewport:{width,height:1000},permissions:['clipboard-read','clipboard-write']});
    await ctx.route(origin+'/**',async route=>{const response=await route.fetch({url:route.request().url().replace(origin,'http://127.0.0.1:5547')});await route.fulfill({response});});
    await ctx.addInitScript(mode=>{window.__readClipboard=navigator.clipboard.readText.bind(navigator.clipboard);if(mode!=='native')Object.defineProperty(navigator,'clipboard',{configurable:true,value:mode==='legacy'?undefined:{writeText:async()=>{throw Error('NotAllowedError');}}});if(mode==='blocked')document.execCommand=()=>false;},mode);
    return ctx;
  }
  try{
    for(const width of [1440,390]){
      console.log('Checking native clipboard',width);
      const ctx=await context(width),page=await ctx.newPage(),errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error('Browser error:',error.message);});
      await page.goto(url);await page.getByRole('button',{name:'JM1234567890',exact:true}).waitFor();
      if(!restorePage){restorePage=page;originalClipboard=await page.evaluate(()=>window.__readClipboard());}
      const originalPath=new URL(page.url()).pathname,card=page.getByRole('button',{name:'JM1234567890',exact:true});
      const before=await page.evaluate(()=>window.__copyFixture.requests.length);
      await card.click();await page.locator('.mgmt-card .copy-control[data-copy-state=copied]').waitFor();
      assert.equal(await page.evaluate(()=>window.__readClipboard()),'JM1234567890');assert.equal(new URL(page.url()).pathname,originalPath);
      assert.equal(await page.evaluate(()=>window.__copyFixture.requests.length),before,'Copy must not request a server operation');
      await page.locator('.mgmt-card .copy-control').focus();await page.keyboard.press('Enter');assert.equal(new URL(page.url()).pathname,originalPath);
      const summary=page.getByRole('button',{name:'Copy safe summary',exact:true});await summary.click();await page.locator('.owner-handover .copy-control[data-copy-state=copied]').waitFor();
      assert.ok((await page.evaluate(()=>window.__readClipboard())).includes('Restaurant ID: JM1234567890'));
      const samples=[['Restaurant ID','JM1234567890'],['Internal UUID','fixture-internal-uuid'],['Activation key','FIXTURE-NOT-A-REAL-KEY'],['Invitation link','https://system.example.test/activate/fixture'],['Support token','fixture-not-a-real-token'],['License certificate','fixture.payload.signature'],['Owner email','owner@example.invalid']];
      for(const[index,[label,text]]of samples.entries()){const button=page.getByRole('region',{name:'Shared copy variants'}).locator('button').nth(index);await button.click();await button.locator('svg.lucide-check').waitFor();assert.equal(await button.getAttribute('data-copy-state'),'copied');assert.equal(await page.evaluate(()=>window.__readClipboard()),text);}
      const icon=page.getByRole('button',{name:'Copy icon-only value',exact:true});await icon.click();await icon.locator('svg.lucide-check').waitFor();assert.equal(await page.evaluate(()=>window.__readClipboard()),'fixture-icon-value');
      assert.notEqual(await icon.evaluate(node=>getComputedStyle(node).animationName),'none');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
      await page.screenshot({path:path.join(__dirname,`copied-${width}.png`),fullPage:true});assert.deepEqual(errors,[]);
      results.push({width,nativeClipboardReadback:true,restaurantIdCopied:true,summaryCopied:true,allSharedVariants:true,tickAndAnimation:true,noCopyServerRequest:true,noCardNavigation:true,overflow:false});
      // Keep one context alive solely to restore the operating-system clipboard in finally.
      if(page!==restorePage)await ctx.close();
    }
    const legacy=await context(390,'legacy'),fallback=await legacy.newPage();await fallback.goto(url);await fallback.getByRole('button',{name:'JM1234567890',exact:true}).click();await fallback.locator('.mgmt-card .copy-control[data-copy-state=copied]').waitFor();assert.equal(await fallback.evaluate(()=>window.__readClipboard()),'JM1234567890');results.push({missingClipboardApiFallback:true});await legacy.close();
    const denied=await context(390,'blocked'),blocked=await denied.newPage();await blocked.goto(url);await blocked.getByRole('button',{name:'JM1234567890',exact:true}).click();const dialog=blocked.getByRole('dialog',{name:'Copy manually',exact:true});await dialog.waitFor();assert.equal(await dialog.getByLabel('Text to copy').inputValue(),'JM1234567890');assert.equal(await blocked.locator('.mgmt-card .copy-control[data-copy-state=failed]').count(),1);assert.equal(await blocked.locator('.mgmt-card .copy-control[data-copy-state=copied]').count(),0);await blocked.screenshot({path:path.join(__dirname,'manual-copy-390.png'),fullPage:true});await dialog.getByRole('button',{name:'Close',exact:true}).click();results.push({blockedClipboardManualFallback:true,noFalseSuccess:true});await denied.close();
    console.log(JSON.stringify(results,null,2));
  }finally{if(restorePage&&originalClipboard!==undefined)await restorePage.evaluate(value=>navigator.clipboard.writeText(value),originalClipboard).catch(()=>{});fs.writeFileSync(path.join(__dirname,'browser-results.json'),JSON.stringify(results,null,2));await browser.close();await server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
