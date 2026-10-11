import { z } from 'zod';
import { valid, prerelease, gt } from 'semver';

/**
 * security-audit MED-04: `downloadUrl` used to be an unvalidated string, rendered as a
 * raw `<a href>` in Super Admin's Applications page and in every terminal app's shared
 * update banner (`packages/ui/src/PlatformNoticeBanner.tsx`). A `javascript:`/`data:`
 * URL there runs in the reading app's origin — the Super Admin console or a live
 * terminal — the moment someone clicks "Download". Restricted to `https:` only.
 */
const httpsUrl = z.string().url().refine((u) => { const url = new URL(u); return url.protocol === 'https:' && !url.username && !url.password; }, {
  message: 'downloadUrl must be an https:// URL'
});

export const publishReleaseSchema = z.object({
  appCode: z.enum(['POS', 'RESTAURANT_ADMIN', 'CAPTAIN', 'KDS', 'KIOSK', 'KIOSK_ADMIN']),
  version: z.string().refine(v => valid(v) === v, 'Use a canonical semantic version such as 1.2.3'),
  channel: z.enum(['STABLE', 'BETA']).default('STABLE'),
  minSupportedVersion: z.string().refine(v => valid(v) === v, 'Invalid semantic version').optional(),
  supportedPlatforms: z.array(z.enum(['windows', 'android', 'web'])).min(1),
  releaseNotes: z.string().optional(),
  // One version can need a different file per platform (a Windows .exe vs an Android
  // .apk) -- keyed by the same platform strings as supportedPlatforms.
  downloadUrls: z.record(z.string(), httpsUrl).optional(),
  // Tauri updater signature (the contents of the .sig file the CI build produces next
  // to the Windows installer) -- required for the desktop auto-updater to trust and
  // install that platform's downloadUrls entry. Keyed the same way as downloadUrls.
  signatures: z.record(z.string(), z.string()).optional(),
  artifactHashes: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/i)).optional(),
  isMandatory: z.boolean().default(false)
}).superRefine((release, ctx) => {
  if (release.channel === 'STABLE' && prerelease(release.version)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['version'], message: 'Prerelease versions require the BETA channel' });
  if (valid(release.version) && release.minSupportedVersion && valid(release.minSupportedVersion) && gt(release.minSupportedVersion, release.version)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['minSupportedVersion'], message: 'Minimum version cannot exceed the release version' });
  for (const platform of release.supportedPlatforms) {
    if (platform === 'web') continue;
    if (!release.downloadUrls?.[platform]) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['downloadUrls', platform], message: 'Native releases require a hosted artifact' });
    if (!release.artifactHashes?.[platform]) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['artifactHashes', platform], message: 'Native releases require SHA-256' });
  }
  for (const platform of Object.keys(release.downloadUrls ?? {})) if (!release.supportedPlatforms.includes(platform as 'windows' | 'android' | 'web')) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['downloadUrls', platform], message: 'Artifact platform is not selected' });
  if (release.downloadUrls?.android && !release.artifactHashes?.android) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['artifactHashes', 'android'], message: 'Android releases require the SHA-256 of the signed APK' });
  if (release.downloadUrls?.windows && !release.signatures?.windows?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['signatures', 'windows'], message: 'Windows releases require their Tauri updater signature' });
});

export type PublishReleaseDto = z.infer<typeof publishReleaseSchema>;
