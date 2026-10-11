import { createHash, createPublicKey, verify } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { get } from 'node:https';
import { isIP } from 'node:net';
import { BadRequestException } from '@nestjs/common';
import type { PublishReleaseDto } from './dto/application.dto';

// Public key only. Must continue matching the public key embedded in distributed apps.
export const UPDATER_PUBLIC_KEY = 'dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDlDN0ExNEYyMjZCRkI3NjAKUldSZ3Q3OG04aFI2bk1pd3l1QjNLQjdSdmlqK3RZQXVic0tFNUdKNzJYMEo4ZU9Oc3dUVE5hbFIK';

/** Same Ed25519/Blake2b minisign format used by Tauri. No private key needed. */
export function verifyUpdaterArtifact(bytes: Buffer, encodedSignature: string, encodedKey = UPDATER_PUBLIC_KEY): boolean {
  try {
    const keyLines = Buffer.from(encodedKey, 'base64').toString('utf8').trim().split(/\r?\n/);
    const key = Buffer.from(keyLines.at(-1)!, 'base64');
    const lines = Buffer.from(encodedSignature.trim(), 'base64').toString('utf8').trim().split(/\r?\n/);
    const sig = Buffer.from(lines[1] ?? '', 'base64');
    const globalSig = Buffer.from(lines[3] ?? '', 'base64');
    if (key.length !== 42 || sig.length !== 74 || globalSig.length !== 64 || !lines[2]?.startsWith('trusted comment: ') || !key.subarray(2, 10).equals(sig.subarray(2, 10))) return false;
    const algorithm = sig.subarray(0, 2).toString('ascii');
    if (algorithm !== 'ED' && algorithm !== 'Ed') return false;
    const publicKey = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), key.subarray(10)]), format: 'der', type: 'spki' });
    const message = algorithm === 'ED' ? createHash('blake2b512').update(bytes).digest() : bytes;
    return verify(null, message, publicKey, sig.subarray(10)) && verify(null, Buffer.concat([sig.subarray(10), Buffer.from(lines[2].slice(17))]), publicKey, globalSig);
  } catch { return false; }
}

/** Allowlisted HTTPS with pinned IPv4 lookup; no internal addresses or implicit redirects. */
export async function downloadReleaseArtifact(source: string, redirects = 0): Promise<Buffer> {
  const url = new URL(source);
  const hosts = (process.env.RELEASE_ARTIFACT_HOSTS ?? '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !hosts.includes(url.hostname.toLowerCase()) || isIP(url.hostname)) throw new BadRequestException('Artifact host must be explicitly configured in RELEASE_ARTIFACT_HOSTS');
  const addresses = await lookup(url.hostname, { all: true, family: 4 });
  const publicAddress = (ip: string) => { const [a, b] = ip.split('.').map(Number); return a > 0 && a < 224 && a !== 10 && a !== 127 && !(a === 169 && b === 254) && !(a === 172 && b >= 16 && b <= 31) && !(a === 192 && b === 168) && !(a === 100 && b >= 64 && b <= 127) && !(a === 198 && (b === 18 || b === 19)); };
  if (!addresses.length || addresses.some(x => !publicAddress(x.address))) throw new BadRequestException('Artifact host resolves to a prohibited address');
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => request.destroy(new Error('Artifact validation timed out')), 120_000);
    const request = get(url, { lookup: (_host, _options, callback) => callback(null, addresses[0].address, 4) }, response => {
      if (response.statusCode && [301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume(); clearTimeout(timer);
        if (redirects >= 4 || !response.headers.location) return reject(new BadRequestException('Invalid artifact redirect'));
        downloadReleaseArtifact(new URL(response.headers.location, url).href, redirects + 1).then(resolve, reject); return;
      }
      if (response.statusCode !== 200) { response.resume(); clearTimeout(timer); reject(new BadRequestException('Artifact download must return HTTP 200')); return; }
      const chunks: Buffer[] = []; let size = 0;
      response.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 256 * 1024 * 1024) request.destroy(new Error('Artifact exceeds 256 MiB validation limit')); else chunks.push(chunk); });
      response.on('end', () => { clearTimeout(timer); if (size < 64) reject(new BadRequestException('Artifact is empty or truncated')); else resolve(Buffer.concat(chunks)); });
      response.on('error', err => { clearTimeout(timer); reject(err); });
    });
    request.on('error', () => { clearTimeout(timer); reject(new BadRequestException('Artifact could not be downloaded and verified')); });
  });
}

export async function validateReleaseArtifacts(dto: PublishReleaseDto): Promise<void> {
  for (const platform of dto.supportedPlatforms) {
    if (platform === 'web') continue;
    const bytes = await downloadReleaseArtifact(dto.downloadUrls![platform]);
    if (createHash('sha256').update(bytes).digest('hex') !== dto.artifactHashes![platform].toLowerCase()) throw new BadRequestException(`${platform}: SHA-256 mismatch`);
    const magic = bytes.subarray(0, 2).toString('ascii');
    if ((platform === 'windows' && magic !== 'MZ') || (platform === 'android' && magic !== 'PK')) throw new BadRequestException(`${platform}: wrong artifact format`);
    if (platform === 'windows' && !verifyUpdaterArtifact(bytes, dto.signatures!.windows)) throw new BadRequestException('Windows: invalid Tauri updater signature');
  }
}
