const path = require('node:path'), fs = require('node:fs');
const root = path.resolve(__dirname, '../../..');
async function main() {
  const { build, loadConfigFromFile } = await import('vite');
  const react = (await import('@vitejs/plugin-react')).default;
  const loaded = await loadConfigFromFile({ command:'serve', mode:'development' }, path.join(root,'apps/restaurant-system/pos-admin/vite.config.ts')); 
  const { chromium } = require('playwright');
  const loadConfig = require('tailwindcss/loadConfig');
  const theme = loadConfig(path.join(root,'apps/restaurant-system/pos-admin/tailwind.config.js'));
  theme.content = [path.join(root, 'apps/restaurant-system/pos-admin/src/components/menu/MenuSyncReview.tsx')];
  const outDir=path.join(root,'.jamanvaar/catalog-browser-build');
  if (!process.env.CATALOG_REUSE_BUILD) await build({root,configFile:false,plugins:[react()],resolve:loaded.config.resolve,define:loaded.config.define,css:{postcss:{plugins:[require('tailwindcss')(theme),require('autoprefixer')()]}},build:{outDir,emptyOutDir:true,rollupOptions:{input:path.join(__dirname,'catalog-review-browser.html')}}});
  const http=require('node:http');
  const server=http.createServer((req,res)=>{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=path.resolve(outDir,'.'+pathname);if(!file.startsWith(outDir+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(data);});});
  await new Promise(resolve=>server.listen(5530,'127.0.0.1',resolve)); const browser=await chromium.launch({channel:'chrome',headless:true}); const observations=[];
  try {
    for (const width of [390,1366]) for (const choice of ['published','local']) {
      const page=await browser.newPage({viewport:{width,height:844}}), errors=[];page.on('pageerror',e=>errors.push(e.message));
      page.setDefaultTimeout(15000);
      await page.goto('http://127.0.0.1:5530/docs/reports/ecosystem-audit-2026-10-17/catalog-review-browser.html');
      await page.getByRole('heading',{name:'1 menu change needs review'}).waitFor();
      await page.locator('summary').click();
      await page.getByText(/90\.00/).waitFor(); await page.getByText(/80\.00/).waitFor();
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);
      await page.screenshot({path:path.join(root,'.jamanvaar/catalog-review-'+width+'-'+choice+'.png'),fullPage:true});
      await page.getByRole('button',{name:choice==='published'?'Use published version':'Keep my edit and sync',exact:true}).click();
      await page.waitForFunction(expected=>window.__reviewState().price===expected&&window.__reviewState().conflicts===0, choice==='published'?80:90, {timeout:15000});
      observations.push({width,horizontalOverflow:overflow,pageErrors:errors.length,choice,price:choice==='published'?80:90}); await page.close();
    }
    if(observations.some(row=>row.horizontalOverflow||row.pageErrors))throw Error('Browser layout/runtime acceptance failed');
    fs.writeFileSync(path.join(root,'.jamanvaar/catalog-review-browser.json'),JSON.stringify({scope:'Actual review component with fixture transport, not authenticated all-page acceptance',observations},null,2));
    console.log('Catalog review browser checks:',observations);
  } finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
