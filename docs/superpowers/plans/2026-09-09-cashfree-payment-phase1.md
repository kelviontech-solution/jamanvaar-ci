# Cashfree Payment Gateway — Phase 1 (Backend Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend foundation for real Cashfree payments — schema, credential encryption, a Cashfree API client, menu-price validation, order/payment creation, and idempotent webhook-driven payment confirmation — with no UI yet.

**Architecture:** New NestJS module `cloud/api/src/modules/payments/` following the exact thin-controller/Zod-DTO/`runAsTenant`-`runAsPlatform` pattern already used by `application-entitlements`. Six new RLS-protected Postgres tables. Kiosk Admin's existing device credential pushes a menu snapshot; any Kiosk-type device creates orders/payments against it; Cashfree's webhook (raw-body, signature-verified) is the sole authority for marking a payment successful.

**Tech Stack:** NestJS 10, Prisma 5 / Postgres (RLS), Zod, Vitest + Supertest (e2e), Node's built-in `fetch` and `crypto` (no new dependencies).

**Spec:** `docs/superpowers/specs/2026-09-09-cashfree-payment-phase1-design.md`

## Global Constraints

- All money is integer paise. Never floating-point rupees.
- Every new tenant-owned table gets Postgres RLS (`ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` + a `tenant_isolation` policy), copied exactly from `cloud/api/prisma/migrations/20260909055500_application_entitlements/migration.sql`.
- `restaurantId` on every payment endpoint comes from the authenticated `Device` (`DeviceAuthGuard` / `@CurrentDevice()`), never from the request body.
- Cashfree credentials are read only from env vars server-side; never returned in an API response, never logged.
- One JAMANVAAR-owned Cashfree account (Easy Split). `RestaurantPaymentConnection.connectionType` is always `PLATFORM_POOLED` in this phase.
- The webhook is the sole source of truth for payment success — nothing else may set a `PaymentTransaction` to `SUCCESS`.
- No mocked/fake payment success anywhere outside test doubles explicitly injected via dependency-injection overrides in tests.
- `Payment`, `PaymentMethod`, and `PaymentStatus` already exist in `schema.prisma` for platform/subscription billing (`Invoice` ↔ `Payment`) — every new model/enum in this plan uses a distinct name (`PaymentTransaction`, `PaymentTransactionStatus`, `PaymentTransactionMethod`, etc.) to avoid collision.

---

## Task 1: Credential encryption utility

**Files:**
- Create: `cloud/api/src/common/security/credential-encryption.util.ts`
- Test: `cloud/api/src/common/security/credential-encryption.util.spec.ts`

**Interfaces:**
- Produces: `encryptCredential(plaintext: string, keyBase64: string): string`, `decryptCredential(encoded: string, keyBase64: string): string` — pure functions, key passed explicitly (not read from env here), so later tasks can unit-test and use them without any NestJS/env wiring.

- [ ] **Step 1: Write the failing test**

```ts
// cloud/api/src/common/security/credential-encryption.util.spec.ts
import { randomBytes } from 'crypto';
import { describe, it, expect } from 'vitest';
import { encryptCredential, decryptCredential } from './credential-encryption.util';

describe('credential-encryption.util', () => {
  const key = randomBytes(32).toString('base64');

  it('round-trips plaintext exactly', () => {
    const encrypted = encryptCredential('1234567890', key);
    expect(decryptCredential(encrypted, key)).toBe('1234567890');
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const a = encryptCredential('same-value', key);
    const b = encryptCredential('same-value', key);
    expect(a).not.toBe(b);
  });

  it('rejects a tampered ciphertext', () => {
    const encrypted = encryptCredential('secret', key);
    const [iv, tag] = encrypted.split(':');
    const tampered = `${iv}:${tag}:${Buffer.from('tampered-bytes').toString('base64')}`;
    expect(() => decryptCredential(tampered, key)).toThrow();
  });

  it('rejects decryption with the wrong key', () => {
    const encrypted = encryptCredential('secret', key);
    const wrongKey = randomBytes(32).toString('base64');
    expect(() => decryptCredential(encrypted, wrongKey)).toThrow();
  });

  it('rejects a key that does not decode to 32 bytes', () => {
    expect(() => encryptCredential('x', Buffer.from('too-short').toString('base64'))).toThrow(
      'Encryption key must decode to exactly 32 bytes'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cloud/api && npx vitest run src/common/security/credential-encryption.util.spec.ts`
Expected: FAIL — `Cannot find module './credential-encryption.util'`

- [ ] **Step 3: Write the implementation**

```ts
// cloud/api/src/common/security/credential-encryption.util.ts
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

/**
 * AES-256-GCM for settlement details on RestaurantPaymentConnection (bank
 * account number). Output is `base64(iv):base64(authTag):base64(ciphertext)`.
 * The key is supplied by the caller rather than read from env here, so this
 * stays a pure, trivially unit-testable module — PAYMENT_CREDENTIAL_ENCRYPTION_KEY
 * is only ever read by the payments module that calls this.
 */
export function encryptCredential(plaintext: string, keyBase64: string): string {
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32) {
    throw new Error('Encryption key must decode to exactly 32 bytes');
  }
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
}

export function decryptCredential(encoded: string, keyBase64: string): string {
  const key = Buffer.from(keyBase64, 'base64');
  const [ivB64, authTagB64, ciphertextB64] = encoded.split(':');
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error('Malformed encrypted credential');
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextB64, 'base64')), decipher.final()]);
  return plaintext.toString('utf8');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cloud/api && npx vitest run src/common/security/credential-encryption.util.spec.ts`
Expected: PASS (5/5)

- [ ] **Step 5: Commit**

```bash
git add cloud/api/src/common/security/credential-encryption.util.ts cloud/api/src/common/security/credential-encryption.util.spec.ts
git commit -m "feat(payments): add AES-256-GCM credential encryption utility"
```

---

## Task 2: Prisma schema + migration for the payment tables

**Files:**
- Modify: `cloud/api/prisma/schema.prisma`
- Create: `cloud/api/prisma/migrations/20260909060000_payments_foundation/migration.sql`

**Interfaces:**
- Produces (Prisma client models/enums consumed by every later task): `Order`, `PaymentTransaction`, `RestaurantPaymentConnection`, `Refund`, `WebhookEvent`, `MenuSnapshotItem`; enums `PaymentProvider` (`CASHFREE`), `PaymentConnectionType` (`PLATFORM_POOLED`), `PaymentConnectionStatus` (`NOT_CONNECTED`/`PENDING_VERIFICATION`/`ACTIVE`/`SUSPENDED`/`DISCONNECTED`), `OrderPaymentStatus` (`DRAFT`/`PENDING_PAYMENT`/`PAYMENT_PROCESSING`/`PAID`/`SENT_TO_POS`/`PAYMENT_FAILED`/`CANCELLED`), `PaymentTransactionStatus` (`CREATED`/`PENDING`/`AUTHORIZED`/`SUCCESS`/`FAILED`/`USER_DROPPED`/`CANCELLED`/`REFUND_PENDING`/`PARTIALLY_REFUNDED`/`REFUNDED`), `PaymentTransactionMethod` (`UPI`/`CARD`/`NET_BANKING`/`WALLET`/`OTHER`), `RefundStatus` (`PENDING`/`SUCCESS`/`FAILED`), `WebhookProcessingStatus` (`RECEIVED`/`VERIFIED`/`PROCESSED`/`FAILED`/`IGNORED_DUPLICATE`).

- [ ] **Step 1: Add the new enums and models to `schema.prisma`**

Append this block at the end of `cloud/api/prisma/schema.prisma`:

