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
  // Sandbox-only testing aid: send Cashfree calls to a local stand-in instead of sandbox.cashfree.com.
  // Never honoured when CASHFREE_ENVIRONMENT=production.
  CASHFREE_BASE_URL_OVERRIDE: z.string().optional(),
  // Optional: AES-256-GCM key (32 bytes, base64) for encrypting
  // RestaurantPaymentConnection settlement bank details at rest.
  PAYMENT_CREDENTIAL_ENCRYPTION_KEY: z.string().optional(),
  // Number of reverse proxies in front of the API (1 behind one load balancer). Unset means the API sees the connecting address
  // itself. Never set it to `true`: that lets any caller choose their own address for rate limiting.
  // 'true' makes the server refuse voids/refunds/corrections that arrive with no signed proof of who did them (default: accept and flag, so a
  // terminal that signed in offline can still sync).
  REQUIRE_STAFF_SESSION: z.enum(['true', 'false']).optional(),
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).optional(),
  // Separate secret for QR guest session signatures; falls back to JWT_ACCESS_SECRET when unset.
  QR_SESSION_SECRET: z.string().min(32).optional(),
  // JAMANVAAR_SERVICE_SECRET (the WhatsApp connector's service-to-service signing secret,
  // see common/guards/service-signature.guard.ts) is deliberately NOT declared in this
  // schema, unlike every other secret here -- adding it broke two outbound-webhook e2e
  // tests, reproducibly, even run alone: those tests set
  // process.env.JAMANVAAR_SERVICE_SECRET to their own value in beforeAll, before building
  // a fresh app with createTestApp(), and WhatsAppOutboundWebhookService reads the secret
  // via ConfigService.get(), not process.env directly. Undeclared, ConfigService.get()
  // falls back to a live process.env read and sees the test's own value; declared here
  // (even as plain z.string().optional(), no transform), it instead returned whatever
  // value was present at some earlier point this file's own debugging didn't fully
  // pin down -- confirmed only by reverting this exact addition and watching the tests
  // pass again, not by a full trace of Zod/ConfigModule's internals. Until that's
  // understood precisely, leave this one undeclared. Its production strength check lives
  // in productionConfigProblems below regardless, which reads the raw passed-in config
  // object directly and needs no schema entry to do that.
  // Requests of terminals sharing one address (a whole branch) per minute; see common/throttle.ts.
  DEVICE_SYNC_RPM: z.coerce.number().int().positive().optional()
});

export type ValidatedEnv = z.infer<typeof envSchema>;

/** A secret that is long enough AND not an obvious placeholder or a repeated pattern. */
export function isStrongSecret(value: string | undefined): boolean {
  if (!value || value.length < 32) return false;
  if (/change.?me|changeme|replace.?me|example|secret|password|dev.?secret|test.?secret|your[-_ ]/i.test(value)) return false;
  return new Set(value).size >= 12; // "aaaa..." or "abababab..." is not a secret
}

/** What must be true before the API may start in production. Returned as plain sentences so the boot error is readable. */
export function productionConfigProblems(config: Record<string, unknown>): string[] {
  const problems: string[] = [];
  if (!isStrongSecret(config.JWT_ACCESS_SECRET as string | undefined)) problems.push('JWT_ACCESS_SECRET must be a random secret of 32+ characters (not a placeholder).');
  // `!== undefined` isn't enough to mean "actually configured": found on the real deploy,
  // not assumed -- this project's own docker-compose.yml passes every optional secret
  // through as `${VAR:-}`, so an unset .env value still arrives here as an empty string,
  // never a genuinely absent key. Truthy checks (like BACKUP_ENCRYPTION_KEY_B64 below
  // already does) treat '' the same as unset; these two didn't, and immediately refused to
  // boot in production with no connector/QR feature configured at all.
  if (config.QR_SESSION_SECRET && !isStrongSecret(config.QR_SESSION_SECRET as string)) problems.push('QR_SESSION_SECRET must be a random secret of 32+ characters.');
  if (config.JAMANVAAR_SERVICE_SECRET && !isStrongSecret(config.JAMANVAAR_SERVICE_SECRET as string)) problems.push('JAMANVAAR_SERVICE_SECRET must be a random secret of 32+ characters (not the dev placeholder) if the WhatsApp connector is enabled.');
  const cors = String(config.CORS_ALLOWED_ORIGINS ?? '').trim();
  if (!cors) problems.push('CORS_ALLOWED_ORIGINS must list the console origins in production (an empty list would block every console).');
  else if (cors.split(',').some((o) => /localhost|127\.0\.0\.1/.test(o) || o.trim() === '*')) problems.push('CORS_ALLOWED_ORIGINS must not contain localhost or * in production.');
  const backupKey = config.BACKUP_ENCRYPTION_KEY_B64 as string | undefined;
  if (backupKey && Buffer.from(backupKey, 'base64').length !== 32) problems.push('BACKUP_ENCRYPTION_KEY_B64 must be 32 random bytes, base64 encoded.');
  return problems;
}

export function validateEnv(config: Record<string, unknown>): ValidatedEnv {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  if (result.data.NODE_ENV === 'production') {
    const problems = productionConfigProblems(config);
    if (problems.length) throw new Error(['Unsafe production configuration:', ...problems.map((p) => `  - ${p}`)].join(String.fromCharCode(10)));
  }
  return result.data;
}
