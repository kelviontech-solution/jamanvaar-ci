import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const app = resolve(process.argv[2] ?? '');
const config = JSON.parse(readFileSync(resolve(app, 'src-tauri/tauri.conf.json'), 'utf8'));
const sha256 = file => createHash('sha256').update(readFileSync(file)).digest('hex');
for (const sidecar of config.bundle?.externalBin ?? []) {
  if (sidecar !== 'binaries/JamanvaarLocalCore') throw Error('Unreviewed external binary in release configuration');
  const binary = resolve(app, 'src-tauri', `${sidecar}-x86_64-pc-windows-msvc.exe`);
  const provenance = `${binary}.provenance.json`;
  if (!existsSync(binary) || !existsSync(provenance)) throw Error('Local Core needs a fresh, reviewed source build and .provenance.json before packaging; historical binaries are not release evidence');
  const record = JSON.parse(readFileSync(provenance, 'utf8'));
  if (record.sourceSha256 !== sha256('tooling/local-runtime/local_service.cjs') || record.binarySha256 !== sha256(binary) || record.target !== 'x86_64-pc-windows-msvc' || record.unauthenticatedOrdersStatus !== 401) throw Error('Local Core provenance does not match current source, target, artifact, or authenticated endpoint smoke test');
  console.log('Local Core provenance matches. Installer signing and upgrade/data checks remain mandatory.');
}
