import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const library=path.join(root,'packages/assets/branding/app-icons-v1');
const manifest=JSON.parse(fs.readFileSync(path.join(library,'manifest.json'),'utf8'));
const require=createRequire(import.meta.url);
const cli=require.resolve('@tauri-apps/cli/tauri.js',{paths:[root,path.join(root,'apps/restaurant-system/captain')]});
const write=(file,bytes)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);};
const png=async(input,size)=>sharp(input).resize(size,size,{kernel:'lanczos3'}).png({compressionLevel:9}).toBuffer();
const mask=async(size,round=false)=>sharp(Buffer.from(round
  ?`<svg width="${size}" height="${size}"><circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="white"/></svg>`
  :`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size*.22}" fill="white"/></svg>`)).png().toBuffer();
const clipped=async(input,size,round=false)=>sharp(await png(input,size)).ensureAlpha().composite([{input:await mask(size,round),blend:'dest-in'}]).png().toBuffer();

// Icon sizing/masking is deterministic platform packaging. The creative
// hospitality mark and all color variants are built-in image_gen outputs.
async function adaptiveForeground(){
  const {data,info}=await sharp(path.join(library,'source/adaptive-foreground.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let left=info.width,top=info.height,right=0,bottom=0;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>=16){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
  if(left>=right||top>=bottom)throw Error('Adaptive foreground has no visible artwork');
  const cx=(left+right)/2,cy=(top+bottom)/2;let radius=0;
  for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++)if(data[(y*info.width+x)*4+3]>=16)radius=Math.max(radius,Math.hypot(x-cx,y-cy));
  // Android's guaranteed safe zone is a 66dp circle on a 108dp layer.
  // Fit within a slightly smaller 60dp circle, preserving aspect ratio.
  const scale=(1024*30/108)/radius,w=Math.round((right-left+1)*scale),h=Math.round((bottom-top+1)*scale);
  const symbol=await sharp(data,{raw:info}).extract({left,top,width:right-left+1,height:bottom-top+1}).resize(w,h).png().toBuffer();
  const foreground=await sharp({create:{width:1024,height:1024,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:symbol,left:Math.floor((1024-w)/2),top:Math.floor((1024-h)/2)}]).png().toBuffer();
  write(path.join(library,'adaptive-foreground.png'),foreground);
  const raw=await sharp(foreground).raw().toBuffer();
  for(let i=0;i<raw.length;i+=4)raw[i]=raw[i+1]=raw[i+2]=255;
  write(path.join(library,'adaptive-monochrome.png'),await sharp(raw,{raw:{width:1024,height:1024,channels:4}}).png().toBuffer());
  return foreground;
}
function ico(frames){
  const header=Buffer.alloc(6+16*frames.length);header.writeUInt16LE(1,2);header.writeUInt16LE(frames.length,4);let offset=header.length;
  frames.forEach(({size,bytes},i)=>{const at=6+i*16;header[at]=header[at+1]=size===256?0:size;header.writeUInt16LE(1,at+4);header.writeUInt16LE(32,at+6);header.writeUInt32LE(bytes.length,at+8);header.writeUInt32LE(offset,at+12);offset+=bytes.length;});
  return Buffer.concat([header,...frames.map(f=>f.bytes)]);
}
const foreground=await adaptiveForeground();
for(const app of manifest.apps){
  const dir=path.join(library,app.id),target=path.join(root,app.directory,'src-tauri/icons');
  const opaque=await sharp(path.join(library,'source',app.id+'.png')).resize(1024,1024).removeAlpha().png({compressionLevel:9}).toBuffer();
  const windows=await clipped(opaque,1024);
  write(path.join(dir,'master-opaque.png'),opaque);write(path.join(dir,'master-windows.png'),windows);
  write(path.join(dir,'background.png'),await sharp({create:{width:1024,height:1024,channels:3,background:app.accent}}).png().toBuffer());
  const spec={default:'master-windows.png',bg_color:app.accent,android_bg:'background.png',android_fg:'../adaptive-foreground.png',android_fg_scale:100,android_monochrome:'../adaptive-monochrome.png'};
  write(path.join(dir,'tauri-icon.json'),JSON.stringify(spec,null,2)+'\n');
  const run=spawnSync(process.execPath,[cli,'icon',path.join(dir,'tauri-icon.json'),'--output',target],{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});
  if(run.status!==0)throw Error(`${app.id}: Tauri icon conversion failed: ${run.stderr||run.stdout}`);
  const frames=[];
  for(const size of [16,24,32,48,64,128,256,512]){
    const bytes=await png(windows,size);write(path.join(target,`${size}x${size}.png`),bytes);
    if(size<=256)frames.push({size,bytes});
  }
  write(path.join(target,'icon.ico'),ico(frames));write(path.join(dir,'icon.ico'),ico(frames));
  for(const size of [256,512])write(path.join(target,`icon_${size}x${size}.png`),await png(windows,size));
  write(path.join(target,'icon.png'),windows);
  // App Store/legacy launchers need opaque sources; keep pre-rounded Windows
  // artwork separate from the launcher layers so a second mask cannot crop it.
  for(const file of fs.readdirSync(path.join(target,'ios'))){if(!file.endsWith('.png'))continue;const m=await sharp(path.join(target,'ios',file)).metadata();write(path.join(target,'ios',file),await png(opaque,m.width));}
  for(const [density,legacy,layer] of [['mdpi',48,108],['hdpi',72,162],['xhdpi',96,216],['xxhdpi',144,324],['xxxhdpi',192,432]]){
    const resources=path.join(target,'android',`mipmap-${density}`);
    write(path.join(resources,'ic_launcher.png'),await png(opaque,legacy));
    write(path.join(resources,'ic_launcher_round.png'),await clipped(opaque,legacy,true));
    // Write the normalized layer directly; do not let a converter add another
    // foreground scale or crop the sleeve/steam for an adaptive mask.
    write(path.join(resources,'ic_launcher_foreground.png'),await png(foreground,layer));
    write(path.join(resources,'ic_launcher_monochrome.png'),await png(path.join(library,'adaptive-monochrome.png'),layer));
  }
  write(path.join(target,'android/values/ic_launcher_background.xml'),`<?xml version="1.0" encoding="utf-8"?>\n<resources><color name="ic_launcher_background">${app.accent}</color></resources>\n`);
  for(const qualifier of ['mipmap-anydpi-v26','mipmap-anydpi-v33'])for(const name of ['ic_launcher','ic_launcher_round'])write(path.join(target,'android',qualifier,name+'.xml'),`<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n  <background android:drawable="@color/ic_launcher_background"/>\n  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n${qualifier.endsWith('33')?'  <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>\n':''}</adaptive-icon>\n`);
  // A built Android project, if present, consumes res/ rather than icons/android.
  const androidRes=path.join(root,app.directory,'src-tauri/gen/android/app/src/main/res');
  if(fs.existsSync(androidRes))fs.cpSync(path.join(target,'android'),androidRes,{recursive:true});
  console.log(`Prepared ${app.label}: Windows ICO/ICNS/PNG, Android adaptive/legacy/themed and opaque iOS icons.`);
}
await import('./sync_product_icons.mjs');
