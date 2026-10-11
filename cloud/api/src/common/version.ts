import { compare, valid } from 'semver';

/** SemVer precedence, including prereleases. Retain legacy numeric short versions. */
export function compareVersions(a: string | null | undefined, b: string | null | undefined): number {
  const parse = (v: string | null | undefined): string | null => {
    if (!v) return null;
    const text = v.trim();
    return valid(text) ?? (/^\d+(\.\d+){0,1}$/.test(text) ? valid(text.split('.').concat(['0', '0']).slice(0, 3).join('.')) : null);
  };
  const pa = parse(a);
  const pb = parse(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  return compare(pa!, pb!);
}

export interface UpdateOffer {
  latestVersion: string;
  mandatory: boolean;
  downloadUrl: string | null;
  downloadSha256?: string;
  releaseNotes: string | null;
}

/** The device's own free-form `osPlatform` string ("Windows 11", "Android", ...) to a downloadUrls key. */
export function downloadUrlKeyFor(osPlatform: string | null | undefined): string {
  if (!osPlatform) return 'windows'; // historical devices did not report their OS
  if (/android/i.test(osPlatform)) return 'android';
  if (/win/i.test(osPlatform)) return 'windows';
  return 'web';
}

/** What a terminal should be told about the newest stable release (BUG-065). Null when it is already current. */
export function updateFor(
  currentVersion: string | null | undefined,
  latest: {
    version: string;
    isMandatory: boolean;
    minSupportedVersion: string | null;
    downloadUrls: Record<string, string> | null;
    artifactHashes?: unknown;
    supportedPlatforms?: unknown;
    releaseNotes: string | null;
  } | null,
  devicePlatform?: string | null
): UpdateOffer | null {
  if (!latest || compareVersions(currentVersion, latest.version) >= 0) return null;
  const belowMinimum = !!latest.minSupportedVersion && compareVersions(currentVersion, latest.minSupportedVersion) < 0;
  const key = downloadUrlKeyFor(devicePlatform);
  if (Array.isArray(latest.supportedPlatforms) && !latest.supportedPlatforms.includes(key)) return null;
  return {
    latestVersion: latest.version,
    mandatory: latest.isMandatory || belowMinimum,
    downloadUrl: latest.downloadUrls?.[key] ?? null,
    ...((latest.artifactHashes as Record<string, string> | null)?.[key] ? { downloadSha256: (latest.artifactHashes as Record<string, string>)[key] } : {}),
    releaseNotes: latest.releaseNotes
  };
}
