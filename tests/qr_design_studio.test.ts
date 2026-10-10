import { it, expect } from 'vitest';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { QR_DESIGNS, DEFAULT_DESIGN, designSvg } from '../apps/restaurant-system/pos-admin/src/components/qrconsole/qrPrint';
const data={restaurantName:'A restaurant & its kitchen',branchName:'Main branch',tableLabel:'Table TN1',url:'https://example.invalid/q/secure-table-token-123',tagline:'Scan, order, enjoy'};
it('all nine print designs are distinct and decode to the exact table URL after rasterizing',async()=>{
 const svgs=new Set<string>();
 for(const d of QR_DESIGNS){
  const svg=designSvg(data,{...DEFAULT_DESIGN,template:d.id,accent:d.color});svgs.add(svg);
  const {data:bytes,info}=await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const decoded=jsQR(new Uint8ClampedArray(bytes),info.width,info.height);expect(decoded?.data,d.name).toBe(data.url);
 }
 expect(svgs.size).toBe(9);
},30000);
it('escapes restaurant instructions and ignores unsafe accents or image URLs in exported SVG',()=>{
 const svg=designSvg({...data,restaurantName:'<script>alert(1)</script>',logoUrl:'javascript:alert(1)'},{...DEFAULT_DESIGN,accent:'url(javascript:alert(1))',instruction:'<img src=x onerror=alert(1)>'});
 expect(svg).not.toContain('<script>');expect(svg).not.toContain('<img');expect(svg).not.toContain('javascript:');expect(svg).toContain('&lt;script&gt;');
});