```prisma
// ---------------------------------------------------------------------------
// Cashfree Payment Gateway — Phase 1 (see docs/superpowers/specs/2026-09-09-
// cashfree-payment-phase1-design.md). Distinct model/enum names from the
// existing Payment/PaymentMethod/PaymentStatus above, which are platform
// subscription billing, not customer-order payments.
// ---------------------------------------------------------------------------

enum PaymentProvider {
  CASHFREE
}

// Only PLATFORM_POOLED (Cashfree Easy Split, one JAMANVAAR-owned account) is
// implemented in Phase 1. A true per-restaurant merchant-account mode would
// be added later via `ALTER TYPE ... ADD VALUE`, the same way AppCode and
// ActivationKeyDeviceType were extended in the application-entitlements
// migration — it requires Cashfree Partner/Platform approval JAMANVAAR does
// not have yet.
enum PaymentConnectionType {
  PLATFORM_POOLED
}

enum PaymentConnectionStatus {
  NOT_CONNECTED
  PENDING_VERIFICATION
  ACTIVE
  SUSPENDED
  DISCONNECTED
}

enum OrderPaymentStatus {
  DRAFT
  PENDING_PAYMENT
  PAYMENT_PROCESSING
  PAID
  SENT_TO_POS
  PAYMENT_FAILED
  CANCELLED
}

enum PaymentTransactionStatus {
  CREATED
  PENDING
  AUTHORIZED
  SUCCESS
  FAILED
  USER_DROPPED
  CANCELLED
  REFUND_PENDING
  PARTIALLY_REFUNDED
  REFUNDED
}

enum PaymentTransactionMethod {
  UPI
  CARD
  NET_BANKING
  WALLET
  OTHER
}

enum RefundStatus {
  PENDING
  SUCCESS
  FAILED
}

enum WebhookProcessingStatus {
  RECEIVED
  VERIFIED
  PROCESSED
  FAILED
  IGNORED_DUPLICATE
}

// The trusted, backend-queryable copy of what a restaurant actually sells —
// pushed by Kiosk Admin (which already has a live device connection)
// whenever its local menu changes. Order totals are validated against this,
// never against prices the kiosk sends at checkout time.
model MenuSnapshotItem {
  id             String     @id @default(uuid())
  restaurantId   String
  restaurant     Restaurant @relation(fields: [restaurantId], references: [id], onDelete: Cascade)
  externalItemId String // the kiosk's own local item id
  name           String
  category       String?
  basePrice      Int // paise
  modifierGroups Json? // [{ id, name, isRequired, minSelections, maxSelections, options: [{ id, name, priceDelta }] }]
  taxRate        Int        @default(0) // basis points, e.g. 500 = 5.00%
  isAvailable    Boolean    @default(true)
  syncedAt       DateTime   @default(now())
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt

  @@unique([restaurantId, externalItemId])
  @@index([restaurantId])
}

// Cloud order record — does not exist elsewhere; kiosks are offline-first
// and never had a cloud order model before this. items is an immutable
// snapshot captured at creation time from MenuSnapshotItem.
model Order {
  id              String             @id @default(uuid())
  restaurantId    String
  restaurant      Restaurant         @relation(fields: [restaurantId], references: [id], onDelete: Cascade)
  kioskId         String?
  kiosk           Device?            @relation(fields: [kioskId], references: [id], onDelete: SetNull)
  externalOrderId String // correlates to the kiosk's local order id; doubles as the idempotency key
  items           Json // [{ externalItemId, name, quantity, unitPrice, modifiers, lineTotal }]
  subtotal        Int // paise
  taxAmount       Int // paise
  discountAmount  Int                @default(0) // paise
  totalAmount     Int // paise
  currency        String             @default("INR")
  status          OrderPaymentStatus @default(DRAFT)
  createdAt       DateTime           @default(now())
  updatedAt       DateTime           @updatedAt

  paymentTransactions PaymentTransaction[]

  @@unique([restaurantId, externalOrderId])
  @@index([restaurantId])
  @@index([kioskId])
}

model PaymentTransaction {
  id                String                    @id @default(uuid())
  orderId           String
  order             Order                     @relation(fields: [orderId], references: [id], onDelete: Cascade)
  restaurantId      String
  restaurant        Restaurant                @relation(fields: [restaurantId], references: [id], onDelete: Cascade)
  provider          PaymentProvider           @default(CASHFREE)
  providerOrderId   String // the order_id we generate and send to Cashfree
  providerPaymentId String? // Cashfree's cf_payment_id, known once paid/failed
  amount            Int // paise
  currency          String                    @default("INR")
  status            PaymentTransactionStatus  @default(CREATED)
  method            PaymentTransactionMethod?
  paymentSessionId  String?
  providerResponse  Json? // sanitized webhook/API response, no secrets
  failureReason     String?
  paidAt            DateTime?
  createdAt         DateTime                  @default(now())
  updatedAt         DateTime                  @updatedAt

  refunds Refund[]

  @@unique([provider, providerOrderId])
  @@index([restaurantId])
  @@index([orderId])
  @@index([providerPaymentId])
}

// One per restaurant. Represents the Cashfree Easy Split vendor
// registration for Phase 1 (PLATFORM_POOLED) — settlement bank/UPI details,
// not independent API credentials.
model RestaurantPaymentConnection {
  id                                String                  @id @default(uuid())
  restaurantId                      String                  @unique
  restaurant                        Restaurant              @relation(fields: [restaurantId], references: [id], onDelete: Cascade)
  provider                          PaymentProvider         @default(CASHFREE)
  connectionType                    PaymentConnectionType   @default(PLATFORM_POOLED)
  cashfreeVendorId                  String?
  status                            PaymentConnectionStatus @default(NOT_CONNECTED)
  settlementAccountName             String?
  settlementAccountNumberEncrypted  String? // encrypted via credential-encryption.util
  settlementIfsc                    String?
  settlementUpiVpa                  String?
  verifiedAt                        DateTime?
  lastWebhookAt                     DateTime?
  lastPaymentAt                     DateTime?
  createdAt                         DateTime                @default(now())
  updatedAt                         DateTime                @updatedAt
}

// Schema only in Phase 1 — no refund endpoint yet, so a later phase doesn't
// need its own migration.
model Refund {
  id               String        @id @default(uuid())
  paymentId        String
  payment          PaymentTransaction @relation(fields: [paymentId], references: [id], onDelete: Cascade)
  restaurantId     String
  restaurant       Restaurant    @relation(fields: [restaurantId], references: [id], onDelete: Cascade)
  providerRefundId String?
  amount           Int // paise
  reason           String?
  status           RefundStatus  @default(PENDING)
  requestedBy      String?
  processedAt      DateTime?
  createdAt        DateTime      @default(now())

  @@index([restaurantId])
  @@index([paymentId])
}

// Every inbound webhook is stored raw before any processing, for idempotency
// and audit. restaurantId is nullable — unknown until the payload is parsed
// and matched to a PaymentTransaction — and backfilled once resolved.
model WebhookEvent {
  id               String                  @id @default(uuid())
  restaurantId     String?
  restaurant       Restaurant?             @relation(fields: [restaurantId], references: [id], onDelete: SetNull)
  provider         PaymentProvider         @default(CASHFREE)
  providerEventKey String // derived dedup key, e.g. `${type}:${cf_payment_id}` — Cashfree's payload carries no separate event id
  eventType        String
  rawPayload       Json
  signatureValid   Boolean
  processingStatus WebhookProcessingStatus @default(RECEIVED)
  processedAt      DateTime?
  retryCount       Int                     @default(0)
  errorMessage     String?
  createdAt        DateTime                @default(now())

  @@unique([provider, providerEventKey])
  @@index([restaurantId])
}
```

- [ ] **Step 2: Add the reverse relations to `Restaurant` and `Device`**

In `cloud/api/prisma/schema.prisma`, inside `model Restaurant { ... }`, add after the existing `applicationEntitlements ApplicationEntitlement[]` line:

```prisma
  orders                  Order[]
  paymentTransactions     PaymentTransaction[]
  paymentConnection       RestaurantPaymentConnection?
  refunds                 Refund[]
  webhookEvents           WebhookEvent[]
  menuSnapshotItems       MenuSnapshotItem[]
```

Inside `model Device { ... }`, add after the existing `offlineExtensions OfflineExtension[]` line:

```prisma
  orders           Order[]
```

- [ ] **Step 3: Generate the migration skeleton**

Run: `cd cloud/api && npx prisma migrate dev --create-only --name payments_foundation`

This creates `cloud/api/prisma/migrations/<timestamp>_payments_foundation/migration.sql` with the enum/table/index/FK DDL auto-derived from the schema changes above.

- [ ] **Step 4: Append the RLS block**

Append this to the bottom of the generated migration.sql (same pattern as `20260909055500_application_entitlements/migration.sql`):

```sql
-- RLS: every payment table is tenant-owned (restaurantId-scoped), same shape
-- as every other tenant table (Subscription, ActivationKey, Backup,
-- ApplicationEntitlement, ...). FORCE is required because the app's DB role
-- owns these tables and Postgres exempts owners from RLS by default.
-- WebhookEvent.restaurantId is nullable — the policy shape is unchanged,
-- it simply means a row with no resolved restaurant is invisible under any
-- tenant context, only visible via runAsPlatform, which is correct: only
-- system/platform code touches WebhookEvent directly.

ALTER TABLE "MenuSnapshotItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MenuSnapshotItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MenuSnapshotItem"
  USING (
    current_setting('app.is_platform_context', true) = 'true'
    OR "restaurantId" = current_setting('app.current_restaurant_id', true)
  );

ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Order" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Order"
  USING (
    current_setting('app.is_platform_context', true) = 'true'
    OR "restaurantId" = current_setting('app.current_restaurant_id', true)
  );

ALTER TABLE "PaymentTransaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentTransaction" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PaymentTransaction"
  USING (
    current_setting('app.is_platform_context', true) = 'true'
    OR "restaurantId" = current_setting('app.current_restaurant_id', true)
  );

ALTER TABLE "RestaurantPaymentConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RestaurantPaymentConnection" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RestaurantPaymentConnection"
  USING (
    current_setting('app.is_platform_context', true) = 'true'
    OR "restaurantId" = current_setting('app.current_restaurant_id', true)
  );

ALTER TABLE "Refund" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Refund" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Refund"
  USING (
    current_setting('app.is_platform_context', true) = 'true'
    OR "restaurantId" = current_setting('app.current_restaurant_id', true)
  );

ALTER TABLE "WebhookEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebhookEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "WebhookEvent"
  USING (
    current_setting('app.is_platform_context', true) = 'true'
    OR "restaurantId" = current_setting('app.current_restaurant_id', true)
  );
```

- [ ] **Step 5: Apply the migration and regenerate the client**

Run: `cd cloud/api && npx prisma validate && npx prisma migrate dev && npx prisma generate`
Expected: migration applies cleanly, Prisma Client regenerates with `prisma.order`, `prisma.paymentTransaction`, `prisma.restaurantPaymentConnection`, `prisma.refund`, `prisma.webhookEvent`, `prisma.menuSnapshotItem` available. (These models are exercised for real starting in Task 6's e2e tests — there's no meaningful standalone test for a migration beyond it applying successfully.)

- [ ] **Step 6: Commit**

```bash
git add cloud/api/prisma/schema.prisma cloud/api/prisma/migrations
git commit -m "feat(payments): add Order, PaymentTransaction, RestaurantPaymentConnection, Refund, WebhookEvent, MenuSnapshotItem schema"
```

---

## Task 3: Environment variables for Cashfree + credential encryption

**Files:**
- Modify: `cloud/api/src/config/env.validation.ts`
- Test: `cloud/api/src/config/env.validation.spec.ts` (new — none exists yet for this file)

**Interfaces:**
- Produces: `ValidatedEnv` gains `CASHFREE_CLIENT_ID?`, `CASHFREE_CLIENT_SECRET?`, `CASHFREE_ENVIRONMENT` (`'sandbox' | 'production'`, default `'sandbox'`), `CASHFREE_API_VERSION` (default `'2025-01-01'`), `CASHFREE_WEBHOOK_SECRET?`, `CASHFREE_WEBHOOK_NOTIFY_URL?`, `PAYMENT_CREDENTIAL_ENCRYPTION_KEY?`.

- [ ] **Step 1: Write the failing test**

```ts
// cloud/api/src/config/env.validation.spec.ts
import { describe, it, expect } from 'vitest';
import { validateEnv } from './env.validation';

const baseEnv = {
  DATABASE_URL: 'postgresql://localhost/test',
  JWT_ACCESS_SECRET: 'a'.repeat(32)
};

describe('env.validation — Cashfree/payment vars', () => {
  it('boots successfully with none of the Cashfree/payment vars set', () => {
    const result = validateEnv(baseEnv);
    expect(result.CASHFREE_ENVIRONMENT).toBe('sandbox');
    expect(result.CASHFREE_API_VERSION).toBe('2025-01-01');
    expect(result.CASHFREE_CLIENT_ID).toBeUndefined();
    expect(result.PAYMENT_CREDENTIAL_ENCRYPTION_KEY).toBeUndefined();
  });

  it('accepts a full Cashfree configuration', () => {
    const result = validateEnv({
      ...baseEnv,
      CASHFREE_CLIENT_ID: 'test-client-id',
      CASHFREE_CLIENT_SECRET: 'test-secret',
      CASHFREE_ENVIRONMENT: 'production',
      CASHFREE_WEBHOOK_SECRET: 'test-webhook-secret',
      PAYMENT_CREDENTIAL_ENCRYPTION_KEY: 'base64-key-value'
    });
    expect(result.CASHFREE_ENVIRONMENT).toBe('production');
    expect(result.CASHFREE_CLIENT_ID).toBe('test-client-id');
  });

  it('rejects an invalid CASHFREE_ENVIRONMENT value', () => {
    expect(() => validateEnv({ ...baseEnv, CASHFREE_ENVIRONMENT: 'staging' })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cloud/api && npx vitest run src/config/env.validation.spec.ts`
Expected: FAIL — `CASHFREE_ENVIRONMENT` is `undefined`, not `'sandbox'` (no default defined yet), and the "rejects an invalid value" case doesn't throw.

- [ ] **Step 3: Add the fields to the schema**

In `cloud/api/src/config/env.validation.ts`, add inside `envSchema`, after `BACKUP_S3_FORCE_PATH_STYLE`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cloud/api && npx vitest run src/config/env.validation.spec.ts`
Expected: PASS (3/3)

- [ ] **Step 5: Commit**

```bash
git add cloud/api/src/config/env.validation.ts cloud/api/src/config/env.validation.spec.ts
git commit -m "feat(payments): add Cashfree and payment-credential-encryption env vars"
```

---

## Task 4: Pricing utility (integer-paise cart validation)

**Files:**
- Create: `cloud/api/src/modules/payments/pricing.util.ts`
- Test: `cloud/api/src/modules/payments/pricing.util.spec.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces: `priceCart(cartLines: CartLineInput[], menuItems: Map<string, MenuSnapshotItemLookup>): PricedCart`, `PriceValidationError`, and the types `CartLineInput`, `MenuSnapshotItemLookup`, `ModifierGroupSnapshot`, `PricedLine`, `PricedCart` — consumed by Task 7's `PaymentsService`.

