import { describe, it, expect } from 'vitest';
import { publishReleaseSchema } from '../src/modules/applications/dto/application.dto';
import { updateFor } from '../src/common/version';

describe('native release provenance', () => {
  const release = { appCode: 'KIOSK', version: '2.0.0', supportedPlatforms: ['android'], downloadUrls: { android: 'https://downloads.example.invalid/kiosk.apk' } };
  it('rejects an Android update without the signed APK checksum, malformed checksums and embedded URL credentials', () => {
    expect(publishReleaseSchema.safeParse(release).success).toBe(false);
    expect(publishReleaseSchema.safeParse({ ...release, artifactHashes: { android: 'abcd' } }).success).toBe(false);
    expect(publishReleaseSchema.safeParse({ ...release, artifactHashes: { android: 'a'.repeat(64) }, downloadUrls: { android: 'https://user:password@example.invalid/k.apk' } }).success).toBe(false);
    expect(publishReleaseSchema.safeParse({ ...release, artifactHashes: { android: 'a'.repeat(64) } }).success).toBe(true);
  });
  it('Windows binary publishing requires its updater signature', () => {
    const windows = { ...release, supportedPlatforms: ['windows'], downloadUrls: { windows: 'https://downloads.example.invalid/app.exe' } };
    expect(publishReleaseSchema.safeParse(windows).success).toBe(false);
    expect(publishReleaseSchema.safeParse({ ...windows, signatures: { windows: 'signed-build-signature' }, artifactHashes: { windows: 'a'.repeat(64) } }).success).toBe(true);
  });
  it('a heartbeat carries the checksum for this platform, retaining compatibility with web-only releases', () => {
    expect(updateFor('1.0.0', { version: '2.0.0', isMandatory: false, minSupportedVersion: null, releaseNotes: null, downloadUrls: release.downloadUrls, artifactHashes: { android: 'b'.repeat(64), windows: 'c'.repeat(64) } }, 'Android')?.downloadSha256).toBe('b'.repeat(64));
  });
});
