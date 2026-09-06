import { z } from 'zod';

export const publishReleaseSchema = z.object({
  appCode: z.enum(['POS', 'RESTAURANT_ADMIN', 'CAPTAIN', 'KDS', 'KIOSK', 'KIOSK_ADMIN']),
  version: z.string().min(1),
  channel: z.enum(['STABLE', 'BETA']).default('STABLE'),
  minSupportedVersion: z.string().optional(),
  supportedPlatforms: z.array(z.string()).min(1),
  releaseNotes: z.string().optional(),
  downloadUrl: z.string().optional(),
  isMandatory: z.boolean().default(false)
});

export type PublishReleaseDto = z.infer<typeof publishReleaseSchema>;
