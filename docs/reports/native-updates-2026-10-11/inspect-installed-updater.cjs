const fs = require('node:fs');
const path = require('node:path');
const records = JSON.parse(fs.readFileSync(path.join(__dirname, 'evidence/INSTALLED_WINDOWS_BINARIES.json'), 'utf8').replace(/^\uFEFF/, ''));
const expected = JSON.parse(fs.readFileSync('apps/restaurant-system/kds/src-tauri/tauri.conf.json', 'utf8')).plugins.updater.pubkey;
const results = records.map(record => {
  const bytes = fs.readFileSync(record.file);
  const currentPublicKeyFound = bytes.includes(Buffer.from(expected));
  // Only scan the documented public minisign prefix; never scan app storage/credentials.
  const candidates = bytes.toString('latin1').match(/dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6[A-Za-z0-9+/=]{40,300}/g) ?? [];
  const publicKeyIds = [...new Set(candidates.flatMap(value => {
    const decoded = Buffer.from(value, 'base64').toString('utf8');
    const match = /minisign public key: ([A-F0-9]{16})/.exec(decoded);
    return match ? [match[1]] : [];
  }))];
  return { file: record.file, registeredName: record.registeredName, registeredVersion: record.registeredVersion, productName: record.productName, currentPublicKeyFound, observedPublicKeyIds: publicKeyIds, scope: 'Read-only scan for public key identifiers; no executable run and no user database/credential read.' };
});
fs.writeFileSync(path.join(__dirname, 'evidence/INSTALLED_UPDATER_COMPATIBILITY.json'), JSON.stringify({ expectedPublicKeyId: '9C7A14F226BFB760', results }, null, 2));
console.log(JSON.stringify(results.map(({ registeredName, registeredVersion, currentPublicKeyFound, observedPublicKeyIds }) => ({ registeredName, registeredVersion, currentPublicKeyFound, observedPublicKeyIds }))));
