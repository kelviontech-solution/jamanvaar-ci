import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { verifyUpdaterArtifact, downloadReleaseArtifact, matchesSignedInstallerIdentity } from '../src/modules/applications/release-verification';
import { publishReleaseSchema } from '../src/modules/applications/dto/application.dto';
import { compareVersions, updateFor } from '../src/common/version';
import { ApplicationsService } from '../src/modules/applications/applications.service';

function testSignature(bytes: Buffer) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const keyId = Buffer.from('0102030405060708', 'hex');
  const publicBytes = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
  const signature = sign(null, createHash('blake2b512').update(bytes).digest(), privateKey);
  const comment = 'timestamp:1\tfile:test.exe\tprehashed';
  const global = sign(null, Buffer.concat([signature, Buffer.from(comment)]), privateKey);
  return {
    key: Buffer.from(`untrusted comment: test key\n${Buffer.concat([Buffer.from('Ed'), keyId, publicBytes]).toString('base64')}\n`).toString('base64'),
    signature: Buffer.from(`untrusted comment: test signature\n${Buffer.concat([Buffer.from('ED'), keyId, signature]).toString('base64')}\ntrusted comment: ${comment}\n${global.toString('base64')}\n`).toString('base64')
  };
}

describe('native release cryptographic verification and routing', () => {
  it('accepts an isolated minisign artifact and rejects tampered bytes, signature, comment and wrong key', () => {
    const bytes = Buffer.from('MZ-isolated-test-artifact'); const signed = testSignature(bytes);
    expect(verifyUpdaterArtifact(bytes, signed.signature, signed.key)).toBe(true);
    expect(verifyUpdaterArtifact(Buffer.from('MZ-modified'), signed.signature, signed.key)).toBe(false);
    expect(verifyUpdaterArtifact(bytes, 'not-a-signature', signed.key)).toBe(false);
    const changed = Buffer.from(Buffer.from(signed.signature, 'base64').toString().replace('timestamp:1', 'timestamp:2')).toString('base64');
    expect(verifyUpdaterArtifact(bytes, changed, signed.key)).toBe(false);
    expect(verifyUpdaterArtifact(bytes, signed.signature, testSignature(bytes).key)).toBe(false);
  });
  it('never starts a network request to credentials, insecure or unapproved artifact hosts', async () => {
    vi.stubEnv('RELEASE_ARTIFACT_HOSTS', 'downloads.example.invalid');
    for (const url of ['http://downloads.example.invalid/a.exe', 'https://user:pass@downloads.example.invalid/a.exe', 'https://127.0.0.1/a.exe', 'https://unapproved.example/a.exe']) await expect(downloadReleaseArtifact(url)).rejects.toThrow();
    vi.unstubAllEnvs();
  });
  it('binds an already verified signature to the selected native product, version and target', () => {
    const sig = Buffer.from('untrusted comment: test\nAAAA\ntrusted comment: timestamp:1\tfile:JAMANVAAR POS_2.0.0_x64-setup.exe\nAAAA\n').toString('base64');
    expect(matchesSignedInstallerIdentity(sig, 'POS', '2.0.0')).toBe(true);
    expect(matchesSignedInstallerIdentity(sig, 'KIOSK', '2.0.0')).toBe(false);
    expect(matchesSignedInstallerIdentity(sig, 'POS', '2.1.0')).toBe(false);
  });
  it('orders SemVer prereleases correctly, ignores build metadata and retains legacy short versions', () => {
    expect(compareVersions('2.10.0', '2.9.0')).toBeGreaterThan(0);
    expect(compareVersions('2.0.0-beta.10', '2.0.0-beta.2')).toBeGreaterThan(0);
    expect(compareVersions('2.0.0', '2.0.0-rc.1')).toBeGreaterThan(0);
    expect(compareVersions('2.0.0+build1', '2.0.0+build2')).toBe(0);
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('invalid', '1.0.0')).toBeLessThan(0);
  });
  it('rejects incomplete native releases and versions that cannot be installed', () => {
    const web = { appCode: 'POS', version: '2.0.0', supportedPlatforms: ['web'] };
    expect(publishReleaseSchema.safeParse(web).success).toBe(true);
    for (const override of [{ version: 'abc' }, { version: '2.0.0-beta.1' }, { minSupportedVersion: '3.0.0' }, { supportedPlatforms: ['windows'] }, { supportedPlatforms: ['android'] }, { downloadUrls: { android: 'https://x.example/a.apk' } }]) expect(publishReleaseSchema.safeParse({ ...web, ...override }).success).toBe(false);
    expect(publishReleaseSchema.safeParse({ ...web, version: '2.0.0-beta.1', channel: 'BETA' }).success).toBe(true);
  });
  it('does not offer Android binaries to Windows or downgrade a newer installation', () => {
    const release = { version: '2.0.0', supportedPlatforms: ['android'], downloadUrls: { android: 'https://x.example/a.apk' }, isMandatory: true, minSupportedVersion: null, releaseNotes: null };
    expect(updateFor('1.0.0', release, 'Windows')).toBeNull();
    expect(updateFor('3.0.0', release, 'Android')).toBeNull();
    expect(updateFor('1.0.0', release, 'Android')).toMatchObject({ latestVersion: '2.0.0' });
  });
  it('a newer Android-only release does not hide the last compatible Windows update', async () => {
    const prisma = { runAsPlatform: (fn: (tx: unknown) => unknown) => fn({ appRelease: { findMany: vi.fn().mockResolvedValue([
      { version: '3.0.0', supportedPlatforms: ['android'], downloadUrls: { android: 'https://x.example/a.apk' } },
      { version: '2.0.0', supportedPlatforms: ['windows'], downloadUrls: { windows: 'https://x.example/a.exe' }, signatures: { windows: 'sig' }, releasedAt: new Date(), releaseNotes: null }
    ]) } }) };
    const service = new ApplicationsService(prisma as never, {} as never, {} as never);
    expect(await service.getUpdaterManifest('POS')).toMatchObject({ version: '2.0.0', platforms: { 'windows-x86_64': { signature: 'sig' } } });
  });
});
