import { describe, it, expect } from 'vitest';
import { compareVersions, updateFor } from './version';

/** BUG-065: release versions must compare numerically ("2.10.0" is newer than "2.9.0"), and a terminal must be told about a newer stable release. */
describe('compareVersions', () => {
  it('compares numerically, segment by segment', () => {
    expect(compareVersions('2.10.0', '2.9.0')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('1.0.9', '1.1.0')).toBeLessThan(0);
  });

  it('treats an unparseable or missing version as older than any real one', () => {
    expect(compareVersions('', '1.0.0')).toBeLessThan(0);
    expect(compareVersions('abc', '0.0.1')).toBeLessThan(0);
  });
});

describe('updateFor', () => {
  const rel = (version: string, over: object = {}) => ({
    version,
    isMandatory: false,
    minSupportedVersion: null,
    downloadUrls: { windows: 'https://x/y.exe', android: 'https://x/y.apk' },
    releaseNotes: 'n',
    ...over
  });

  it('is null when the terminal is current, ahead, or there is no release', () => {
    expect(updateFor('2.0.0', rel('2.0.0'))).toBeNull();
    expect(updateFor('3.0.0', rel('2.0.0'))).toBeNull();
    expect(updateFor('1.0.0', null)).toBeNull();
  });

  it('offers a newer release, optional unless marked mandatory', () => {
    expect(updateFor('1.0.0', rel('2.0.0'))).toMatchObject({ latestVersion: '2.0.0', mandatory: false, downloadUrl: 'https://x/y.exe' });
    expect(updateFor('1.0.0', rel('2.0.0', { isMandatory: true }))?.mandatory).toBe(true);
  });

  it('forces the update when the terminal is below the minimum supported version', () => {
    expect(updateFor('1.0.0', rel('2.0.0', { minSupportedVersion: '1.5.0' }))?.mandatory).toBe(true);
    expect(updateFor('1.6.0', rel('2.0.0', { minSupportedVersion: '1.5.0' }))?.mandatory).toBe(false);
  });

  it('treats a terminal that never reported a version as needing the update', () => {
    expect(updateFor(null, rel('2.0.0'))).toMatchObject({ latestVersion: '2.0.0' });
  });

  it('picks the Android download URL for a device reporting an Android osPlatform, Windows otherwise', () => {
    expect(updateFor('1.0.0', rel('2.0.0'), 'Android')?.downloadUrl).toBe('https://x/y.apk');
    expect(updateFor('1.0.0', rel('2.0.0'), 'Windows 11')?.downloadUrl).toBe('https://x/y.exe');
    expect(updateFor('1.0.0', rel('2.0.0'), null)?.downloadUrl).toBe('https://x/y.exe');
  });

  it('is null (not a crash) when the matching platform has no URL yet', () => {
    expect(updateFor('1.0.0', rel('2.0.0', { downloadUrls: { windows: 'https://x/y.exe' } }), 'Android')?.downloadUrl).toBeNull();
  });
});
