import { z } from 'zod';

/**
 * security-audit MED-04: `downloadUrl` used to be an unvalidated string, rendered as a
 * raw `<a href>` in Super Admin's Applications page and in every terminal app's shared
 * update banner (`packages/ui/src/PlatformNoticeBanner.tsx`). A `javascript:`/`data:`
 * URL there runs in the reading app's origin — the Super Admin console or a live
 * terminal — the moment someone clicks "Download". Restricted to `https:` only.
 */
const httpsUrl = z.string().url().refine((u) => u.toLowerCase().startsWith('https://'), {
  message: 'downloadUrl must be an https:// URL'
});

export const publishReleaseSchema = z.object({
  appCode: z.enum(['POS', 'RESTAURANT_ADMIN', 'CAPTAIN', 'KDS', 'KIOSK', 'KIOSK_ADMIN']),
  version: z.string().min(1),
  channel: z.enum(['STABLE', 'BETA']).default('STABLE'),
  minSupportedVersion: z.string().optional(),
  supportedPlatforms: z.array(z.string()).min(1),
  releaseNotes: z.string().optional(),
  // One version can need a different file per platform (a Windows .exe vs an Android
  // .apk) -- keyed by the same platform strings as supportedPlatforms.
  downloadUrls: z.record(z.string(), httpsUrl).optional(),
  isMandatory: z.boolean().default(false)
});

export type PublishReleaseDto = z.infer<typeof publishReleaseSchema>;
