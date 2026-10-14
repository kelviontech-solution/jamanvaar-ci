const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,expect}=require('playwright/test');
const root=path.resolve(__dirname,'../../..');
const out=path.join(root,'.jamanvaar/full-app-audit-2026-10-13/build/super-prefix');
const routes=[...fs.readFileSync(path.join(root,'cloud/super-admin-web/src/app/App.tsx'),'utf8').matchAll(/<Route path="([^"]+)"/g)].map(m=>m[1]).filter(route=>route.startsWith('/')&&route!=='/login'&&route!=='/activate').map(route=>route.replace(':id','example'));
async function main(){
  process.env.VITE_ROUTER_BASENAME='/admin';
  process.chdir(path.join(root,'cloud/super-admin-web'));
  const {build}=await import('vite');
  await build({root:path.join(root,'cloud/super-admin-web'),configFile:path.join(root,'cloud/super-admin-web/vite.config.ts'),logLevel:'error',build:{outDir:out,emptyOutDir:true,copyPublicDir:false}});
  const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname.replace(/^\/admin(?=\/|$)/,'');let file=path.resolve(out,'.'+pathname);if(!file.startsWith(out+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())file=path.join(out,'index.html');res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');fs.createReadStream(file).pipe(res);});
  await new Promise(resolve=>server.listen(5590,'localhost',resolve));
  const browser=await chromium.launch({channel:'chrome',headless:true});const results=[];
  try{for(const [base,prefix] of [['http://localhost:5380',''],['http://localhost:5590','/admin']]){
    const ctx=await browser.newContext({serviceWorkers:'block'}),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
    for(const route of routes){console.log('CHECK',prefix||'/',route);for(const action of ['direct','refresh']){
      if(action==='direct')await p.goto(base+prefix+route,{waitUntil:'domcontentloaded'});else await p.reload({waitUntil:'domcontentloaded'});
      await expect(p.getByLabel('Super Admin Email',{exact:false})).toBeVisible({timeout:15000});
      expect(errors).toEqual([]);results.push({prefix:prefix||'/',route,action,result:'PASS'});
    }}await ctx.close();
  }fs.writeFileSync(path.join(__dirname,'evidence/fix-super-deep-links.json'),JSON.stringify(results,null,2));console.log('PASS',results.length,'nested route loads/refreshes under root and /admin');}
  finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
