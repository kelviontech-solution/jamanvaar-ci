const fs = require('node:fs');
const path = require('node:path');
const results = [];
for (const app of ['cloud/super-admin-web', 'apps/restaurant-system/pos-admin', 'apps/restaurant-system/pos', 'apps/restaurant-system/captain', 'apps/restaurant-system/kds', 'apps/kiosk-system/kiosk-user', 'apps/qr-guest']) {
  const dist = `${app}/dist`;
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(item => item.isDirectory() ? walk(path.join(dir, item.name)) : [path.join(dir, item.name)]);
  const files = walk(dist);
  let privateKeyMarkers = 0, sourceMapDirectives = 0;
  for (const file of files.filter(x => /\.(js|html|json)$/.test(x))) {
    const content = fs.readFileSync(file, 'utf8');
    if (/-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/.test(content)) privateKeyMarkers++;
    if (/sourceMappingURL=.*\.map/.test(content)) sourceMapDirectives++;
  }
  results.push({ app, files: files.length, sourceMapFiles: files.filter(x => x.endsWith('.map')).length, sourceMapDirectives, privateKeyMarkers });
}
fs.writeFileSync(path.join(__dirname, 'evidence/DISTRIBUTION_SCAN.json'), JSON.stringify({ scannedAt: new Date().toISOString(), scope: 'Private-key markers and unintended source maps only; not a complete secret scan or reverse-engineering barrier.', results }, null, 2));
if (results.some(x => x.sourceMapFiles || x.sourceMapDirectives || x.privateKeyMarkers)) process.exitCode = 1;
console.log(JSON.stringify(results));
