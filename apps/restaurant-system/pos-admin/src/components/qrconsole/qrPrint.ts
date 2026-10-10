import { generateQrSvg } from '@jamanvaar/utils';
import type { QrPrintData, QrPrintDesign } from '../../cloud/qrAdminClient';
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const QR_DESIGNS: Array<{id:QrPrintDesign['template'];name:string;color:string}> = [
 {id:'minimal',name:'Minimal white',color:'#0B253A'},{id:'premium',name:'Premium restaurant',color:'#0B253A'},
 {id:'colorful',name:'Modern colorful',color:'#7353A6'},{id:'cafe',name:'Cafe',color:'#6F4E37'},
 {id:'fine-dining',name:'Fine dining',color:'#243D32'},{id:'family',name:'Family restaurant',color:'#B35316'},
 {id:'casual',name:'Casual dining',color:'#1E6FA8'},{id:'takeaway',name:'Takeaway',color:'#0E4D3C'},
 {id:'table',name:'Table number card',color:'#9A3324'}];
export const DEFAULT_DESIGN:QrPrintDesign={template:'premium',accent:'#0B253A',instruction:'Scan to Order',footer:'Freshly prepared. Thoughtfully served.',showLogo:true,layout:'CARD'};
export function cardSvg(data:QrPrintData,size=320){
 if(!data.url)throw Error('Only active QR codes with a public address can be printed.');
 return generateQrSvg(data.url,{size,margin:4,color:'#000000',backgroundColor:'#FFFFFF'});
}
/** Preview, PNG, SVG and printing all use this renderer. Artwork stays outside the QR quiet zone. */
export function designSvg(data:QrPrintData,d:QrPrintDesign=data.design??DEFAULT_DESIGN){
 const color=/^#[0-9a-f]{6}$/i.test(d.accent)?d.accent:'#0B253A',dark=['premium','fine-dining'].includes(d.template),ink=dark?'#FFFFFF':'#0B253A';
 const qr=cardSvg(data,480).replace('<svg ','<svg x="80" y="250" ');
 const text=(s:string,y:number,size:number,fill=ink)=>'<text x="320" y="'+y+'" text-anchor="middle" font-family="Arial,sans-serif" font-size="'+Math.min(size,1060/Math.max(s.length,1))+'" font-weight="600" fill="'+fill+'">'+esc(s)+'</text>';
 const bands:Record<string,string>={
 minimal:'<path d="M40 42H600M40 818H600" stroke="'+color+'" stroke-width="3"/>',
 premium:'<rect width="640" height="860" fill="'+color+'"/><rect x="24" y="24" width="592" height="812" rx="16" fill="none" stroke="#D6B56D" stroke-width="3"/>',
 colorful:'<circle cx="0" cy="0" r="210" fill="'+color+'" opacity=".17"/><circle cx="640" cy="860" r="220" fill="'+color+'" opacity=".2"/>',
 cafe:'<rect width="640" height="200" fill="'+color+'" opacity=".13"/><path d="M60 808Q320 730 580 808" fill="none" stroke="'+color+'" stroke-width="6"/>',
 'fine-dining':'<rect width="640" height="860" fill="'+color+'"/><path d="M40 220V40H220M420 40H600V220M40 640V820H220M420 820H600V640" stroke="#D6B56D" stroke-width="2" fill="none"/>',
 family:'<path d="M0 0H640V70Q320 170 0 70Z" fill="'+color+'" opacity=".16"/><circle cx="44" cy="775" r="20" fill="'+color+'" opacity=".25"/><circle cx="596" cy="775" r="20" fill="'+color+'" opacity=".25"/>',
 casual:'<rect width="18" height="860" fill="'+color+'"/><rect x="622" width="18" height="860" fill="'+color+'"/>',
 takeaway:'<path d="M0 0H640V50H0ZM0 810H640V860H0Z" fill="'+color+'"/><path d="M570 115h30l-15-15m15 15-15 15" stroke="'+color+'" stroke-width="5" fill="none"/>',
 table:'<rect x="40" y="36" width="560" height="170" rx="18" fill="'+color+'"/>'};
 const logo=d.showLogo&&data.logoUrl&&/^data:image\/(png|jpeg|webp);base64,/i.test(data.logoUrl)?'<image href="'+esc(data.logoUrl)+'" x="265" y="50" width="110" height="60" preserveAspectRatio="xMidYMid meet"/>':'';
 return '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="860" viewBox="0 0 640 860"><rect width="640" height="860" rx="20" fill="#FFFFFF"/>'+bands[d.template]+logo+text(d.template==='table'?data.tableLabel:data.restaurantName,145,32,d.template==='table'?'#FFFFFF':ink)+text(d.template==='table'?data.restaurantName:data.branchName??'',190,20)+text(d.instruction,232,27)+qr+text(d.template==='table'?'Your table menu':data.tableLabel,772,32)+text(d.footer,810,18)+'</svg>';
}
export async function withLogo(data:QrPrintData):Promise<QrPrintData>{
 if(!data.logoUrl||data.logoUrl.startsWith('data:'))return data;
 const url=new URL(data.logoUrl,location.origin);if(url.protocol!=='https:'&&url.origin!==location.origin)return {...data,logoUrl:null};
 const r=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('Logo could not load. Retry or turn off the logo.');
 const blob=await r.blob();if(blob.size>2_000_000||!/^image\/(png|jpeg|webp)$/.test(blob.type))throw Error('Use a PNG, JPEG or WebP logo under 2 MB.');
 const logoUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('Logo could not be read'));reader.readAsDataURL(blob);});
 return {...data,logoUrl};
}
const download=(blob:Blob,name:string)=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name.replace(/[^A-Za-z0-9._-]/g,'-');a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
const css='@page{size:A4;margin:12mm}body{margin:0;font-family:Arial}section{break-after:page}section:last-child{break-after:auto}svg{display:block;width:110mm;height:auto;margin:auto}.label svg{width:70mm}.tent svg{width:85mm}.back{transform:rotate(180deg)}.fold{text-align:center;border-top:1px dashed #aaa;font-size:10px;margin:4mm 0}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}';
function documentHtml(cards:QrPrintData[],design?:QrPrintDesign){
 const body=cards.map(data=>{const d=design??data.design??DEFAULT_DESIGN,svg=designSvg(data,d);return '<section class="'+d.layout.toLowerCase()+'">'+(d.layout==='TENT'?'<div class="back">'+svg+'</div><div class="fold">Fold here</div>':'')+svg+'</section>';}).join('');
 return '<!doctype html><html><head><meta charset="utf-8"><title>Restaurant QR materials</title><style>'+css+'</style></head><body>'+body+'</body></html>';
}
export function printCards(cards:QrPrintData[],design?:QrPrintDesign){
 const w=window.open('','_blank','width=720,height=900');if(!w)throw Error('Allow pop-ups to print QR cards.');
 w.document.write(documentHtml(cards,design));w.document.close();w.focus();setTimeout(()=>w.print(),300);
}
export async function downloadCardPng(data:QrPrintData,name:string,design?:QrPrintDesign){
 const svg=designSvg(await withLogo(data),design),canvas=document.createElement('canvas');canvas.width=1920;canvas.height=2580;
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('Cannot draw this image in your browser.');
 const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
 try{const img=new Image();await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(Error('Could not render QR design'));img.src=url;});ctx.drawImage(img,0,0,1920,2580);
 const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Could not create PNG')),'image/png'));download(blob,name+'.png');}finally{URL.revokeObjectURL(url);}
}
export function downloadDesignSvg(data:QrPrintData,name:string,design?:QrPrintDesign){download(new Blob([designSvg(data,design)],{type:'image/svg+xml'}),name+'.svg');}
export function downloadDesignSet(cards:QrPrintData[],design:QrPrintDesign){download(new Blob([documentHtml(cards,design)],{type:'text/html'}),'restaurant-qr-design-set.html');}
