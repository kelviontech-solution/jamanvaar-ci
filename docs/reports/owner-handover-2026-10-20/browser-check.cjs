const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{pathToFileURL}=require('url');
const root=path.resolve(__dirname,'../../..');
(async()=>{
  const{createServer,loadConfigFromFile}=await import('vite'),react=(await import('@vitejs/plugin-react')).default;
  const config=await loadConfigFromFile({command:'serve',mode:'development'},path.join(root,'cloud/super-admin-web/vite.config.ts'));
  const tw=(await import(pathToFileURL(path.join(root,'cloud/super-admin-web/tailwind.config.js')).href)).default;
  tw.content=[path.join(root,'cloud/super-admin-web/src/**/*.{js,ts,jsx,tsx}'),path.join(root,'packages/ui/src/**/*.{js,ts,jsx,tsx}')];
  const tailwind=(await import('tailwindcss')).default,autoprefixer=(await import('autoprefixer')).default;
  const client=`export class CloudApiError extends Error{};
  export async function cloudQrAccount(){if(!sessionStorage.getItem('fixture-signed-in'))throw Error('Missing bearer token');return{role:'OWNER',fullName:'Fixture Owner',branchId:null};}
  export async function qrApi(){return[{id:'branch-a',name:'Main Dining & Kitchen',status:'ACTIVE',restaurantTimezone:'Asia/Kolkata'},{id:'branch-b',name:'Second branch',status:'ACTIVE',restaurantTimezone:'Asia/Kolkata'}];}
  export async function cloudLoginOwner(){sessionStorage.setItem('fixture-signed-in','1');return{requiresActivation:false};}export const cloudLogin=cloudLoginOwner,cloudActivateDevice=cloudLoginOwner;
  export async function cloudLogout(){};export async function cloudRequestPasswordResetOwner(){};export async function cloudVerifyPasswordResetOwner(){};export async function cloudCompletePasswordResetOwner(){};`;
  const consoleFixture=`import React from 'react';export function QrConsole(){const query=new URLSearchParams(location.search);const branch=localStorage.getItem('jamanvaar_admin_branch:fixture-restaurant');return React.createElement('section',{'data-testid':'destination'},React.createElement('h2',null,query.get('opsTask')==='handover'?'Branch handover task':'Channel tests task'),React.createElement('p',null,'Branch: '+branch));}`;
  const fixture='/docs/reports/owner-handover-2026-10-20/fixture.html';
  const server=await createServer({root,configFile:false,publicDir:path.join(root,'apps/restaurant-system/pos-admin/public'),resolve:config.config.resolve,plugins:[react(),{name:'safe-owner-fixtures',enforce:'pre',load(id){id=id.replaceAll('\\','/');if(id.endsWith('/super-admin-web/src/auth/AuthContext.tsx'))return 'export const useAuth=()=>({can:()=>true});';if(id.endsWith('/cloud/cloudClient.ts'))return client;if(id.endsWith('/qrconsole/QrConsole.tsx'))return consoleFixture;if(id.endsWith('/cloud/qrAdminClient.ts'))return 'export class QrAdminApi{}';},configureServer(server){server.middlewares.use((req,_res,next)=>{if(/^\/qr\/(admin|login)\//.test(req.url||''))req.url=fixture;next();});}}],css:{postcss:{plugins:[tailwind(tw),autoprefixer()]}},define:{'import.meta.env.VITE_RESTAURANT_ADMIN_URL':JSON.stringify('http://localhost:5176'),'import.meta.env.VITE_QR_ADMIN_URL':JSON.stringify('http://localhost:5176/qr/login')},server:{host:'127.0.0.1',port:5546,strictPort:true,watch:null,fs:{allow:[root]}}});
  await server.listen();const{chromium}=require('playwright'),browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
  const origin='https://system.example.test';
  async function context(width){const context=await browser.newContext({viewport:{width,height:1000}});await context.route(origin+'/**',async route=>{const url=route.request().url().replace(origin,'http://127.0.0.1:5546').replace('/qr/assets/','/assets/');const response=await route.fetch({url});await route.fulfill({response});});await context.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.__copied=text;}}});});return context;}
  try{
    for(const width of [1440,390]){
      const ctx=await context(width),page=await ctx.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(origin+fixture);
      await page.getByRole('heading',{name:'Finish setup with the owner'}).waitFor();
      const tests=page.getByRole('link',{name:'Open channel tests',exact:true}),handover=page.getByRole('link',{name:'Open branch handover',exact:true});
      for(const link of [tests,handover]){const url=new URL(await link.getAttribute('href'));assert.equal(url.origin,origin);assert.equal(url.pathname,'/qr/admin/');assert.equal(url.searchParams.get('branchId'),'branch-a');assert.equal(url.searchParams.get('tab'),'OPERATIONS');}
      await page.getByRole('button',{name:'Copy safe summary',exact:true}).click();assert.ok(await page.evaluate(()=>window.__copied.includes('https://system.example.test/qr/admin/')));assert.equal(await page.evaluate(()=>window.__copied.includes('localhost')),false);
      await page.getByRole('button',{name:'Review owner access',exact:true}).click();await page.getByRole('button',{name:'Check connected devices',exact:true}).click();assert.ok(await page.evaluate(()=>window.__tasks.ownerAccess&&window.__tasks.devices));
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
      await page.screenshot({path:path.join(__dirname,`handover-${width}.png`),fullPage:true});
      // Click the real external task. QR login must preserve its destination and branch.
      const opened=page.waitForEvent('popup');await tests.click();const target=await opened;
      await target.getByRole('link',{name:'Sign in',exact:true}).waitFor();
      const login=target.getByRole('link',{name:'Sign in',exact:true});assert.ok((await login.getAttribute('href')).includes('next='));await login.click();
      await target.getByLabel('Restaurant ID or manager email').fill('JM1234567890');await target.getByLabel('Password',{exact:true}).fill('fixture-password-123');await target.getByRole('button',{name:'Sign in',exact:true}).click();
      await target.getByRole('heading',{name:'Channel tests task',exact:true}).waitFor();await target.getByText('Branch: branch-a',{exact:true}).waitFor();
      assert.equal(new URL(target.url()).searchParams.get('opsTask'),'acceptance');assert.equal(new URL(target.url()).searchParams.has('branchId'),false);
      await target.goto(await handover.getAttribute('href'));await target.getByRole('heading',{name:'Branch handover task',exact:true}).waitFor();
      await target.goto(origin+'/qr/admin/?tab=OPERATIONS&branchId=foreign&opsTask=handover');await target.getByText(/The linked branch is unavailable/).waitFor();assert.equal(await target.getByTestId('destination').count(),0);
      await target.getByRole('button',{name:'Open my current workspace',exact:true}).click();await target.getByRole('heading',{name:'Branch handover task',exact:true}).waitFor();await target.getByText('Branch: branch-a',{exact:true}).waitFor();
      await page.goto(origin+fixture+'?combined=1');const combined=new URL(await page.getByRole('link',{name:'Open channel tests',exact:true}).getAttribute('href'));assert.equal(combined.origin,origin);assert.equal(combined.pathname,'/restaurant-admin/operations');
      assert.deepEqual(errors,[]);results.push({width,hostedLinks:true,qrOnlyConsole:true,combinedConsole:true,readableLayout:true,overflow:false,signInPreservesTask:true,linkedBranchSelected:true,foreignBranchRejected:true,bothTaskButtonsWork:true});await ctx.close();
    }
    console.log(JSON.stringify(results,null,2));
  }finally{fs.writeFileSync(path.join(__dirname,'browser-results.json'),JSON.stringify(results,null,2));await browser.close();await server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