- [ ] **Step 1: Write the failing test**

```ts
// cloud/api/src/modules/payments/pricing.util.spec.ts
import { describe, it, expect } from 'vitest';
import { priceCart, PriceValidationError, MenuSnapshotItemLookup } from './pricing.util';

function menuMap(items: MenuSnapshotItemLookup[]): Map<string, MenuSnapshotItemLookup> {
  return new Map(items.map((i) => [i.externalItemId, i]));
}

const thali: MenuSnapshotItemLookup = {
  externalItemId: 'thali-1',
  name: 'Gujarati Thali',
  basePrice: 25000, // 250.00
  taxRate: 500, // 5%
  isAvailable: true,
  modifierGroups: [
    {
      id: 'spice',
      name: 'Spice Level',
      isRequired: true,
      minSelections: 1,
      maxSelections: 1,
      options: [
        { id: 'mild', name: 'Mild', priceDelta: 0 },
        { id: 'extra-hot', name: 'Extra Hot', priceDelta: 1000 }
      ]
    }
  ]
};

describe('pricing.util priceCart', () => {
  it('computes subtotal, tax, and total in paise for a simple item with no modifiers', () => {
    const item: MenuSnapshotItemLookup = { ...thali, modifierGroups: [] };
    const result = priceCart([{ externalItemId: 'thali-1', quantity: 2, selectedOptionIds: [] }], menuMap([item]));
    expect(result.subtotal).toBe(50000);
    expect(result.taxAmount).toBe(2500);
    expect(result.totalAmount).toBe(52500);
  });

  it('adds modifier price deltas into the unit price', () => {
    const result = priceCart(
      [{ externalItemId: 'thali-1', quantity: 1, selectedOptionIds: ['extra-hot'] }],
      menuMap([thali])
    );
    expect(result.lines[0].unitPrice).toBe(26000);
    expect(result.subtotal).toBe(26000);
  });

  it('rejects an unknown menu item', () => {
    expect(() => priceCart([{ externalItemId: 'ghost', quantity: 1, selectedOptionIds: [] }], menuMap([thali]))).toThrow(
      PriceValidationError
    );
  });

  it('rejects an unavailable item', () => {
    const unavailable = { ...thali, isAvailable: false };
    expect(() =>
      priceCart([{ externalItemId: 'thali-1', quantity: 1, selectedOptionIds: ['mild'] }], menuMap([unavailable]))
    ).toThrow(PriceValidationError);
  });

  it('rejects a missing required modifier selection', () => {
    expect(() => priceCart([{ externalItemId: 'thali-1', quantity: 1, selectedOptionIds: [] }], menuMap([thali]))).toThrow(
      /Spice Level/
    );
  });

  it('rejects an unknown modifier option id', () => {
    expect(() =>
      priceCart([{ externalItemId: 'thali-1', quantity: 1, selectedOptionIds: ['does-not-exist'] }], menuMap([thali]))
    ).toThrow(PriceValidationError);
  });

  it('rejects a quantity below 1', () => {
    expect(() =>
      priceCart([{ externalItemId: 'thali-1', quantity: 0, selectedOptionIds: ['mild'] }], menuMap([thali]))
    ).toThrow(PriceValidationError);
  });

  it('rejects an empty cart', () => {
    expect(() => priceCart([], menuMap([thali]))).toThrow(PriceValidationError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cloud/api && npx vitest run src/modules/payments/pricing.util.spec.ts`
Expected: FAIL — `Cannot find module './pricing.util'`

- [ ] **Step 3: Write the implementation**

```ts
// cloud/api/src/modules/payments/pricing.util.ts

export interface ModifierOptionSnapshot {
  id: string;
  name: string;
  priceDelta: number; // paise
}

export interface ModifierGroupSnapshot {
  id: string;
  name: string;
  isRequired: boolean;
  minSelections: number;
  maxSelections: number;
  options: ModifierOptionSnapshot[];
}

export interface MenuSnapshotItemLookup {
  externalItemId: string;
  name: string;
  basePrice: number; // paise
  taxRate: number; // basis points, e.g. 500 = 5.00%
  isAvailable: boolean;
  modifierGroups: ModifierGroupSnapshot[];
}

export interface CartLineInput {
  externalItemId: string;
  quantity: number;
  selectedOptionIds: string[];
}

export interface PricedLine {
  externalItemId: string;
  name: string;
  quantity: number;
  unitPrice: number; // paise
  lineSubtotal: number; // paise
  lineTax: number; // paise
  lineTotal: number; // paise
  modifiers: ModifierOptionSnapshot[];
}

export interface PricedCart {
  lines: PricedLine[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
}

export class PriceValidationError extends Error {}

/**
 * Backend-computed cart total, ported from packages/business/src/pricing.ts's
 * unit-price/modifier logic but in integer paise (that package is float
 * decimal-rupee, the wrong unit for the paise convention used throughout
 * cloud Postgres, and cloud/api has no existing workspace dependency on
 * packages/business to build one on).
 */
export function priceCart(cartLines: CartLineInput[], menuItems: Map<string, MenuSnapshotItemLookup>): PricedCart {
  if (cartLines.length === 0) {
    throw new PriceValidationError('Cart must contain at least one item');
  }

  const lines: PricedLine[] = cartLines.map((line) => {
    if (line.quantity < 1) {
      throw new PriceValidationError(`Invalid quantity for item ${line.externalItemId}`);
    }
    const menuItem = menuItems.get(line.externalItemId);
    if (!menuItem) {
      throw new PriceValidationError(`Unknown menu item: ${line.externalItemId}`);
    }
    if (!menuItem.isAvailable) {
      throw new PriceValidationError(`Item is not available: ${menuItem.name}`);
    }

    const selectedOptions = resolveSelectedOptions(menuItem, line.selectedOptionIds);
    const modifierSum = selectedOptions.reduce((sum, opt) => sum + opt.priceDelta, 0);
    const unitPrice = menuItem.basePrice + modifierSum;
    const lineSubtotal = unitPrice * line.quantity;
    const lineTax = Math.round((lineSubtotal * menuItem.taxRate) / 10000);

    return {
      externalItemId: line.externalItemId,
      name: menuItem.name,
      quantity: line.quantity,
      unitPrice,
      lineSubtotal,
      lineTax,
      lineTotal: lineSubtotal + lineTax,
      modifiers: selectedOptions
    };
  });

  const subtotal = lines.reduce((sum, l) => sum + l.lineSubtotal, 0);
  const taxAmount = lines.reduce((sum, l) => sum + l.lineTax, 0);
  return { lines, subtotal, taxAmount, totalAmount: subtotal + taxAmount };
}

function resolveSelectedOptions(menuItem: MenuSnapshotItemLookup, selectedOptionIds: string[]): ModifierOptionSnapshot[] {
  const resolved: ModifierOptionSnapshot[] = [];

  for (const group of menuItem.modifierGroups) {
    const selectedInGroup = group.options.filter((opt) => selectedOptionIds.includes(opt.id));
    if (group.isRequired && selectedInGroup.length === 0) {
      throw new PriceValidationError(`'${group.name}' requires a selection for ${menuItem.name}`);
    }
    if (group.minSelections > 0 && selectedInGroup.length < group.minSelections) {
      throw new PriceValidationError(`'${group.name}' requires at least ${group.minSelections} selection(s) for ${menuItem.name}`);
    }
    if (group.maxSelections > 0 && selectedInGroup.length > group.maxSelections) {
      throw new PriceValidationError(`'${group.name}' allows at most ${group.maxSelections} selection(s) for ${menuItem.name}`);
    }
    resolved.push(...selectedInGroup);
  }

  const knownOptionIds = new Set(menuItem.modifierGroups.flatMap((g) => g.options.map((o) => o.id)));
  for (const id of selectedOptionIds) {
    if (!knownOptionIds.has(id)) {
      throw new PriceValidationError(`Unknown modifier option '${id}' for ${menuItem.name}`);
    }
  }

  return resolved;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cloud/api && npx vitest run src/modules/payments/pricing.util.spec.ts`
Expected: PASS (8/8)

- [ ] **Step 5: Commit**

```bash
git add cloud/api/src/modules/payments/pricing.util.ts cloud/api/src/modules/payments/pricing.util.spec.ts
git commit -m "feat(payments): add integer-paise cart pricing/modifier validation"
```

---

## Task 5: CashfreeGatewayService

**Files:**
- Create: `cloud/api/src/modules/payments/cashfree-gateway.service.ts`
- Test: `cloud/api/src/modules/payments/cashfree-gateway.service.spec.ts`

**Interfaces:**
- Consumes: `ConfigService` (`@nestjs/config`).
- Produces: `CashfreeGatewayService` with `isConfigured(): boolean`, `createOrder(input: CreateCashfreeOrderInput): Promise<CashfreeOrderResult>`, `getOrderStatus(orderId: string): Promise<CashfreeOrderStatusResult>`, `createRefund(input: CreateCashfreeRefundInput): Promise<CashfreeRefundResult>`, `verifyWebhookSignature(rawBody: Buffer, timestamp: string, signature: string): boolean` — consumed by Task 7 (`createOrder`) and Task 10 (`verifyWebhookSignature`).

Reference (verified against current Cashfree docs, not invented): base URLs `https://sandbox.cashfree.com/pg` / `https://api.cashfree.com/pg`; headers `x-client-id`, `x-client-secret`, `x-api-version`; `POST /orders` body `{ order_id, order_amount, order_currency, customer_details: { customer_id, customer_phone }, order_meta?: { notify_url } }` → response `{ cf_order_id, order_id, payment_session_id, order_status }`; `GET /orders/{order_id}` → `{ order_id, order_status, order_amount }`; `POST /orders/{order_id}/refunds` body `{ refund_amount, refund_id, refund_note? }` → response `{ cf_refund_id, refund_id, refund_status, refund_amount }`; webhook signature is `base64(HMAC-SHA256(x-webhook-timestamp + rawBody, client_secret))` compared against the `x-webhook-signature` header.

- [ ] **Step 1: Write the failing test**

