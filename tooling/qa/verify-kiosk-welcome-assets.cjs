const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), sharp = require('sharp');
const root = path.resolve(__dirname, '../..');
const source = path.join(root, 'packages/assets/branding/kiosk-welcome-v1');
const report = path.join(root, 'docs/reports/kiosk-welcome-design-access-2026-10-07');
(async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'));
  const hashes = [], designs = []; let bytes = 0, copies = 0;
  for (const b of manifest.backgrounds) {
    const assets = [];
    for (const [file, expected, width, height] of [[b.file,b.sha256,1080,1920],[b.landscapeFile,b.landscapeSha256,1920,1080],[b.thumbnail,b.thumbnailSha256,270,480],[b.landscapeThumbnail,b.landscapeThumbnailSha256,400,225]]) {
      const data = fs.readFileSync(path.join(source,file)), hash = crypto.createHash('sha256').update(data).digest('hex'), metadata = await sharp(data).metadata();
      if (hash !== expected || metadata.width !== width || metadata.height !== height) throw Error(`Asset verification failed: ${file}`);
      if (data.length > 450 * 1024) throw Error(`Asset exceeds optimized size: ${file}`);
      hashes.push(hash); bytes += data.length;
      for (const app of ['apps/kiosk-system/kiosk-user','apps/restaurant-system/pos-admin','cloud/super-admin-web']) {
        if (!fs.readFileSync(path.join(root,app,'dist/assets/branding/kiosk-welcome-v1',file)).equals(data)) throw Error(`Different compiled copy: ${app}/${file}`);
        copies++;
      }
      assets.push({file,width,height,bytes:data.length,sha256:hash});
    }
    designs.push({id:b.id,name:b.name,assets});
  }
  if (new Set(hashes).size !== hashes.length) throw Error('Repeated background asset bytes');
  const previous = JSON.parse(fs.readFileSync(path.join(root,'docs/reports/kiosk-welcome-2026-10-07/ASSET_VERIFICATION.json'),'utf8'));
  const originalBytes = manifest.backgrounds.slice(0,10).reduce((sum,b) => sum + [b.file,b.landscapeFile,b.thumbnail,b.landscapeThumbnail].reduce((total,f) => total + fs.statSync(path.join(source,f)).size,0),0);
  if (originalBytes !== previous.bytes) throw Error('Original collection size changed');
  const state = JSON.parse(fs.readFileSync(path.join(root,'.jamanvaar/browser-audit/private-state.json'),'utf8'));
  let inspected = 0;
  const inspect = directory => { for (const entry of fs.readdirSync(directory,{withFileTypes:true})) {
    const file = path.join(directory,entry.name); if (entry.isDirectory()) { inspect(file); continue; }
    if (!/\.(json|md|jsonl)$/.test(file)) continue;
    const text = fs.readFileSync(file,'utf8');
    if ([state.ownerPassword,state.platformPassword,state.jwtSecret,state.encryptionKey].some(s=>s&&text.includes(s)) || /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(text)) throw Error(`Private value in report: ${file}`);
    inspected++;
  } };
  inspect(report);
  const result = {backgroundDesigns:designs.length,optimizedAssets:hashes.length,uniqueAssetHashes:new Set(hashes).size,bytes,checkedCompiledCopies:copies,reportTextFilesCheckedForPrivateValues:inspected,designs};
  fs.writeFileSync(path.join(report,'ASSET_VERIFICATION.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({...result,designs:undefined}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
