import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { createHash } from 'node:crypto';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const library=path.join(root,'packages/assets/branding/app-icons-v1');
const manifest=JSON.parse(fs.readFileSync(path.join(library,'manifest.json'),'utf8'));
const write=(file,bytes)=>{const value=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);if(fs.existsSync(file)&&fs.readFileSync(file).equals(value))return;fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,value);};
const resize=(source,size)=>sharp(source).resize(size,size).png({compressionLevel:9}).toBuffer();
for(const app of manifest.apps){
  const dir=path.join(library,app.id),publicDir=path.join(root,app.directory,'public');
  const windows=path.join(dir,'master-windows.png'),opaque=path.join(dir,'master-opaque.png');
  if(!fs.existsSync(windows)||!fs.existsSync(opaque))throw Error(`Missing ${app.id} icon masters. Run node tooling/packaging/build_product_icons.mjs once.`);
  const version=createHash('sha256').update(fs.readFileSync(windows)).digest('hex').slice(0,12);
  for(const name of ['favicon.ico','icon.ico'])write(path.join(publicDir,name),fs.readFileSync(path.join(dir,'icon.ico')));
  write(path.join(publicDir,'icon.png'),await resize(windows,512));
  write(path.join(publicDir,'app-icon.png'),await resize(opaque,512));
  for(const size of [16,32,192,512])write(path.join(publicDir,'icons',`icon-${size}.png`),await resize(windows,size));
  write(path.join(publicDir,'icons/icon-maskable-512.png'),await resize(opaque,512));
  write(path.join(publicDir,'icons/apple-touch-icon.png'),await resize(opaque,180));
  const raster=(await resize(windows,512)).toString('base64');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><image width="512" height="512" href="data:image/png;base64,${raster}"/></svg>\n`;
  for(const file of ['favicon.svg','jamanvaar-app-icon.svg'])write(path.join(publicDir,file),svg);
  // Existing desktop tooling can read app-icon.png from the app root.
  if(fs.existsSync(path.join(root,app.directory,'app-icon.png')))write(path.join(root,app.directory,'app-icon.png'),await resize(opaque,512));
  const icons=[{src:`./icons/icon-192.png?v=${version}`,sizes:'192x192',type:'image/png',purpose:'any'},{src:`./icons/icon-512.png?v=${version}`,sizes:'512x512',type:'image/png',purpose:'any'},{src:`./icons/icon-maskable-512.png?v=${version}`,sizes:'512x512',type:'image/png',purpose:'maskable'}];
  for(const file of ['manifest.json','manifest.webmanifest']){
    const target=path.join(publicDir,file);if(!fs.existsSync(target))continue;
    const data=JSON.parse(fs.readFileSync(target,'utf8'));
    Object.assign(data,{name:`JAMANVAAR ${app.label}`,short_name:app.label,id:'./',start_url:'./',scope:'./',theme_color:app.accent,icons});
    write(target,JSON.stringify(data,null,2)+'\n');
  }
  const index=path.join(root,app.directory,'index.html');let html=fs.readFileSync(index,'utf8');
  html=html.replace(/<link\b[^>]*rel="manifest"[^>]*>/g,`<link rel="manifest" href="./manifest.webmanifest?v=${version}" />`)
    .replace(/<link\b[^>]*rel="icon"[^>]*>/g,`<link rel="icon" type="image/x-icon" href="./favicon.ico?v=${version}" />`)
    .replace(/<link\b[^>]*rel="apple-touch-icon"[^>]*>/g,`<link rel="apple-touch-icon" href="./icons/apple-touch-icon.png?v=${version}" />`)
    .replace(/<meta\b[^>]*name="theme-color"[^>]*>/g,`<meta name="theme-color" content="${app.accent}" />`);
  write(index,html);
}
console.log('Synchronized five product-specific icons and relative PWA asset paths.');