```ts
// cloud/api/src/modules/payments/cashfree-gateway.service.spec.ts
import { createHmac } from 'crypto';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CashfreeGatewayService } from './cashfree-gateway.service';

async function buildService(env: Record<string, string>): Promise<CashfreeGatewayService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      CashfreeGatewayService,
      { provide: ConfigService, useValue: { get: (key: string) => env[key] } }
    ]
  }).compile();
  return moduleRef.get(CashfreeGatewayService);
}

const CONFIGURED_ENV = {
  CASHFREE_CLIENT_ID: 'test-client',
  CASHFREE_CLIENT_SECRET: 'test-secret',
  CASHFREE_WEBHOOK_SECRET: 'test-secret',
  CASHFREE_ENVIRONMENT: 'sandbox',
  CASHFREE_API_VERSION: '2025-01-01'
};

describe('CashfreeGatewayService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('isConfigured() is false with no env vars set', async () => {
    const service = await buildService({});
    expect(service.isConfigured()).toBe(false);
  });

  it('createOrder throws ServiceUnavailableException when unconfigured', async () => {
    const service = await buildService({});
    await expect(
      service.createOrder({ orderId: 'pay_1', amountPaise: 10000, currency: 'INR', customerId: 'order_1' })
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('createOrder posts to the sandbox orders endpoint with the correct headers and body, converting paise to rupees', async () => {
    const service = await buildService(CONFIGURED_ENV);
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          cf_order_id: '12345',
          order_id: 'pay_1',
          payment_session_id: 'session_abc',
          order_status: 'ACTIVE'
        }),
        { status: 200 }
      )
    );

    const result = await service.createOrder({ orderId: 'pay_1', amountPaise: 12345, currency: 'INR', customerId: 'order_1' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://sandbox.cashfree.com/pg/orders');
    expect(init?.headers).toMatchObject({
      'x-client-id': 'test-client',
      'x-client-secret': 'test-secret',
      'x-api-version': '2025-01-01'
    });
    const body = JSON.parse(init!.body as string);
    expect(body.order_amount).toBe(123.45);
    expect(body.customer_details.customer_phone).toBeTypeOf('string');
    expect(result.paymentSessionId).toBe('session_abc');
    expect(result.orderStatus).toBe('ACTIVE');
  });

  it('createOrder throws when Cashfree responds with a non-2xx status', async () => {
    const service = await buildService(CONFIGURED_ENV);
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ message: 'bad request' }), { status: 400 }));
    await expect(
      service.createOrder({ orderId: 'pay_1', amountPaise: 100, currency: 'INR', customerId: 'order_1' })
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('verifyWebhookSignature accepts a correctly-signed payload', async () => {
    const service = await buildService(CONFIGURED_ENV);
    const rawBody = Buffer.from(JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK' }));
    const timestamp = '1700000000';
    const signature = createHmac('sha256', CONFIGURED_ENV.CASHFREE_WEBHOOK_SECRET)
      .update(timestamp + rawBody.toString('utf8'))
      .digest('base64');

    expect(service.verifyWebhookSignature(rawBody, timestamp, signature)).toBe(true);
  });

  it('verifyWebhookSignature rejects a tampered payload', async () => {
    const service = await buildService(CONFIGURED_ENV);
    const rawBody = Buffer.from(JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK' }));
    const timestamp = '1700000000';
    const signature = createHmac('sha256', CONFIGURED_ENV.CASHFREE_WEBHOOK_SECRET)
      .update(timestamp + rawBody.toString('utf8'))
      .digest('base64');
    const tamperedBody = Buffer.from(JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK', extra: true }));

    expect(service.verifyWebhookSignature(tamperedBody, timestamp, signature)).toBe(false);
  });

  it('verifyWebhookSignature throws when CASHFREE_WEBHOOK_SECRET is unset', async () => {
    const service = await buildService({});
    expect(() => service.verifyWebhookSignature(Buffer.from('{}'), '1700000000', 'anything')).toThrow(
      ServiceUnavailableException
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cloud/api && npx vitest run src/modules/payments/cashfree-gateway.service.spec.ts`
Expected: FAIL — `Cannot find module './cashfree-gateway.service'`

- [ ] **Step 3: Write the implementation**

```ts
// cloud/api/src/modules/payments/cashfree-gateway.service.ts
import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CreateCashfreeOrderInput {
  orderId: string; // 3-45 chars, alphanumeric/underscore/hyphen — our own generated id
  amountPaise: number;
  currency: string;
  customerId: string;
  notifyUrl?: string;
}

export interface CashfreeOrderResult {
  cfOrderId: string;
  orderId: string;
  paymentSessionId: string;
  orderStatus: string;
}

export interface CashfreeOrderStatusResult {
  orderId: string;
  orderStatus: string;
  orderAmount: number;
}

export interface CreateCashfreeRefundInput {
  orderId: string;
  refundId: string;
  amountPaise: number;
  note?: string;
}

export interface CashfreeRefundResult {
  cfRefundId: string;
  refundId: string;
  refundStatus: string;
  refundAmount: number;
}

// Kiosk walk-up customers never provide a phone number, but Cashfree's
// Create Order API requires customer_details.customer_phone — a fixed
// placeholder is used since this flow collects no real one.
const PLACEHOLDER_CUSTOMER_PHONE = '9999999999';

/**
 * Thin wrapper over the Cashfree Payment Gateway REST API
 * (https://www.cashfree.com/docs/api-reference/payments/latest/overview).
 */
@Injectable()
export class CashfreeGatewayService {
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('CASHFREE_CLIENT_ID') &&
        this.config.get<string>('CASHFREE_CLIENT_SECRET') &&
        this.config.get<string>('CASHFREE_WEBHOOK_SECRET')
    );
  }

  private baseUrl(): string {
    return this.config.get<string>('CASHFREE_ENVIRONMENT') === 'production'
      ? 'https://api.cashfree.com/pg'
      : 'https://sandbox.cashfree.com/pg';
  }

  private headers(): Record<string, string> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Cashfree is not configured on this server (set CASHFREE_CLIENT_ID, CASHFREE_CLIENT_SECRET, CASHFREE_WEBHOOK_SECRET, and optionally CASHFREE_ENVIRONMENT / CASHFREE_API_VERSION)'
      );
    }
    return {
      'x-client-id': this.config.get<string>('CASHFREE_CLIENT_ID')!,
      'x-client-secret': this.config.get<string>('CASHFREE_CLIENT_SECRET')!,
      'x-api-version': this.config.get<string>('CASHFREE_API_VERSION') ?? '2025-01-01',
      'Content-Type': 'application/json'
    };
  }

  async createOrder(input: CreateCashfreeOrderInput): Promise<CashfreeOrderResult> {
    const res = await fetch(`${this.baseUrl()}/orders`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        order_id: input.orderId,
        order_amount: Number((input.amountPaise / 100).toFixed(2)),
        order_currency: input.currency,
        customer_details: { customer_id: input.customerId, customer_phone: PLACEHOLDER_CUSTOMER_PHONE },
        ...(input.notifyUrl ? { order_meta: { notify_url: input.notifyUrl } } : {})
      })
    });
    const body = await res.json();
    if (!res.ok) {
      throw new ServiceUnavailableException(`Cashfree order creation failed: ${body?.message ?? res.statusText}`);
    }
    return { cfOrderId: body.cf_order_id, orderId: body.order_id, paymentSessionId: body.payment_session_id, orderStatus: body.order_status };
  }

  async getOrderStatus(orderId: string): Promise<CashfreeOrderStatusResult> {
    const res = await fetch(`${this.baseUrl()}/orders/${encodeURIComponent(orderId)}`, { method: 'GET', headers: this.headers() });
    const body = await res.json();
    if (!res.ok) {
      throw new ServiceUnavailableException(`Cashfree order lookup failed: ${body?.message ?? res.statusText}`);
    }
    return { orderId: body.order_id, orderStatus: body.order_status, orderAmount: body.order_amount };
  }

  async createRefund(input: CreateCashfreeRefundInput): Promise<CashfreeRefundResult> {
    const res = await fetch(`${this.baseUrl()}/orders/${encodeURIComponent(input.orderId)}/refunds`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        refund_amount: Number((input.amountPaise / 100).toFixed(2)),
        refund_id: input.refundId,
        ...(input.note ? { refund_note: input.note } : {})
      })
    });
    const body = await res.json();
    if (!res.ok) {
      throw new ServiceUnavailableException(`Cashfree refund failed: ${body?.message ?? res.statusText}`);
    }
    return { cfRefundId: body.cf_refund_id, refundId: body.refund_id, refundStatus: body.refund_status, refundAmount: body.refund_amount };
  }

  /**
   * Cashfree signs webhooks as base64(HMAC-SHA256(timestamp + rawBody, secret))
   * (https://www.cashfree.com/docs/api-reference/vrs/webhook-signature-verification).
   */
  verifyWebhookSignature(rawBody: Buffer, timestamp: string, signature: string): boolean {
    const secret = this.config.get<string>('CASHFREE_WEBHOOK_SECRET');
    if (!secret) {
      throw new ServiceUnavailableException('CASHFREE_WEBHOOK_SECRET is not configured on this server');
    }
    const expected = Buffer.from(createHmac('sha256', secret).update(timestamp + rawBody.toString('utf8')).digest('base64'));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cloud/api && npx vitest run src/modules/payments/cashfree-gateway.service.spec.ts`
Expected: PASS (7/7)

- [ ] **Step 5: Commit**

```bash
git add cloud/api/src/modules/payments/cashfree-gateway.service.ts cloud/api/src/modules/payments/cashfree-gateway.service.spec.ts
git commit -m "feat(payments): add CashfreeGatewayService (orders, refunds, webhook signature)"
```

---

## Task 6: Menu snapshot sync (Kiosk Admin → cloud)

**Files:**
- Create: `cloud/api/src/modules/payments/dto/menu-sync.dto.ts`
- Create: `cloud/api/src/modules/payments/menu-sync.service.ts`
- Create: `cloud/api/src/modules/payments/menu-sync.controller.ts`
- Create: `cloud/api/src/modules/payments/payments.module.ts`
- Modify: `cloud/api/src/app.module.ts`
- Test: `cloud/api/test/payments-menu-sync.e2e.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `DeviceAuthGuard`, `CurrentDevice` decorator (all existing).
- Produces: `MenuSyncService.upsertItems(restaurantId, items): Promise<{ synced: number }>`, `MenuSyncService.loadItemsByExternalIds(restaurantId, externalItemIds): Promise<MenuSnapshotItem[]>` (Prisma model instances) — the second is consumed by Task 7's `PaymentsService`. `POST /api/v1/tenant/menu-sync` (device-authed, `KIOSK_ADMIN` only).

- [ ] **Step 1: Write the DTO**

```ts
// cloud/api/src/modules/payments/dto/menu-sync.dto.ts
import { z } from 'zod';

const modifierOptionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  priceDelta: z.number().int() // paise
});

const modifierGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  isRequired: z.boolean().default(false),
  minSelections: z.number().int().min(0).default(0),
  maxSelections: z.number().int().min(0).default(0),
  options: z.array(modifierOptionSchema)
});

export const menuSyncItemSchema = z.object({
  externalItemId: z.string().min(1),
  name: z.string().min(1),
  category: z.string().optional(),
  basePrice: z.number().int().min(0), // paise
  modifierGroups: z.array(modifierGroupSchema).default([]),
  taxRate: z.number().int().min(0).default(0),
  isAvailable: z.boolean().default(true)
});

export const menuSyncSchema = z.object({
  items: z.array(menuSyncItemSchema).min(1).max(500)
});

export type MenuSyncDto = z.infer<typeof menuSyncSchema>;
export type MenuSyncItemDto = z.infer<typeof menuSyncItemSchema>;
```

- [ ] **Step 2: Write the service**

```ts
// cloud/api/src/modules/payments/menu-sync.service.ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MenuSyncItemDto } from './dto/menu-sync.dto';

