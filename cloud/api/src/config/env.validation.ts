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
  PORT: z.coerce.number().int().positive().default(4000),
  // Optional: offline license certificate signing (see modules/licensing). Feature
  // degrades to a clear 503 rather than crashing boot when unset in an environment
  // that doesn't need offline dealer activation.
  LICENSE_SIGNING_PRIVATE_KEY_B64: z.string().optional(),
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
  BACKUP_S3_FORCE_PATH_STYLE: z.enum(['true', 'false']).optional()
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
