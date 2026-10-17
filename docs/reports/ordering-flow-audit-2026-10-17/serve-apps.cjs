const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'../../..');
for(const [app,port,rel] of [['pos',5315,'apps/restaurant-system/pos'],['kiosk',5314,'apps/kiosk-system/kiosk-user'],['qr',5390,'apps/qr-guest']]){
 const build=path.join(root,'.jamanvaar/full-app-audit-2026-10-13/build',app),pub=path.join(root,rel,'public');
 http.createServer((req,res)=>{let pathname=new URL(req.url,'http://localhost').pathname;pathname=pathname.replace(/^\/(?:pos|kiosk|q|qr)(?=\/assets\/)/,'');let file=path.resolve(build,'.'+pathname);if(!file.startsWith(build+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){file=path.resolve(pub,'.'+pathname);if(!file.startsWith(pub+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())file=path.join(build,'index.html');}res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);}).listen(port,'localhost',()=>console.log('READY',app,port));
}