@Injectable()
export class MenuSyncService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertItems(restaurantId: string, items: MenuSyncItemDto[]): Promise<{ synced: number }> {
    await this.prisma.runAsTenant(restaurantId, async (tx) => {
      for (const item of items) {
        await tx.menuSnapshotItem.upsert({
          where: { restaurantId_externalItemId: { restaurantId, externalItemId: item.externalItemId } },
          create: {
            restaurantId,
            externalItemId: item.externalItemId,
            name: item.name,
            category: item.category,
            basePrice: item.basePrice,
            modifierGroups: item.modifierGroups as unknown as Prisma.InputJsonValue,
            taxRate: item.taxRate,
            isAvailable: item.isAvailable,
            syncedAt: new Date()
          },
          update: {
            name: item.name,
            category: item.category,
            basePrice: item.basePrice,
            modifierGroups: item.modifierGroups as unknown as Prisma.InputJsonValue,
            taxRate: item.taxRate,
            isAvailable: item.isAvailable,
            syncedAt: new Date()
          }
        });
      }
    });
    return { synced: items.length };
  }

  /** Trusted price source for PaymentsService's cart validation. */
  async loadItemsByExternalIds(restaurantId: string, externalItemIds: string[]) {
    return this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.menuSnapshotItem.findMany({ where: { restaurantId, externalItemId: { in: externalItemIds } } })
    );
  }
}
```

- [ ] **Step 3: Write the controller**

```ts
// cloud/api/src/modules/payments/menu-sync.controller.ts
import { Body, Controller, ForbiddenException, Post, UseGuards, UsePipes } from '@nestjs/common';
import { Device } from '@prisma/client';
import { MenuSyncService } from './menu-sync.service';
import { menuSyncSchema, MenuSyncDto } from './dto/menu-sync.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { CurrentDevice } from '../../common/decorators/current-device.decorator';

@Controller('api/v1/tenant/menu-sync')
@UseGuards(DeviceAuthGuard)
export class MenuSyncController {
  constructor(private readonly menuSync: MenuSyncService) {}

  @Post()
  @UsePipes(new ZodValidationPipe(menuSyncSchema))
  async sync(@Body() body: MenuSyncDto, @CurrentDevice() device: Device) {
    if (device.type !== 'KIOSK_ADMIN') {
      throw new ForbiddenException('Only a Kiosk Admin device can push a menu snapshot');
    }
    return this.menuSync.upsertItems(device.restaurantId, body.items);
  }
}
```

- [ ] **Step 4: Create the module and wire it into `AppModule`**

```ts
// cloud/api/src/modules/payments/payments.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { MenuSyncController } from './menu-sync.controller';
import { MenuSyncService } from './menu-sync.service';

