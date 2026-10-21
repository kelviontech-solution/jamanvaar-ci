const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{pathToFileURL}=require('url');
const root=path.resolve(__dirname,'../../..'),report='/docs/reports/qr-menu-code-2026-10-20';
(async()=>{
 const {createServer,loadConfigFromFile}=await import('vite'),react=(await import('@vitejs/plugin-react')).default;
 const config=await loadConfigFromFile({command:'serve',mode:'development'},path.join(root,'apps/restaurant-system/pos-admin/vite.config.ts'));
 const tw=(await import(pathToFileURL(path.join(root,'apps/restaurant-system/pos-admin/tailwind.config.js')).href)).default;
 tw.content=[path.join(root,'apps/restaurant-system/pos-admin/src/**/*.{ts,tsx}'),path.join(root,'packages/ui/src/**/*.{ts,tsx}')];
 const tailwind=(await import('tailwindcss')).default,autoprefixer=(await import('autoprefixer')).default;
 const client=`const fixture=()=>window.__menuFixture;const save=()=>sessionStorage.setItem('menu-code-fixture',JSON.stringify(fixture()));
 export const QrAdminApi={
 async menuCodes(branch,cursor){const f=fixture();f.requests.push({method:'GET',branch,cursor});if(f.slowBranch&&branch==='branch-a')await new Promise(r=>setTimeout(r,700));if(f.fail)throw Error('Connection interrupted');const all=f.codes.filter(row=>row.branchId===branch),start=cursor?all.findIndex(row=>row.id===cursor)+1:0,rows=all.slice(start,start+2);return{rows:structuredClone(rows),total:all.length,nextCursor:start+2<all.length?rows.at(-1).id:null,menuOnlyEnabled:f.enabled[branch],publicBaseUrlConfigured:!f.missingPublicUrl};},
 async menuCode(branch,label){const f=fixture();if(f.failCreate)throw Error('Device limit reached');f.creates++;const code={id:'menu-'+f.creates,status:'ACTIVE',mode:'MENU_ONLY',version:1,tableId:null,displayNumber:label,branchId:branch,branchName:branch==='branch-a'?'Main Dining':'Second Branch',createdAt:new Date().toISOString(),url:'https://restaurant.example/q/menu-code-'+f.creates};f.codes.unshift(code);save();return structuredClone(code);},
 async saveSettings(body,branch){fixture().enabled[branch]=body.menuOnlyEnabled;save();return body;},
 async printData(id){const row=fixture().codes.find(row=>row.id===id);if(fixture().failPrint)throw Error('Print service unavailable');return{restaurantName:'River House',branchName:row.branchName,tableLabel:row.displayNumber,url:row.url,tagline:'Scan • Order • Enjoy',logoUrl:null,design:{template:'premium',accent:'#0B253A',instruction:'Scan to view our menu',footer:'Freshly prepared. Thoughtfully served.',showLogo:false,layout:'CARD'}};},
 async disable(id){const row=fixture().codes.find(row=>row.id===id);row.status='DISABLED';row.url=null;save();},
 async enable(id){const row=fixture().codes.find(row=>row.id===id);row.status='ACTIVE';row.url='https://restaurant.example/q/'+id;save();},
 async revoke(id){const row=fixture().codes.find(row=>row.id===id);row.status='REVOKED';row.url=null;save();},
 async regenerate(id){const old=fixture().codes.find(row=>row.id===id);const next=await this.menuCode(old.branchId,old.displayNumber);old.status='REVOKED';old.url=null;const saved=fixture().codes.find(row=>row.id===next.id);saved.version=old.version+1;save();return structuredClone(saved);}
 };`;
 const server=await createServer({root,configFile:false,cacheDir:path.join(root,'.jamanvaar/menu-code-browser-vite'),resolve:config.config.resolve,plugins:[react(),{name:'isolated-menu-code-api',enforce:'pre',load(id){if(id.replaceAll('\\','/').endsWith('/pos-admin/src/cloud/qrAdminClient.ts'))return client;}}],css:{postcss:{plugins:[tailwind(tw),autoprefixer()]}},server:{host:'127.0.0.1',port:5551,strictPort:true,watch:null,fs:{allow:[root]}}});
 await server.listen();const {chromium}=require('playwright'),browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
 try {
  for(const width of [390,1440]){
   const context=await browser.newContext({viewport:{width,height:1000},permissions:['clipboard-read','clipboard-write'],acceptDownloads:true});
   await context.addInitScript(()=>{window.print=()=>{window.__printInvoked=true;};});
   const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.goto('http://127.0.0.1:5551'+report+'/fixture.html');
   let originalClipboard;try{originalClipboard=await page.evaluate(()=>navigator.clipboard.readText());}catch{}
   try {
    await page.getByText('Existing counter card',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Create menu QR',exact:true}).click();
    const create=page.getByRole('dialog',{name:'Create menu QR'});await create.getByLabel('Code name').fill('Counter display');
    await create.getByRole('button',{name:'Create & view QR'}).click();
    const preview=page.getByRole('dialog',{name:'Menu QR preview'});await preview.getByRole('heading',{name:'Counter display'}).waitFor();
    assert.equal(await page.evaluate(()=>window.__menuFixture.creates),1);
    assert.equal(await preview.getByRole('button',{name:'Download PNG'}).isDisabled(),true);
    await preview.getByRole('button',{name:'Enable menu QR codes for this branch'}).click();
    await preview.getByRole('button',{name:'Download PNG'}).waitFor();await page.waitForFunction(()=>window.__menuFixture.enabled['branch-a']);
    const expected=await preview.getByLabel('Menu link',{exact:true}).inputValue();
    await preview.getByRole('button',{name:'Copy link',exact:true}).click();await preview.getByRole('button',{name:'Copied!',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),expected);
    const downloadEvent=page.waitForEvent('download');await preview.getByRole('button',{name:'Download PNG',exact:true}).click();const downloaded=await downloadEvent;
    const file=path.join(__dirname,'menu-qr-'+width+'.png');await downloaded.saveAs(file);
    const sharp=require('sharp'),jsQR=require('jsqr'),raw=await sharp(file).resize({width:960}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    assert.equal(jsQR(new Uint8ClampedArray(raw.data),raw.info.width,raw.info.height)?.data,expected,'Downloaded poster QR must decode to the actual menu URL');
    const popupEvent=page.waitForEvent('popup');await preview.getByRole('button',{name:'Print / Save PDF'}).click();const popup=await popupEvent;
    await popup.waitForFunction(()=>window.__printInvoked===true);
    assert.ok((await popup.locator('body').innerText()).includes('Counter display'));assert.ok(!(await popup.locator('body').innerText()).includes('Table Counter display'));await popup.close();
    assert.equal(await preview.getByRole('link',{name:'Open menu'}).getAttribute('href'),expected);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    await page.screenshot({path:path.join(__dirname,'preview-'+width+'.png'),fullPage:false});
    await preview.getByRole('button',{name:'Close Menu QR preview'}).click();await page.reload();await page.getByText('Counter display',{exact:true}).waitFor();
    const code=page.locator('.qr-menu-codes li').filter({has:page.getByText('Counter display',{exact:true})});
    await code.getByRole('button',{name:'Turn off',exact:true}).click();await page.getByRole('dialog',{name:'Turn off this menu QR code?'}).getByRole('button',{name:'Turn off',exact:true}).click();await code.getByText('Turned off',{exact:true}).waitFor();
    await code.getByRole('button',{name:'Turn on',exact:true}).click();await code.getByRole('button',{name:'View QR',exact:true}).waitFor();
    await code.getByRole('button',{name:'Replace code',exact:true}).click();await page.getByRole('dialog',{name:'Replace this menu QR code?'}).getByRole('button',{name:'Replace code',exact:true}).click();await preview.waitFor();assert.equal(await preview.getByLabel('Menu link').inputValue(),'https://restaurant.example/q/menu-code-2');await preview.getByRole('button',{name:'Close Menu QR preview'}).click();
    await page.getByRole('button',{name:'Load more menu codes'}).click();await page.getByText('3 of 3 saved codes',{exact:false}).waitFor();
    await page.screenshot({path:path.join(__dirname,'saved-codes-'+width+'.png'),fullPage:true});
    await page.evaluate(()=>window.__menuFixture.fail=true);await page.getByRole('button',{name:'Refresh menu codes',exact:true}).click();await page.getByRole('alert').filter({hasText:'Connection interrupted'}).waitFor();assert.ok(await page.getByText('Existing counter card',{exact:true}).isVisible());
    await page.evaluate(()=>window.__menuFixture.fail=false);await page.getByRole('button',{name:'Refresh menu codes',exact:true}).click();await page.getByText('2 of 3 saved codes',{exact:false}).waitFor();
    await page.getByRole('button',{name:'Create menu QR',exact:true}).click();await page.evaluate(()=>window.__menuFixture.failCreate=true);await create.getByRole('button',{name:'Create & view QR'}).click();await create.getByRole('alert').filter({hasText:'Device limit reached'}).waitFor();assert.equal(await page.evaluate(()=>window.__menuFixture.creates),2);await create.getByRole('button',{name:'Close Create menu QR'}).click();await page.evaluate(()=>window.__menuFixture.failCreate=false);
    await page.getByLabel('Branch',{exact:true}).selectOption('branch-b');await page.getByText('No menu QR codes yet.',{exact:false}).waitFor();assert.equal(await page.getByText('Counter display',{exact:true}).count(),0);
    assert.deepEqual(errors,[]);results.push({width,existingCodesRecovered:true,createShowsPreview:true,modeOffExplained:true,enableBranchMode:true,clipboardReadBack:true,pngQrDecoded:true,printDocumentCorrect:true,persistentAfterReload:true,offOnAndReplacement:true,pagination:true,networkFailureKeepsSavedCodes:true,quotaFailureShown:true,branchIsolation:true,horizontalOverflow:false});
   } finally { if(originalClipboard!==undefined)try{await page.bringToFront();await page.evaluate(text=>navigator.clipboard.writeText(text),originalClipboard);}catch{}await context.close(); }
  }
  const faults=await browser.newContext({viewport:{width:390,height:900}}),fault=await faults.newPage();
  try {
   await fault.goto('http://127.0.0.1:5551'+report+'/fixture.html');await fault.getByText('Existing counter card',{exact:true}).waitFor();
   await fault.evaluate(()=>window.__menuFixture.missingPublicUrl=true);await fault.getByRole('button',{name:'Refresh menu codes'}).click();
   await fault.getByRole('alert').filter({hasText:'public ordering address is not configured'}).waitFor();
   await fault.getByRole('button',{name:'Create menu QR',exact:true}).click();const dialog=fault.getByRole('dialog',{name:'Create menu QR'});
   assert.equal(await dialog.getByRole('button',{name:'Create & view QR'}).isDisabled(),true);await dialog.getByRole('button',{name:'Close Create menu QR'}).click();
   await fault.evaluate(()=>{window.__menuFixture.missingPublicUrl=false;window.__menuFixture.enabled['branch-a']=true;});await fault.getByRole('button',{name:'Refresh menu codes'}).click();await fault.getByRole('button',{name:'View QR'}).click();
   const preview=fault.getByRole('dialog',{name:'Menu QR preview'});await preview.waitFor();
   await fault.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(Error('Blocked'))}});document.execCommand=()=>false;});
   await preview.getByRole('button',{name:'Copy link',exact:true}).click();await preview.getByRole('alert').filter({hasText:'Copy was blocked'}).waitFor();assert.equal(await preview.getByRole('button',{name:'Copied!',exact:true}).count(),0);
   await fault.evaluate(()=>window.__menuFixture.failPrint=true);const popupEvent=fault.waitForEvent('popup');await preview.getByRole('button',{name:'Print / Save PDF'}).click();const popup=await popupEvent;
   await preview.getByRole('alert').filter({hasText:'Print service unavailable'}).waitFor();assert.equal(popup.isClosed(),true);
   await preview.getByRole('button',{name:'Close Menu QR preview'}).click();await fault.evaluate(()=>window.__menuFixture.slowBranch=true);await fault.getByRole('button',{name:'Refresh menu codes'}).click();await fault.getByLabel('Branch',{exact:true}).selectOption('branch-b');await fault.getByText('No menu QR codes yet.',{exact:false}).waitFor();await fault.waitForTimeout(850);assert.equal(await fault.getByText('Existing counter card',{exact:true}).count(),0);
   results.push({missingPublicAddressExplainedAndCreationBlocked:true,clipboardFailureDoesNotClaimSuccess:true,printFailureClosesPopupAndShowsError:true,lateOtherBranchResponseIgnored:true});
  } finally { await faults.close(); }
  fs.writeFileSync(path.join(__dirname,'browser-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
 } finally { await browser.close();await server.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
