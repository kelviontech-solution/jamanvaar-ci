/** Numeric, segment-by-segment version comparison ("2.10.0" > "2.9.0"). Unparseable input sorts below any real version. */
export function compareVersions(a: string | null | undefined, b: string | null | undefined): number {
  const parse = (v: string | null | undefined): number[] | null => {
    if (!v || !/^\d+(\.\d+)*$/.test(v.trim())) return null;
    return v.trim().split('.').map(Number);
  };
  const pa = parse(a);
  const pb = parse(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export interface UpdateOffer {
  latestVersion: string;
  mandatory: boolean;
  downloadUrl: string | null;
  releaseNotes: string | null;
}

/** What a terminal should be told about the newest stable release (BUG-065). Null when it is already current. */
export function updateFor(
  currentVersion: string | null | undefined,
  latest: { version: string; isMandatory: boolean; minSupportedVersion: string | null; downloadUrl: string | null; releaseNotes: string | null } | null
): UpdateOffer | null {
  if (!latest || compareVersions(currentVersion, latest.version) >= 0) return null;
  const belowMinimum = !!latest.minSupportedVersion && compareVersions(currentVersion, latest.minSupportedVersion) < 0;
  return { latestVersion: latest.version, mandatory: latest.isMandatory || belowMinimum, downloadUrl: latest.downloadUrl, releaseNotes: latest.releaseNotes };
}
