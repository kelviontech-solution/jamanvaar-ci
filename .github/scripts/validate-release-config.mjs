const required = ['VITE_CLOUD_API_BASE_URL', 'VITE_QR_ORDER_URL'];
const platform = process.argv[2];
if (platform === 'windows') required.push('TAURI_SIGNING_PRIVATE_KEY', 'WINDOWS_SIGNING_PFX_BASE64', 'WINDOWS_SIGNING_PASSWORD', 'WINDOWS_SIGNING_CERT_SHA256', 'WINDOWS_TIMESTAMP_URL');
if (platform === 'android') required.push('ANDROID_KEYSTORE_BASE64', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_SIGNING_CERT_SHA256');
for (const name of required) if (!process.env[name]?.trim()) throw Error(`Missing release configuration: ${name}`);
if (platform === 'windows') {
  const key = process.env.TAURI_SIGNING_PRIVATE_KEY;
  if (!isAbsolute(key) || !existsSync(key)) throw Error('Updater key must be an existing absolute path on the external signing machine');
  const rel = relative(resolve(process.env.GITHUB_WORKSPACE ?? '.'), resolve(key));
  if (!rel.startsWith('..') && !isAbsolute(rel)) throw Error('Updater private key must be outside the checkout');
}
for (const name of ['VITE_CLOUD_API_BASE_URL', 'VITE_QR_ORDER_URL']) {
  const url = new URL(process.env[name]);
  if (url.protocol !== 'https:' || url.username || url.password || /^(localhost|127\.|\[::1\])/.test(url.hostname)) throw Error(`${name} must be a public HTTPS origin`);
}
import { existsSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
