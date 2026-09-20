import { z } from 'zod';

/**
 * CODE-002 fix: fail fast at boot if required secrets/config are missing or malformed,
 * instead of starting successfully and crashing (or silently misbehaving) on first use.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
  /** Owners and super admins stay signed in for a shorter time than everyone else. */
  PRIVILEGED_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(7),
  /** Most concurrent sessions one platform account may hold; a new sign-in beyond it ends the oldest. */
  MAX_PLATFORM_SESSIONS: z.coerce.number().int().min(1).max(50).default(5),
  PORT: z.coerce.number().int().positive().default(4000),
  // Optional: offline license certificate signing (see modules/licensing). Feature
  // degrades to a clear 503 rather than crashing boot when unset in an environment
  // that doesn't need offline dealer activation.
  LICENSE_SIGNING_PRIVATE_KEY_B64: z.string().optional(),
  // The id of that key (matches a `kid` in packages/config/src/license_keys.ts). Every certificate carries it,
  // so a new key can be introduced and the old one retired without breaking certificates already in the field.
  LICENSE_SIGNING_KEY_ID: z.string().optional(),
  // Optional: real off-device backup storage (see modules/backups). Any
  // S3-compatible provider works — AWS S3, Cloudflare R2, Backblaze B2,
  // DigitalOcean Spaces, self-hosted MinIO. Omit BACKUP_S3_ENDPOINT for real
  // AWS S3. Degrades to a clear 503 on upload/download when unset, rather
  // than silently pretending a backup succeeded.
  BACKUP_S3_ENDPOINT: z.string().optional(),
  BACKUP_S3_REGION: z.string().optional(),
  BACKUP_S3_BUCKET: z.string().optional(),
  BACKUP_S3_ACCESS_KEY_ID: z.string().optional(),
  BACKUP_S3_SECRET_ACCESS_KEY: z.string().optional(),
  // An empty value (a blank line in .env) means "not set".
  BACKUP_S3_FORCE_PATH_STYLE: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['true', 'false']).optional()),
  // Backups fall back to this directory on the API server when no S3 bucket is configured (BUG-071).
  BACKUP_LOCAL_DIR: z.string().optional(),
  // 32 random bytes, base64. When set, every backup is AES-256-GCM encrypted before it is stored (BUG-074).
  BACKUP_ENCRYPTION_KEY_B64: z.string().optional(),
  // 'off' disables the automatic per-restaurant snapshots (BUG-072/074). Off under test.
  BACKUP_SCHEDULE: z.string().optional(),
  // Optional: Cashfree Payment Gateway (see modules/payments). Degrades to a
  // clear 503 on any payment operation when unset, rather than silently
  // pretending a payment gateway is configured.
  CASHFREE_CLIENT_ID: z.string().optional(),
  CASHFREE_CLIENT_SECRET: z.string().optional(),
  CASHFREE_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),
  CASHFREE_API_VERSION: z.string().default('2025-01-01'),
  // Cashfree signs webhooks with your account secret key
  // (https://www.cashfree.com/docs/api-reference/vrs/webhook-signature-verification).
  // Stored as its own var (rather than reusing CASHFREE_CLIENT_SECRET) so it
  // can be rotated independently if Cashfree issues a dedicated webhook
  // signing secret later — today, set it to the same value as
  // CASHFREE_CLIENT_SECRET.
  CASHFREE_WEBHOOK_SECRET: z.string().optional(),
  CASHFREE_WEBHOOK_NOTIFY_URL: z.string().optional(),
  // Optional: AES-256-GCM key (32 bytes, base64) for encrypting
  // RestaurantPaymentConnection settlement bank details at rest.
  PAYMENT_CREDENTIAL_ENCRYPTION_KEY: z.string().optional()
});

export type ValidatedEnv = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): ValidatedEnv {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
