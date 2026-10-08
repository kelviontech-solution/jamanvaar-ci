import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const library=path.join(root,'packages/assets/branding/app-icons-v1');
const manifest=JSON.parse(fs.readFileSync(path.join(library,'manifest.json'),'utf8'));
const results=[],composites=[];
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;');
const textImage=(text,width=300,height=32)=>Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><text x="12" y="22" font-family="Arial,sans-serif" font-size="16" font-weight="bold" fill="#0B253A">${escape(text)}</text></svg>`);
const sheet=sharp({create:{width:1500,height:580,channels:4,background:'#F6F3ED'}});
for(const [col,app] of manifest.apps.entries()){
  const dir=path.join(library,app.id),native=path.join(root,app.directory,'src-tauri/icons');
  for(const name of ['master-windows.png','master-opaque.png']){
    const image=sharp(path.join(dir,name)),m=await image.metadata(),stats=await image.stats();
    assert.equal(m.width,1024);assert.equal(m.height,1024);assert.equal(stats.isOpaque,name==='master-opaque.png',`${app.id} ${name} transparency`);
  }
  const {data:rgba}=await sharp(path.join(dir,'master-windows.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(rgba[3],0,'Windows corner must be transparent');assert.equal(rgba[(512*1024+512)*4+3],255,'Windows tile center must be opaque');
  const ico=fs.readFileSync(path.join(native,'icon.ico')),sizes=[];
  assert.equal(ico.readUInt16LE(2),1);assert.equal(ico.readUInt16LE(4),7);
  for(let n=0;n<7;n++){const at=6+16*n,size=ico[at]||256,len=ico.readUInt32LE(at+8),offset=ico.readUInt32LE(at+12),m=await sharp(ico.subarray(offset,offset+len)).metadata();assert.equal(m.width,size);assert.equal(m.height,size);sizes.push(size);}
  assert.deepEqual(sizes,[16,24,32,48,64,128,256]);
  assert.equal(fs.readFileSync(path.join(native,'icon.icns')).subarray(0,4).toString(),'icns');
  const config=JSON.parse(fs.readFileSync(path.join(root,app.directory,'src-tauri/tauri.conf.json'),'utf8'));
  for(const file of config.bundle.icon)assert.ok(fs.existsSync(path.join(root,app.directory,'src-tauri',file)),`Missing configured bundle icon ${file}`);
  if(config.bundle.windows?.nsis?.installerIcon)assert.ok(fs.existsSync(path.join(root,app.directory,'src-tauri',config.bundle.windows.nsis.installerIcon)));
  for(const [density,legacy,layer] of [['mdpi',48,108],['hdpi',72,162],['xhdpi',96,216],['xxhdpi',144,324],['xxxhdpi',192,432]]){
    const resources=path.join(native,'android',`mipmap-${density}`);
    assert.equal((await sharp(path.join(resources,'ic_launcher.png')).metadata()).width,legacy);assert.equal((await sharp(path.join(resources,'ic_launcher.png')).stats()).isOpaque,true);
    const {data,info}=await sharp(path.join(resources,'ic_launcher_foreground.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(info.width,layer);let maxRadius=0;
    for(let y=0;y<layer;y++)for(let x=0;x<layer;x++)if(data[(y*layer+x)*4+3]>=32)maxRadius=Math.max(maxRadius,Math.hypot(x-(layer-1)/2,y-(layer-1)/2));
    assert.ok(maxRadius<=layer*33/108,`${app.id}/${density} exceeds Android safe circle: ${maxRadius}`);
    assert.equal((await sharp(path.join(resources,'ic_launcher_monochrome.png')).metadata()).width,layer);
  }
  assert.ok(fs.readFileSync(path.join(native,'android/values/ic_launcher_background.xml'),'utf8').includes(app.accent));
  assert.ok(fs.readFileSync(path.join(native,'android/mipmap-anydpi-v33/ic_launcher.xml'),'utf8').includes('<monochrome'));
  for(const file of fs.readdirSync(path.join(native,'ios')).filter(f=>f.endsWith('.png')))assert.equal((await sharp(path.join(native,'ios',file)).stats()).isOpaque,true,`${app.id}/${file} iOS alpha`);
  const publicDir=path.join(root,app.directory,'public');
  const web=JSON.parse(fs.readFileSync(path.join(publicDir,'manifest.webmanifest'),'utf8'));assert.equal(web.theme_color,app.accent);assert.equal(web.start_url,'./');
  for(const icon of web.icons){assert.ok(icon.src.startsWith('./'));const file=path.join(publicDir,icon.src.split('?')[0]);assert.ok(fs.existsSync(file));const m=await sharp(file).metadata();assert.equal(icon.sizes,`${m.width}x${m.height}`);if(icon.purpose==='maskable')assert.equal((await sharp(file).stats()).isOpaque,true);}
  const html=fs.readFileSync(path.join(root,app.directory,'index.html'),'utf8');assert.ok(html.includes('href="./favicon.ico?'));assert.ok(html.includes('href="./manifest.webmanifest?'));
  const x=col*300;
  composites.push({input:textImage(app.label),left:x,top:10},{input:await sharp(path.join(dir,'master-windows.png')).resize(220).png().toBuffer(),left:x+40,top:55});
  composites.push({input:textImage('Windows: 16 / 24 / 32 / 48'),left:x,top:290});
  let dx=12;for(const size of [16,24,32,48]){composites.push({input:await sharp(path.join(native,`${size}x${size}.png`)).png().toBuffer(),left:x+dx,top:332});dx+=size+20;}
  composites.push({input:textImage('Android adaptive / themed'),left:x,top:390});
  // A launcher clips the central 72dp viewport of the 108dp layers.
  const android=await sharp(path.join(library,'adaptive-foreground.png')).flatten({background:app.accent}).extract({left:170,top:170,width:684,height:684}).resize(120).png().toBuffer();
  composites.push({input:await sharp(android).composite([{input:Buffer.from('<svg width="120" height="120"><circle cx="60" cy="60" r="60" fill="white"/></svg>'),blend:'dest-in'}]).png().toBuffer(),left:x+18,top:433});
  const mono=await sharp(path.join(library,'adaptive-monochrome.png')).flatten({background:'#49444D'}).extract({left:170,top:170,width:684,height:684}).resize(120).png().toBuffer();
  composites.push({input:await sharp(mono).composite([{input:Buffer.from('<svg width="120" height="120"><rect width="120" height="120" rx="27" fill="white"/></svg>'),blend:'dest-in'}]).png().toBuffer(),left:x+158,top:433});
  results.push({app:app.id,status:'PASS',masterSize:1024,icoSizes:sizes,androidDensities:5,adaptiveSafeZone:'66dp circle within 108dp',iosOpaque:true,bundlePathsExist:true,pwaRelativePaths:true});
  console.log('PASS '+app.label+': Windows, Android, iOS and PWA icon assets');
}
await sheet.composite(composites).png().toFile(path.join(library,'preview.png'));
fs.writeFileSync(path.join(library,'VERIFICATION.json'),JSON.stringify({results,artworkGeneration:'built-in image_gen',installedBinaryChecked:false,androidDeviceChecked:false},null,2)+'\n');
const cards=manifest.apps.map(a=>`<article><h2>${a.label}</h2><img class="large" src="./${a.id}/master-windows.png" alt="${a.label} icon"/><p>${a.accent}</p><div>${[16,24,32,48,64].map(size=>`<img width="${size}" height="${size}" src="./${a.id}/master-windows.png" title="${size}px"/>`).join(' ')}</div><p><a href="./${a.id}/master-windows.png">Transparent Windows PNG</a> · <a href="./${a.id}/master-opaque.png">Opaque PNG</a> · <a href="./${a.id}/icon.ico">ICO</a></p></article>`).join('');
fs.writeFileSync(path.join(library,'preview.html'),`<!doctype html><html lang="en"><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>JAMANVAAR product icons</title><style>body{font:16px system-ui;background:#f6f3ed;color:#0b253a;margin:32px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:20px}article{background:white;border-radius:24px;padding:24px}img.large{width:100%;max-width:260px}a{color:#0b253a}article div{display:flex;align-items:center;gap:12px}article p{font-size:13px}</style><h1>JAMANVAAR · Five product icons</h1><p>Hand, cloche and steam. Inspect 16–64px at the actual size. Android foreground fits the guaranteed safe circle.</p><main>${cards}</main></html>`);