@Module({
  imports: [PrismaModule],
  controllers: [MenuSyncController],
  providers: [MenuSyncService],
  exports: [MenuSyncService]
})
export class PaymentsModule {}
```

In `cloud/api/src/app.module.ts`, add `import { PaymentsModule } from './modules/payments/payments.module';` near the other module imports, and add `PaymentsModule` to the `imports` array after `ApplicationEntitlementsModule`.

(Task 7 will add `CashfreeGatewayService` and `PaymentsService` as providers of this same module, and Task 10 adds the webhook controller — this task only wires up menu-sync.)

- [ ] **Step 5: Write the e2e test**

```ts
// cloud/api/test/payments-menu-sync.e2e.spec.ts
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Menu snapshot sync (Kiosk Admin -> cloud)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-menu-sync-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;
  let restaurantId: string;
  let planId: string;
  let kioskAdminToken: string;
  let posToken: string;

  const authed = (method: 'get' | 'post', url: string, token: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/platform-auth/login')
      .send({ email: adminEmail, password: adminPassword });
    platformToken = loginRes.body.accessToken;

    const restaurantRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Menu Sync Restaurant ${Date.now()}`,
      ownerName: 'Menu Sync Owner',
      ownerEmail: `menu-sync-owner-${Date.now()}@test.example.com`
    });
    restaurantId = restaurantRes.body.restaurant.id;

    const planRes = await authed('post', '/api/v1/plans', platformToken).send({
      tier: 'PRO',
      name: `TEST Menu Sync Plan ${Date.now()}`,
      priceMonthly: 700000,
      maxBranches: 3,
      maxDevices: 20,
      maxUsers: 20,
      entitlements: { kiosk: true }
    });
    planId = planRes.body.id;
    await authed('post', '/api/v1/subscriptions', platformToken).send({
      restaurantId,
      planId,
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });

    const keyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({
      restaurantId,
      allowedDeviceType: 'KIOSK_ADMIN',
      expiresAt: new Date(Date.now() + 86400000).toISOString()
    });
    const redeemRes = await request(app.getHttpServer())
      .post('/api/v1/activation/redeem')
      .send({ code: keyRes.body.code, deviceType: 'KIOSK_ADMIN' });
    kioskAdminToken = redeemRes.body.deviceToken;

    const posKeyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({
      restaurantId,
      allowedDeviceType: 'POS',
      expiresAt: new Date(Date.now() + 86400000).toISOString()
    });
    const posRedeemRes = await request(app.getHttpServer())
      .post('/api/v1/activation/redeem')
      .send({ code: posKeyRes.body.code, deviceType: 'POS' });
    posToken = posRedeemRes.body.deviceToken;
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    if (planId) await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  const sampleItem = {
    externalItemId: 'thali-1',
    name: 'Gujarati Thali',
    basePrice: 25000,
    taxRate: 500,
    modifierGroups: [
      {
        id: 'spice',
        name: 'Spice Level',
        isRequired: true,
        minSelections: 1,
        maxSelections: 1,
        options: [
          { id: 'mild', name: 'Mild', priceDelta: 0 },
          { id: 'extra-hot', name: 'Extra Hot', priceDelta: 1000 }
        ]
      }
    ]
  };

  it('a Kiosk Admin device can push a menu snapshot and it round-trips exactly', async () => {
    const res = await authed('post', '/api/v1/tenant/menu-sync', kioskAdminToken).send({ items: [sampleItem] });
    expect(res.status).toBe(201);
    expect(res.body.synced).toBe(1);

    const row = await prisma.runAsPlatform((tx) =>
      tx.menuSnapshotItem.findUniqueOrThrow({ where: { restaurantId_externalItemId: { restaurantId, externalItemId: 'thali-1' } } })
    );
    expect(row.basePrice).toBe(25000);
    expect(row.taxRate).toBe(500);
  });

  it('re-syncing the same externalItemId updates the row instead of creating a duplicate', async () => {
    await authed('post', '/api/v1/tenant/menu-sync', kioskAdminToken).send({ items: [{ ...sampleItem, basePrice: 27500 }] });

    const rows = await prisma.runAsPlatform((tx) => tx.menuSnapshotItem.findMany({ where: { restaurantId, externalItemId: 'thali-1' } }));
    expect(rows.length).toBe(1);
    expect(rows[0].basePrice).toBe(27500);
  });

  it('a non-Kiosk-Admin device (e.g. POS) cannot push a menu snapshot', async () => {
    const res = await authed('post', '/api/v1/tenant/menu-sync', posToken).send({ items: [sampleItem] });
    expect(res.status).toBe(403);
  });

  it('rejects an empty items array', async () => {
    const res = await authed('post', '/api/v1/tenant/menu-sync', kioskAdminToken).send({ items: [] });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd cloud/api && npx vitest run test/payments-menu-sync.e2e.spec.ts`
Expected: PASS (4/4)

- [ ] **Step 7: Commit**

```bash
git add cloud/api/src/modules/payments cloud/api/src/app.module.ts cloud/api/test/payments-menu-sync.e2e.spec.ts
git commit -m "feat(payments): add Kiosk Admin menu snapshot sync endpoint"
```

---

## Task 7: Order + payment creation

**Files:**
- Modify: `cloud/api/test/helpers.ts` (add optional testing-module override support)
- Create: `cloud/api/src/modules/payments/dto/create-payment-order.dto.ts`
- Create: `cloud/api/src/modules/payments/payments.service.ts`
- Create: `cloud/api/src/modules/payments/payment-orders.controller.ts`
- Modify: `cloud/api/src/modules/payments/payments.module.ts`
- Test: `cloud/api/test/payments-orders.e2e.spec.ts`

**Interfaces:**
- Consumes: `MenuSyncService.loadItemsByExternalIds` (Task 6), `priceCart`/`PriceValidationError` (Task 4), `CashfreeGatewayService.createOrder` (Task 5).
- Produces: `PaymentsService.createOrGetPaymentOrder(restaurantId, kioskId, dto): Promise<{ orderId, paymentId, paymentSessionId, amount, currency, status }>` — consumed by Task 9's status endpoint's sibling controller and Task 10's webhook processing (same service). `POST /api/v1/payments/orders` (device-authed, `KIOSK`/`KIOSK_ADMIN` only).

- [ ] **Step 1: Add testing-module override support to `test/helpers.ts`**

```ts
// cloud/api/test/helpers.ts — replace createTestApp with:
import { INestApplication } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

export async function createTestApp(
  configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder
): Promise<INestApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (configure) builder = configure(builder);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  await app.init();
  return app;
}
```

(Leave the rest of `test/helpers.ts` — `createTestPlatformUser`, `extractCookie` — unchanged. Existing callers that pass no argument are unaffected.)

- [ ] **Step 2: Write the DTO**

```ts
// cloud/api/src/modules/payments/dto/create-payment-order.dto.ts
import { z } from 'zod';

export const cartLineSchema = z.object({
  externalItemId: z.string().min(1),
  quantity: z.number().int().min(1).max(50),
  selectedOptionIds: z.array(z.string()).default([])
});

// No amount field on purpose — the backend computes it from MenuSnapshotItem,
// never trusting a client-sent total.
export const createPaymentOrderSchema = z.object({
  externalOrderId: z.string().min(1).max(64),
  lines: z.array(cartLineSchema).min(1).max(100)
});

export type CreatePaymentOrderDto = z.infer<typeof createPaymentOrderSchema>;
export type CartLineDto = z.infer<typeof cartLineSchema>;
```

- [ ] **Step 3: Write `PaymentsService.createOrGetPaymentOrder`**

```ts
// cloud/api/src/modules/payments/payments.service.ts
import { randomUUID } from 'crypto';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CashfreeGatewayService } from './cashfree-gateway.service';
import { MenuSyncService } from './menu-sync.service';
import { priceCart, PriceValidationError, MenuSnapshotItemLookup } from './pricing.util';
import { CreatePaymentOrderDto } from './dto/create-payment-order.dto';

const NON_TERMINAL_STATUSES = ['CREATED', 'PENDING', 'AUTHORIZED'];

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly cashfree: CashfreeGatewayService,
    private readonly menuSync: MenuSyncService
  ) {}

  async createOrGetPaymentOrder(restaurantId: string, kioskId: string, dto: CreatePaymentOrderDto) {
    const existingOrder = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.order.findUnique({
        where: { restaurantId_externalOrderId: { restaurantId, externalOrderId: dto.externalOrderId } },
        include: { paymentTransactions: { orderBy: { createdAt: 'desc' } } }
      })
    );

    if (existingOrder) {
      const latest = existingOrder.paymentTransactions[0];
      if (existingOrder.status === 'PAID' || (latest && NON_TERMINAL_STATUSES.includes(latest.status))) {
        return this.toOrderResponse(existingOrder, latest);
      }
      // Every prior attempt is terminal-failed: open a fresh attempt at the same, already-validated total.
      const payment = await this.createCashfreeAttempt(existingOrder.id, restaurantId, existingOrder.totalAmount, existingOrder.currency);
      return this.toOrderResponse(existingOrder, payment);
    }

    const connection = await this.prisma.runAsTenant(restaurantId, (tx) => tx.restaurantPaymentConnection.findUnique({ where: { restaurantId } }));
    if (!connection || connection.status !== 'ACTIVE') {
      throw new ForbiddenException('Online payments are not active for this restaurant yet');
    }

    const menuItems = await this.menuSync.loadItemsByExternalIds(restaurantId, dto.lines.map((l) => l.externalItemId));
    const lookup = new Map<string, MenuSnapshotItemLookup>(
      menuItems.map((item) => [
        item.externalItemId,
        {
          externalItemId: item.externalItemId,
          name: item.name,
          basePrice: item.basePrice,
          taxRate: item.taxRate,
          isAvailable: item.isAvailable,
          modifierGroups: (item.modifierGroups as unknown as MenuSnapshotItemLookup['modifierGroups']) ?? []
        }
      ])
    );

    let priced;
    try {
      priced = priceCart(dto.lines, lookup);
    } catch (err) {
      if (err instanceof PriceValidationError) throw new BadRequestException(err.message);
      throw err;
    }

    const order = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.order.create({
        data: {
          restaurantId,
          kioskId,
          externalOrderId: dto.externalOrderId,
          items: priced.lines as unknown as Prisma.InputJsonValue,
          subtotal: priced.subtotal,
          taxAmount: priced.taxAmount,
          discountAmount: 0,
          totalAmount: priced.totalAmount,
          status: 'PENDING_PAYMENT'
        }
      })
    );

    const payment = await this.createCashfreeAttempt(order.id, restaurantId, order.totalAmount, order.currency);
    return this.toOrderResponse(order, payment);
  }

  private async createCashfreeAttempt(orderId: string, restaurantId: string, amount: number, currency: string) {
    const payment = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.create({
        data: { orderId, restaurantId, providerOrderId: `pay_${randomUUID()}`, amount, currency, status: 'CREATED' }
      })
    );

    const cfOrder = await this.cashfree.createOrder({
      orderId: payment.providerOrderId,
      amountPaise: amount,
      currency,
      customerId: orderId,
      notifyUrl: this.config.get<string>('CASHFREE_WEBHOOK_NOTIFY_URL')
    });

    return this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.update({ where: { id: payment.id }, data: { paymentSessionId: cfOrder.paymentSessionId, status: 'PENDING' } })
    );
  }

  private toOrderResponse(
    order: { id: string; totalAmount: number; currency: string },
    payment: { id: string; paymentSessionId: string | null; status: string }
  ) {
    return { orderId: order.id, paymentId: payment.id, paymentSessionId: payment.paymentSessionId, amount: order.totalAmount, currency: order.currency, status: payment.status };
  }

  async getPaymentStatus(restaurantId: string, paymentId: string) {
    const payment = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.findFirst({ where: { id: paymentId, restaurantId }, include: { order: true } })
    );
    if (!payment) throw new NotFoundException('Payment not found');
    return { paymentId: payment.id, orderId: payment.orderId, status: payment.status, amount: payment.amount, currency: payment.currency, orderStatus: payment.order.status };
  }
}
```

- [ ] **Step 4: Write the controller**

```ts
// cloud/api/src/modules/payments/payment-orders.controller.ts
import { Body, Controller, ForbiddenException, Get, Param, Post, UseGuards, UsePipes } from '@nestjs/common';
import { Device } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { createPaymentOrderSchema, CreatePaymentOrderDto } from './dto/create-payment-order.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { CurrentDevice } from '../../common/decorators/current-device.decorator';

@Controller('api/v1/payments')
@UseGuards(DeviceAuthGuard)
export class PaymentOrdersController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('orders')
  @UsePipes(new ZodValidationPipe(createPaymentOrderSchema))
  async createOrder(@Body() body: CreatePaymentOrderDto, @CurrentDevice() device: Device) {
    if (device.type !== 'KIOSK' && device.type !== 'KIOSK_ADMIN') {
      throw new ForbiddenException('Only a Kiosk device can create a payment order');
    }
    return this.payments.createOrGetPaymentOrder(device.restaurantId, device.id, body);
  }

  @Get(':paymentId/status')
  async getStatus(@Param('paymentId') paymentId: string, @CurrentDevice() device: Device) {
    return this.payments.getPaymentStatus(device.restaurantId, paymentId);
  }
}
```

- [ ] **Step 5: Wire `PaymentsService` and `CashfreeGatewayService` into the module**

```ts
// cloud/api/src/modules/payments/payments.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { MenuSyncController } from './menu-sync.controller';
import { MenuSyncService } from './menu-sync.service';
import { PaymentOrdersController } from './payment-orders.controller';
import { PaymentsService } from './payments.service';
import { CashfreeGatewayService } from './cashfree-gateway.service';

@Module({
  imports: [PrismaModule],
  controllers: [MenuSyncController, PaymentOrdersController],
  providers: [PaymentsService, CashfreeGatewayService, MenuSyncService],
  exports: [PaymentsService, CashfreeGatewayService]
})
export class PaymentsModule {}
```

- [ ] **Step 6: Write the e2e test**

```ts
// cloud/api/test/payments-orders.e2e.spec.ts
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestApp, createTestPlatformUser } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { CashfreeGatewayService } from '../src/modules/payments/cashfree-gateway.service';

describe('Payment order creation', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-pay-orders-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;
  let restaurantId: string;
  let planId: string;
  let kioskToken: string;

  const authed = (method: 'get' | 'post', url: string, token: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  const thali = {
    externalItemId: 'thali-1',
    name: 'Gujarati Thali',
    basePrice: 25000,
    taxRate: 500,
    modifierGroups: [
      {
        id: 'spice',
        name: 'Spice Level',
        isRequired: true,
        minSelections: 1,
        maxSelections: 1,
        options: [
          { id: 'mild', name: 'Mild', priceDelta: 0 },
          { id: 'extra-hot', name: 'Extra Hot', priceDelta: 1000 }
        ]
      }
    ]
  };

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder.overrideProvider(CashfreeGatewayService).useValue({
        isConfigured: () => true,
        createOrder: vi.fn().mockResolvedValue({ cfOrderId: 'cf_1', orderId: 'pay_mock', paymentSessionId: 'session_mock', orderStatus: 'ACTIVE' })
      })
    );
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });

    const loginRes = await request(app.getHttpServer()).post('/api/v1/platform-auth/login').send({ email: adminEmail, password: adminPassword });
    platformToken = loginRes.body.accessToken;

    const restaurantRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Pay Orders Restaurant ${Date.now()}`,
      ownerName: 'Pay Orders Owner',
      ownerEmail: `pay-orders-owner-${Date.now()}@test.example.com`
    });
    restaurantId = restaurantRes.body.restaurant.id;

    const planRes = await authed('post', '/api/v1/plans', platformToken).send({
      tier: 'PRO', name: `TEST Pay Orders Plan ${Date.now()}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: { kiosk: true }
    });
    planId = planRes.body.id;
    await authed('post', '/api/v1/subscriptions', platformToken).send({
      restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });

    const keyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId, allowedDeviceType: 'KIOSK', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const redeemRes = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: keyRes.body.code, deviceType: 'KIOSK' });
    kioskToken = redeemRes.body.deviceToken;

    await authed('post', '/api/v1/tenant/menu-sync', kioskToken).send({ items: [thali] }).catch(() => {});
    // menu-sync requires a KIOSK_ADMIN device — seed the snapshot directly instead.
    await prisma.runAsTenant(restaurantId, (tx) =>
      tx.menuSnapshotItem.upsert({
        where: { restaurantId_externalItemId: { restaurantId, externalItemId: 'thali-1' } },
        create: { restaurantId, ...thali },
        update: { ...thali }
      })
    );
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    if (planId) await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  const validLines = [{ externalItemId: 'thali-1', quantity: 2, selectedOptionIds: ['extra-hot'] }];

  it('rejects order creation when no RestaurantPaymentConnection is ACTIVE', async () => {
    const res = await authed('post', '/api/v1/payments/orders', kioskToken).send({ externalOrderId: 'local-order-1', lines: validLines });
    expect(res.status).toBe(403);
  });

  it('creates an order + payment with a backend-computed total once the connection is ACTIVE', async () => {
    await prisma.runAsTenant(restaurantId, (tx) => tx.restaurantPaymentConnection.create({ data: { restaurantId, status: 'ACTIVE' } }));

    const res = await authed('post', '/api/v1/payments/orders', kioskToken).send({ externalOrderId: 'local-order-2', lines: validLines });
    expect(res.status).toBe(201);
    // (26000 base+modifier) * 2 qty = 52000 subtotal, 5% tax = 2600 -> 54600 total
    expect(res.body.amount).toBe(54600);
    expect(res.body.currency).toBe('INR');
    expect(res.body.paymentSessionId).toBe('session_mock');
    expect(res.body.status).toBe('PENDING');

    const order = await prisma.runAsPlatform((tx) => tx.order.findUniqueOrThrow({ where: { id: res.body.orderId } }));
    expect(order.totalAmount).toBe(54600);
    expect(order.status).toBe('PENDING_PAYMENT');
  });

  it('is idempotent: retrying the same externalOrderId returns the same payment instead of creating a new one', async () => {
    const first = await authed('post', '/api/v1/payments/orders', kioskToken).send({ externalOrderId: 'local-order-3', lines: validLines });
    const second = await authed('post', '/api/v1/payments/orders', kioskToken).send({ externalOrderId: 'local-order-3', lines: validLines });
    expect(second.body.paymentId).toBe(first.body.paymentId);
    expect(second.body.orderId).toBe(first.body.orderId);

    const payments = await prisma.runAsPlatform((tx) => tx.paymentTransaction.findMany({ where: { orderId: first.body.orderId } }));
    expect(payments.length).toBe(1);
  });

  it('rejects a cart referencing an unknown menu item', async () => {
    const res = await authed('post', '/api/v1/payments/orders', kioskToken).send({
      externalOrderId: 'local-order-4',
      lines: [{ externalItemId: 'does-not-exist', quantity: 1, selectedOptionIds: [] }]
    });
    expect(res.status).toBe(400);
  });

  it('never accepts a client-supplied amount field (there is no such field in the schema, so a tampered client is structurally unable to influence total)', async () => {
    const res = await authed('post', '/api/v1/payments/orders', kioskToken).send({
      externalOrderId: 'local-order-5',
      lines: validLines,
      amount: 1 // extra field, ignored by Zod's default stripping behavior
    });
    expect(res.status).toBe(201);
    expect(res.body.amount).toBe(54600);
  });
});
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd cloud/api && npx vitest run test/payments-orders.e2e.spec.ts`
Expected: PASS (6/6)

- [ ] **Step 8: Commit**

```bash
git add cloud/api/test/helpers.ts cloud/api/src/modules/payments cloud/api/test/payments-orders.e2e.spec.ts
git commit -m "feat(payments): add backend-priced order + Cashfree payment creation endpoint"
```

---

## Task 8: Payment status endpoint tenant-isolation test

**Files:**
- Test: `cloud/api/test/payments-orders.e2e.spec.ts` (extend the file from Task 7)

The `GET /api/v1/payments/:paymentId/status` endpoint and `PaymentsService.getPaymentStatus` already exist from Task 7 — this task only adds the ownership-isolation coverage the spec requires, following the exact pattern of `backups.e2e.spec.ts`'s "one restaurant cannot download another restaurant's backup" test.

**Interfaces:**
- Consumes: `PaymentsService.getPaymentStatus` (Task 7, unchanged).

- [ ] **Step 1: Write the failing test**

Append to `cloud/api/test/payments-orders.e2e.spec.ts`, inside the existing `describe` block:

```ts
  it('returns the correct status shape for the owning kiosk', async () => {
    const create = await authed('post', '/api/v1/payments/orders', kioskToken).send({ externalOrderId: 'local-order-6', lines: validLines });
    const res = await authed('get', `/api/v1/payments/${create.body.paymentId}/status`, kioskToken);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      paymentId: create.body.paymentId,
      orderId: create.body.orderId,
      status: 'PENDING',
      amount: 54600,
      currency: 'INR',
      orderStatus: 'PENDING_PAYMENT'
    });
  });

  it('a device from another restaurant cannot read this payment status', async () => {
    const otherOwnerEmail = `pay-orders-other-owner-${Date.now()}@test.example.com`;
    const otherRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Other Pay Orders Restaurant ${Date.now()}`,
      ownerName: 'Other Owner',
      ownerEmail: otherOwnerEmail
    });
    const otherRestaurantId = otherRes.body.restaurant.id;
    // Activation-key redemption is gated on an active subscription with the
    // KIOSK entitlement (ApplicationEntitlementsService.assertAppEnabled) —
    // reuse the same platform-global `planId` created in this file's
    // beforeAll, just give the other restaurant its own subscription row.
    await authed('post', '/api/v1/subscriptions', platformToken).send({
      restaurantId: otherRestaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });
    const otherKeyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({
      restaurantId: otherRestaurantId, allowedDeviceType: 'KIOSK', expiresAt: new Date(Date.now() + 86400000).toISOString()
    });
    const otherRedeemRes = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: otherKeyRes.body.code, deviceType: 'KIOSK' });
    const otherKioskToken = otherRedeemRes.body.deviceToken;

    const create = await authed('post', '/api/v1/payments/orders', kioskToken).send({ externalOrderId: 'local-order-7', lines: validLines });
    const res = await authed('get', `/api/v1/payments/${create.body.paymentId}/status`, otherKioskToken);
    expect(res.status).toBe(404);

    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: otherRestaurantId } }));
  });

  it('an unknown paymentId returns 404', async () => {
    const res = await authed('get', '/api/v1/payments/00000000-0000-0000-0000-000000000000/status', kioskToken);
    expect(res.status).toBe(404);
  });
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `cd cloud/api && npx vitest run test/payments-orders.e2e.spec.ts`
Expected: PASS immediately — `getPaymentStatus` (Task 7) already scopes its Prisma query to `{ id: paymentId, restaurantId }` via `runAsTenant(restaurantId, ...)`, so cross-tenant access already 404s. This step is confirming that guarantee with an explicit test, not adding new implementation.

