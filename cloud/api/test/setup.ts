import 'dotenv/config';
import 'reflect-metadata';
// Prisma reads .env itself the first time its client loads and would put removed variables back, so let it
// do that now, before the payment keys are removed below.
import '@prisma/client';

// Never run the suite against the development database: use the dedicated test database when one is
// configured. It is owned by a non-superuser role, so row-level security is genuinely enforced.
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

// Tests must never see (or spend) the developer's real Cashfree keys, whatever their .env holds: the
// payment suites mock the gateway or set their own throw-away secrets. Removed here, and the app's
// ConfigModule skips the .env file under test (see app.module.ts), so it cannot put them back.
for (const key of ['CASHFREE_CLIENT_ID', 'CASHFREE_CLIENT_SECRET', 'CASHFREE_WEBHOOK_SECRET', 'CASHFREE_WEBHOOK_NOTIFY_URL']) {
  delete process.env[key];
}
process.env.CASHFREE_ENVIRONMENT = 'sandbox';
// Cashfree is off in production (see CASHFREE_ENABLED in env.validation.ts); its code paths stay covered by the suites here.
process.env.CASHFREE_ENABLED = 'true';

// Tests must never send real email, whatever SMTP settings the developer's .env holds.
process.env.SMTP_HOST = '';
process.env.QR_RESOLVE_CACHE_MS = '0'; // suites that need the cache turn it on explicitly
process.env.DEVICE_AUTH_CACHE_MS = '0'; // suites that need the device cache turn it on explicitly
process.env.PUBLIC_AUTH_RPM = '100000';
