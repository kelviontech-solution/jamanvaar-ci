import { z } from 'zod';
import { QR_CAPABILITIES } from '../application-entitlements/qr-capabilities';
export const qrBundleSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    bundles: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z0-9-]{1,60}$/),
            name: z.string().trim().min(1).max(80),
            description: z.string().trim().max(250),
            capabilities: z
              .record(z.boolean())
              .refine((v) => Object.keys(v).every((k) => Object.prototype.hasOwnProperty.call(QR_CAPABILITIES, k)), 'Unknown QR capability')
          })
          .strict()
      )
      .max(20)
  })
  .strict()
  .refine((v) => new Set(v.bundles.map((b) => b.id)).size === v.bundles.length, 'Bundle identifiers must be unique');
export type QrBundleConfig = z.infer<typeof qrBundleSchema>;
export const DEFAULT_QR_BUNDLES: QrBundleConfig = {
  revision: 0,
  bundles: [
    {
      id: 'welcome',
      name: 'Restaurant Welcome',
      description: 'Restaurant page and QR presentation.',
      capabilities: { QR_RESTAURANT_PAGE: true, QR_BRANDING: true }
    },
    {
      id: 'guest-experience',
      name: 'Guest Experience',
      description: 'Welcome page, service requests, languages, feedback and loyalty.',
      capabilities: { QR_RESTAURANT_PAGE: true, QR_BRANDING: true, QR_SERVICE_REQUESTS: true, QR_MULTILINGUAL: true, QR_FEEDBACK: true, QR_LOYALTY: true }
    },
    {
      id: 'complete',
      name: 'Complete QR capabilities',
      description: 'All optional QR capabilities, subject to feature availability and branch licenses.',
      capabilities: Object.fromEntries(Object.keys(QR_CAPABILITIES).map((k) => [k, true]))
    }
  ]
};