- [ ] **Step 3: Commit**

```bash
git add cloud/api/test/payments-orders.e2e.spec.ts
git commit -m "test(payments): cover payment-status tenant isolation and 404 cases"
```

---

## Task 9: Raw-body handling for the Cashfree webhook route

**Files:**
- Modify: `cloud/api/src/main.ts`

**Interfaces:**
- Produces: for requests to `POST /api/v1/payments/cashfree/webhook`, `request.body` is a raw `Buffer` instead of a parsed JSON object — consumed by Task 10's webhook controller.

- [ ] **Step 1: Modify `main.ts`**

```ts
// cloud/api/src/main.ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { json, raw, urlencoded } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  // Default body size (~100kb) is too small for a full restaurant database
  // backup upload (see modules/backups) — bodyParser: false + manual json()
  // lets that one route accept up to 20MB while everything else is unaffected.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  // The Cashfree webhook needs the exact raw request bytes for HMAC signature
  // verification (see CashfreeGatewayService.verifyWebhookSignature) — this
  // path-scoped raw() must be registered before the blanket json() below.
  // body-parser's own "already parsed" check (req._body) then makes json()
  // skip this one path instead of double-consuming the request stream, so
  // every other route is unaffected.
  app.use('/api/v1/payments/cashfree/webhook', raw({ type: '*/*', limit: '1mb' }));
  app.use(json({ limit: '20mb' }));
  app.use(urlencoded({ extended: true, limit: '20mb' }));
  const config = app.get(ConfigService);

  // HTTP Security Headers (SEC-012 fix)
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' }
    })
  );
  app.use(cookieParser());
  const allowedOrigins = (
    config.get<string>('CORS_ALLOWED_ORIGINS') ?? 'http://localhost:5180,http://localhost:5176'
  )
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: allowedOrigins,
    credentials: true
  });

  const port = config.get<number>('PORT') ?? 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`JAMANVAAR cloud API listening on :${port}`);
}

bootstrap();
```

This is a `bootstrap()`-only change, exercised only by the real running server (`app.listen`) — `createTestApp()` in `test/helpers.ts` builds the Nest testing module directly and calls `app.init()`, not `bootstrap()`, so this exact raw-body wiring is not reachable from the e2e suite. Task 10 handles this by having the webhook controller accept either a `Buffer` or an already-parsed object for `request.body` (see Task 10 Step 3), and its e2e test constructs the raw signature over the exact JSON string it sends with supertest, so the signature check is still exercised correctly end-to-end within the test harness.

- [ ] **Step 2: Manual verification (no automated test for this step — see Task 10 for the behavior it enables)**

Run: `cd cloud/api && npm run build`
Expected: compiles with no errors (confirms the `raw` import and route registration are valid).

- [ ] **Step 3: Commit**

```bash
git add cloud/api/src/main.ts
git commit -m "feat(payments): capture raw request body for the Cashfree webhook route"
```

---

## Task 10: Cashfree webhook processing

**Files:**
- Create: `cloud/api/src/modules/payments/cashfree-webhook.controller.ts`
- Modify: `cloud/api/src/modules/payments/payments.service.ts` (add `processCashfreeWebhook`)
- Modify: `cloud/api/src/modules/payments/payments.module.ts`
- Test: `cloud/api/test/payments-webhook.e2e.spec.ts`

**Interfaces:**
- Consumes: `CashfreeGatewayService.verifyWebhookSignature` (Task 5).
- Produces: `PaymentsService.processCashfreeWebhook(rawBody: Buffer, signature: string | undefined, timestamp: string | undefined): Promise<void>` — never throws for expected failure modes (invalid signature, unknown order, amount mismatch); always records a `WebhookEvent` row. `POST /api/v1/payments/cashfree/webhook` (public, no guard).

Reference (from Task 5): webhook payload shape `{ type: 'PAYMENT_SUCCESS_WEBHOOK' | 'PAYMENT_FAILED_WEBHOOK' | 'PAYMENT_USER_DROPPED_WEBHOOK' | 'PAYMENT_CHARGES_WEBHOOK', event_time, data: { order: { order_id, order_amount, order_currency }, payment: { cf_payment_id, payment_status, payment_amount, payment_currency, payment_message, payment_method } } }`.

- [ ] **Step 1: Write the controller**

```ts
// cloud/api/src/modules/payments/cashfree-webhook.controller.ts
import { Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { PaymentsService } from './payments.service';

@Controller('api/v1/payments/cashfree/webhook')
export class CashfreeWebhookController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  @HttpCode(200)
  async handle(
    @Req() request: Request,
    @Headers('x-webhook-signature') signature: string | undefined,
    @Headers('x-webhook-timestamp') timestamp: string | undefined
  ) {
    // main.ts registers a path-scoped raw() parser for this route so
    // request.body is a Buffer in production; the test harness (which does
    // not run bootstrap()'s raw() registration) sends a JSON body that lands
    // here as an already-parsed object, so both shapes are normalized here.
    const rawBody = Buffer.isBuffer(request.body) ? request.body : Buffer.from(JSON.stringify(request.body ?? {}), 'utf8');
    await this.payments.processCashfreeWebhook(rawBody, signature, timestamp);
    return { received: true };
  }
}
```

- [ ] **Step 2: Add `processCashfreeWebhook` to `PaymentsService`**

Append to `cloud/api/src/modules/payments/payments.service.ts` (inside the `PaymentsService` class, and add `import { randomUUID } from 'crypto';` if not already imported from Task 7 — it already is):

```ts
  async processCashfreeWebhook(rawBody: Buffer, signature: string | undefined, timestamp: string | undefined): Promise<void> {
    const signatureValid = Boolean(signature && timestamp && this.cashfree.verifyWebhookSignature(rawBody, timestamp, signature));

    if (!signatureValid) {
      await this.prisma.runAsPlatform((tx) =>
        tx.webhookEvent.create({
          data: {
            provider: 'CASHFREE',
            providerEventKey: `INVALID:${randomUUID()}`,
            eventType: 'UNKNOWN',
            rawPayload: this.safeParseJson(rawBody),
            signatureValid: false,
            processingStatus: 'FAILED',
            errorMessage: 'Invalid or missing webhook signature'
          }
        })
      );
      return;
    }

    const payload = JSON.parse(rawBody.toString('utf8'));
    const eventType: string = payload.type;
    const cfPaymentId: string | undefined = payload.data?.payment?.cf_payment_id;
    const providerOrderId: string | undefined = payload.data?.order?.order_id;
    const providerEventKey = `${eventType}:${cfPaymentId ?? providerOrderId ?? randomUUID()}`;

    const existing = await this.prisma.runAsPlatform((tx) =>
      tx.webhookEvent.findUnique({ where: { provider_providerEventKey: { provider: 'CASHFREE', providerEventKey } } })
    );
    if (existing) {
      await this.prisma.runAsPlatform((tx) =>
        tx.webhookEvent.update({ where: { id: existing.id }, data: { retryCount: { increment: 1 }, processingStatus: 'IGNORED_DUPLICATE' } })
      );
      return;
    }

    const webhookEvent = await this.prisma.runAsPlatform((tx) =>
      tx.webhookEvent.create({
        data: { provider: 'CASHFREE', providerEventKey, eventType, rawPayload: payload, signatureValid: true, processingStatus: 'VERIFIED' }
      })
    );

    if (!providerOrderId) {
      await this.markWebhookFailed(webhookEvent.id, 'Missing order_id in webhook payload');
      return;
    }

    const payment = await this.prisma.runAsPlatform((tx) =>
      tx.paymentTransaction.findUnique({ where: { provider_providerOrderId: { provider: 'CASHFREE', providerOrderId } } })
    );
    if (!payment) {
      await this.markWebhookFailed(webhookEvent.id, `No PaymentTransaction found for providerOrderId ${providerOrderId}`);
      return;
    }

    await this.prisma.runAsPlatform((tx) => tx.webhookEvent.update({ where: { id: webhookEvent.id }, data: { restaurantId: payment.restaurantId } }));

    const RELEVANT_TYPES = ['PAYMENT_SUCCESS_WEBHOOK', 'PAYMENT_FAILED_WEBHOOK', 'PAYMENT_USER_DROPPED_WEBHOOK'];
    if (!RELEVANT_TYPES.includes(eventType)) {
      await this.markWebhookProcessed(webhookEvent.id);
      return;
    }

    const orderAmountRupees = payload.data?.order?.order_amount;
    const orderCurrency = payload.data?.order?.order_currency;
    const receivedAmountPaise = typeof orderAmountRupees === 'number' ? Math.round(orderAmountRupees * 100) : null;

    if (receivedAmountPaise === null || receivedAmountPaise !== payment.amount || orderCurrency !== payment.currency) {
      await this.markWebhookFailed(webhookEvent.id, `Amount/currency mismatch: expected ${payment.amount} ${payment.currency}, got ${receivedAmountPaise} ${orderCurrency}`);
      return;
    }

    const TERMINAL_STATUSES = ['SUCCESS', 'REFUNDED', 'PARTIALLY_REFUNDED'];
    if (TERMINAL_STATUSES.includes(payment.status)) {
      await this.markWebhookProcessed(webhookEvent.id);
      return;
    }

    const newStatus = eventType === 'PAYMENT_SUCCESS_WEBHOOK' ? 'SUCCESS' : eventType === 'PAYMENT_USER_DROPPED_WEBHOOK' ? 'USER_DROPPED' : 'FAILED';

    await this.prisma.runAsTenant(payment.restaurantId, async (tx) => {
      await tx.paymentTransaction.update({
        where: { id: payment.id },
        data: {
          status: newStatus,
          providerPaymentId: cfPaymentId,
          providerResponse: payload as unknown as Prisma.InputJsonValue,
          failureReason: newStatus === 'SUCCESS' ? null : (payload.data?.payment?.payment_message ?? null),
          paidAt: newStatus === 'SUCCESS' ? new Date() : null
        }
      });
      await tx.order.update({ where: { id: payment.orderId }, data: { status: newStatus === 'SUCCESS' ? 'PAID' : 'PAYMENT_FAILED' } });
      await tx.restaurantPaymentConnection.updateMany({
        where: { restaurantId: payment.restaurantId },
        data: { lastWebhookAt: new Date(), ...(newStatus === 'SUCCESS' ? { lastPaymentAt: new Date() } : {}) }
      });
    });

    await this.markWebhookProcessed(webhookEvent.id);
  }

  private async markWebhookProcessed(id: string): Promise<void> {
    await this.prisma.runAsPlatform((tx) => tx.webhookEvent.update({ where: { id }, data: { processingStatus: 'PROCESSED', processedAt: new Date() } }));
  }

  private async markWebhookFailed(id: string, errorMessage: string): Promise<void> {
    await this.prisma.runAsPlatform((tx) => tx.webhookEvent.update({ where: { id }, data: { processingStatus: 'FAILED', errorMessage, processedAt: new Date() } }));
  }

  private safeParseJson(rawBody: Buffer): Prisma.InputJsonValue {
    try {
      return JSON.parse(rawBody.toString('utf8'));
    } catch {
      return { unparsable: true };
    }
  }
```

- [ ] **Step 3: Register the webhook controller in the module**

In `cloud/api/src/modules/payments/payments.module.ts`, add `import { CashfreeWebhookController } from './cashfree-webhook.controller';` and add `CashfreeWebhookController` to the `controllers` array.

- [ ] **Step 4: Write the e2e test**

```ts
// cloud/api/test/payments-webhook.e2e.spec.ts
import { createHmac } from 'crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

const WEBHOOK_SECRET = 'test-webhook-secret-for-e2e';

describe('Cashfree webhook processing', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-webhook-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;
  let restaurantId: string;
  let orderId: string;
  let paymentId: string;
  const providerOrderId = `pay_${Date.now()}`;

  const authed = (method: 'get' | 'post', url: string, token: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  const signedRequest = (payload: object) => {
    const rawBody = JSON.stringify(payload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac('sha256', WEBHOOK_SECRET).update(timestamp + rawBody).digest('base64');
    return request(app.getHttpServer())
      .post('/api/v1/payments/cashfree/webhook')
      .set('x-webhook-signature', signature)
      .set('x-webhook-timestamp', timestamp)
      .send(payload);
  };

  const successPayload = (amountRupees: number) => ({
    type: 'PAYMENT_SUCCESS_WEBHOOK',
    event_time: new Date().toISOString(),
    data: {
      order: { order_id: providerOrderId, order_amount: amountRupees, order_currency: 'INR' },
      payment: { cf_payment_id: 'cf_pay_1', payment_status: 'SUCCESS', payment_amount: amountRupees, payment_currency: 'INR', payment_method: { upi: {} } }
    }
  });

  beforeAll(async () => {
    process.env.CASHFREE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });

    const loginRes = await request(app.getHttpServer()).post('/api/v1/platform-auth/login').send({ email: adminEmail, password: adminPassword });
    platformToken = loginRes.body.accessToken;

    const restaurantRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Webhook Restaurant ${Date.now()}`, ownerName: 'Webhook Owner', ownerEmail: `webhook-owner-${Date.now()}@test.example.com`
    });
    restaurantId = restaurantRes.body.restaurant.id;

    await prisma.runAsTenant(restaurantId, (tx) => tx.restaurantPaymentConnection.create({ data: { restaurantId, status: 'ACTIVE' } }));

    const order = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.order.create({
        data: { restaurantId, externalOrderId: 'webhook-test-order-1', items: [], subtotal: 20000, taxAmount: 1000, totalAmount: 21000, status: 'PENDING_PAYMENT' }
      })
    );
    orderId = order.id;
    const payment = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.create({ data: { orderId, restaurantId, providerOrderId, amount: 21000, currency: 'INR', status: 'PENDING' } })
    );
    paymentId = payment.id;
  });

  afterAll(async () => {
    delete process.env.CASHFREE_WEBHOOK_SECRET;
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('rejects a webhook with an invalid signature and leaves the payment untouched', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/payments/cashfree/webhook')
      .set('x-webhook-signature', 'not-a-real-signature')
      .set('x-webhook-timestamp', String(Math.floor(Date.now() / 1000)))
      .send(successPayload(210));
    expect(res.status).toBe(200); // always 200 once durably recorded — Cashfree should not retry a permanently invalid signature

    const payment = await prisma.runAsPlatform((tx) => tx.paymentTransaction.findUniqueOrThrow({ where: { id: paymentId } }));
    expect(payment.status).toBe('PENDING');

    const events = await prisma.runAsPlatform((tx) => tx.webhookEvent.findMany({ where: { signatureValid: false } }));
    expect(events.length).toBeGreaterThan(0);
  });

  it('rejects a webhook whose amount does not match the stored payment', async () => {
    const res = await signedRequest(successPayload(999));
    expect(res.status).toBe(200);

    const payment = await prisma.runAsPlatform((tx) => tx.paymentTransaction.findUniqueOrThrow({ where: { id: paymentId } }));
    expect(payment.status).toBe('PENDING');
  });

  it('a valid PAYMENT_SUCCESS_WEBHOOK marks the payment SUCCESS and the order PAID', async () => {
    const res = await signedRequest(successPayload(210));
    expect(res.status).toBe(200);

    const payment = await prisma.runAsPlatform((tx) => tx.paymentTransaction.findUniqueOrThrow({ where: { id: paymentId } }));
    expect(payment.status).toBe('SUCCESS');
    expect(payment.providerPaymentId).toBe('cf_pay_1');
    expect(payment.paidAt).not.toBeNull();

    const order = await prisma.runAsPlatform((tx) => tx.order.findUniqueOrThrow({ where: { id: orderId } }));
    expect(order.status).toBe('PAID');

    const connection = await prisma.runAsPlatform((tx) => tx.restaurantPaymentConnection.findUniqueOrThrow({ where: { restaurantId } }));
    expect(connection.lastWebhookAt).not.toBeNull();
    expect(connection.lastPaymentAt).not.toBeNull();
  });

  it('a duplicate delivery of the same event is ignored and does not reprocess', async () => {
    const before = await prisma.runAsPlatform((tx) => tx.paymentTransaction.findUniqueOrThrow({ where: { id: paymentId } }));
    const res = await signedRequest(successPayload(210));
    expect(res.status).toBe(200);
    const after = await prisma.runAsPlatform((tx) => tx.paymentTransaction.findUniqueOrThrow({ where: { id: paymentId } }));
    expect(after.updatedAt).toEqual(before.updatedAt);
  });

  it('an unknown order_id is recorded as a failed WebhookEvent without throwing', async () => {
    const res = await signedRequest({
      type: 'PAYMENT_SUCCESS_WEBHOOK',
      event_time: new Date().toISOString(),
      data: { order: { order_id: 'pay_does_not_exist', order_amount: 100, order_currency: 'INR' }, payment: { cf_payment_id: 'cf_ghost', payment_status: 'SUCCESS', payment_amount: 100, payment_currency: 'INR' } }
    });
    expect(res.status).toBe(200);

    const events = await prisma.runAsPlatform((tx) => tx.webhookEvent.findMany({ where: { errorMessage: { contains: 'pay_does_not_exist' } } }));
    expect(events.length).toBe(1);
    expect(events[0].processingStatus).toBe('FAILED');
  });
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd cloud/api && npx vitest run test/payments-webhook.e2e.spec.ts`
Expected: PASS (5/5)

- [ ] **Step 6: Commit**

```bash
git add cloud/api/src/modules/payments cloud/api/test/payments-webhook.e2e.spec.ts
git commit -m "feat(payments): add idempotent, signature-verified Cashfree webhook processing"
```

---

## Task 11: Full suite + typecheck

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `cd cloud/api && npx vitest run`
Expected: every suite passes, including the 5 new/modified files from this plan alongside all pre-existing e2e suites (confirms nothing in this plan regressed `activation-redeem`, `backups`, `tenant-auth`, `platform-auth`, `restaurants`, `licensing`, `saas-modules`, `billing-applications-support`).

- [ ] **Step 2: Run the typecheck**

Run: `cd cloud/api && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Confirm `AppModule` wiring**

Run: `cd cloud/api && npx ts-node -e "import('./src/app.module').then(() => console.log('AppModule loads OK'))"`
Expected: prints `AppModule loads OK` (catches any circular-import or missing-provider mistake before a real boot attempt).

- [ ] **Step 4: Commit (only if any fixes were needed in this task)**

```bash
git add -A
git commit -m "fix(payments): resolve issues found by full suite/typecheck run"
```

(Skip this commit if Steps 1–3 all passed cleanly with no changes.)

---

## Self-Review Notes

**Spec coverage:** MenuSnapshotItem (Task 6), Order/PaymentTransaction backend-computed pricing (Task 7), payment-status API (Task 7/8), credential encryption (Task 1), CashfreeGatewayService incl. Easy Split account model (Task 5), webhook verification/idempotency/amount-currency checks (Task 10), RLS on every table (Task 2), env vars (Task 3), main.ts raw body (Task 9) — every Phase 1 spec section has a task. Refund/onboarding/Super-Admin/kiosk-UI endpoints are explicitly Non-goals in the spec and correctly have no task here.

**Placeholder scan:** no TBD/TODO; every step has real, complete code; no "similar to Task N" references — Task 8 explicitly reuses Task 7's already-written `getPaymentStatus` rather than describing it abstractly.

**Type consistency:** `PaymentTransactionStatus` values (`CREATED`/`PENDING`/.../`SUCCESS`/`FAILED`/`USER_DROPPED`) used identically in Task 2 (schema), Task 7 (`NON_TERMINAL_STATUSES`), and Task 10 (`TERMINAL_STATUSES`, `newStatus` assignment). `providerOrderId` generation (`pay_${randomUUID()}`, Task 7) matches the lookup key Task 10's webhook handler queries by (`provider_providerOrderId`). `MenuSnapshotItemLookup` shape (Task 4) matches exactly what Task 7 constructs from `MenuSyncService.loadItemsByExternalIds`'s Prisma rows (Task 6).
