# Cashfree Payment Connection Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a restaurant submit settlement/KYC details via Kiosk Admin and let Super Admin review/approve them, actually creating a real Cashfree Easy Split vendor on approval.

**Architecture:** Extends Phase 1's existing `cloud/api/src/modules/payments/` module (schema, one service, two controllers — tenant-facing and platform-facing) and adds two new frontend surfaces following each app's own established conventions exactly (Kiosk Admin: a new card in the existing Settings tab; Super Admin: a new list page matching `ActivationKeysListPage.tsx`'s pattern).

**Tech Stack:** NestJS + Prisma (backend, unchanged), React (both frontends, unchanged), no new dependencies anywhere.

**Spec:** `docs/superpowers/specs/2026-09-10-cashfree-payment-connection-onboarding-design.md`

## Global Constraints

- Money/security conventions carried from Phase 1: settlement account numbers are encrypted via `credential-encryption.util.ts` before storage, never returned decrypted in any API response (not even to the submitting restaurant — once encrypted, the plaintext is never sent back over the wire again).
- Platform-facing (Super Admin) responses mask `pan`/`gst`/`cin`/`uidai`/account number to last-4-digits only — never the full value.
- `restaurantId` on tenant-facing endpoints comes from `TenantAuthGuard`'s `@CurrentTenantUser()`, never the request body.
- Approval only ever transitions `PENDING_VERIFICATION` → `ACTIVE`, and only after a real, successful `CashfreeGatewayService.createVendor()` call — never a silent/partial success.
- Suspend/Reactivate/Disconnect are JAMANVAAR-internal status flips only — no Cashfree API call (Phase 1's order-creation endpoint already gates on this internal status).
- **Do not use `prisma migrate diff --shadow-database-url` against the real `DATABASE_URL`** — an earlier session used this incorrectly and it reset/wiped the local dev database (schema and all row data) because the "shadow" target resolved to the same real database instead of a separate empty one. Task 1 below applies its migration via a hand-written SQL file executed directly with `psql`, the same safe method Phase 1's Task 2 used successfully.
- `business_type`'s exact valid Cashfree enum values are not documented anywhere found during research — it is collected and sent as free text, not validated against a guessed enum.

---

## Task 1: Schema migration + CashfreeGatewayService vendor methods

**Files:**
- Modify: `cloud/api/prisma/schema.prisma`
- Create: `cloud/api/prisma/migrations/<timestamp>_payment_connection_kyc_fields/migration.sql`
- Modify: `cloud/api/src/modules/payments/cashfree-gateway.service.ts`
- Modify: `cloud/api/src/modules/payments/cashfree-gateway.service.spec.ts`

**Interfaces:**
- Produces: Prisma fields `RestaurantPaymentConnection.accountType/businessType/pan/gst/cin/uidai/contactName/contactEmail/contactPhone/cashfreeVendorStatus` and enum `CashfreeAccountType` (`BUSINESS`/`INDIVIDUAL`); `CashfreeGatewayService.createVendor(input: CreateCashfreeVendorInput): Promise<CashfreeVendorResult>` and `.getVendorStatus(vendorId: string): Promise<CashfreeVendorResult>` — all consumed by Task 2/3's `PaymentConnectionsService`.

- [ ] **Step 1: Add the schema changes**

In `cloud/api/prisma/schema.prisma`, add this enum near the other `Payment*`/`Cashfree*`-adjacent enums (e.g. right before `model RestaurantPaymentConnection`):

```prisma
enum CashfreeAccountType {
  BUSINESS
  INDIVIDUAL
}
```

Add these fields to the existing `model RestaurantPaymentConnection` (anywhere inside the model body — e.g. right after the existing `cashfreeVendorId` line):

```prisma
  accountType           CashfreeAccountType?
  businessType          String? // free text, passed through to Cashfree verbatim — see plan's Global Constraints
  pan                    String?
  gst                    String?
  cin                    String?
  uidai                  String? // Aadhar, stored as String (not a number) to avoid precision/leading-zero loss
  contactName            String?
  contactEmail           String?
  contactPhone           String?
  cashfreeVendorStatus   String? // Cashfree's own async verification status (IN_BENE_CREATION/ACTIVE/ACTION_REQUIRED/...), distinct from our own `status` field
```

- [ ] **Step 2: Write the migration SQL by hand**

Create `cloud/api/prisma/migrations/20260910120000_payment_connection_kyc_fields/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "CashfreeAccountType" AS ENUM ('BUSINESS', 'INDIVIDUAL');

-- AlterTable
ALTER TABLE "RestaurantPaymentConnection"
  ADD COLUMN "accountType" "CashfreeAccountType",
  ADD COLUMN "businessType" TEXT,
  ADD COLUMN "pan" TEXT,
  ADD COLUMN "gst" TEXT,
  ADD COLUMN "cin" TEXT,
  ADD COLUMN "uidai" TEXT,
  ADD COLUMN "contactName" TEXT,
  ADD COLUMN "contactEmail" TEXT,
  ADD COLUMN "contactPhone" TEXT,
  ADD COLUMN "cashfreeVendorStatus" TEXT;
```

(The timestamp in the directory name doesn't need to match exactly — Prisma just needs a unique, chronologically-later name than the existing migrations.)

- [ ] **Step 3: Apply the migration directly via psql**

Run `npx prisma validate` from `cloud/api/` first to confirm the schema itself parses.

Read `DATABASE_URL` from `cloud/api/.env` and apply the migration file directly:

```bash
psql "<DATABASE_URL value, with the ?schema=public query param stripped>" -v ON_ERROR_STOP=1 -f prisma/migrations/20260910120000_payment_connection_kyc_fields/migration.sql
```

This is a pure additive change (one new enum, ten new nullable columns) — there is no data-loss risk and no need for `--accept-data-loss` or `db push`. Do NOT use `prisma migrate diff --shadow-database-url` for this (see Global Constraints).

Then run `npx prisma generate` to regenerate the client.

- [ ] **Step 4: Verify the new fields are live**

Write a throwaway script (delete after use, never commit) that connects via `PrismaService` and confirms `prisma.restaurantPaymentConnection` accepts the new fields on a create/read — e.g. create a throwaway `Restaurant` + `RestaurantPaymentConnection` with `accountType: 'BUSINESS'`, read it back, confirm the field round-trips, then delete both rows.

- [ ] **Step 5: Add `createVendor`/`getVendorStatus` to `CashfreeGatewayService`**

In `cloud/api/src/modules/payments/cashfree-gateway.service.ts`, add these interfaces after the existing `CashfreeRefundResult` interface:

```ts
export interface CreateCashfreeVendorInput {
  vendorId: string; // alphanumeric/underscore only — a raw UUID's hyphens are rejected by Cashfree
  status: 'ACTIVE' | 'BLOCKED' | 'DELETED';
  name: string;
  email: string;
  phone: string;
  kycDetails: {
    accountType: 'BUSINESS' | 'INDIVIDUAL';
    businessType?: string;
    pan: string;
    gst?: string;
    cin?: string;
    uidai?: string;
  };
  bank?: { accountNumber: string; accountHolder: string; ifsc: string };
  upi?: { vpa: string; accountHolder: string };
}

export interface CashfreeVendorResult {
  vendorId: string;
  status: string;
}
```

Add these methods inside the `CashfreeGatewayService` class, after `verifyWebhookSignature`:

```ts
  async createVendor(input: CreateCashfreeVendorInput): Promise<CashfreeVendorResult> {
    const res = await fetch(`${this.baseUrl()}/easy-split/vendors`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        vendor_id: input.vendorId,
        status: input.status,
        name: input.name,
        email: input.email,
        phone: input.phone,
        kyc_details: {
          account_type: input.kycDetails.accountType,
          ...(input.kycDetails.businessType ? { business_type: input.kycDetails.businessType } : {}),
          pan: input.kycDetails.pan,
          ...(input.kycDetails.gst ? { gst: input.kycDetails.gst } : {}),
          ...(input.kycDetails.cin ? { cin: input.kycDetails.cin } : {}),
          ...(input.kycDetails.uidai ? { uidai: input.kycDetails.uidai } : {})
        },
        ...(input.bank
          ? { bank: { account_number: input.bank.accountNumber, account_holder: input.bank.accountHolder, ifsc: input.bank.ifsc } }
          : {}),
        ...(input.upi ? { upi: { vpa: input.upi.vpa, account_holder: input.upi.accountHolder } } : {})
      })
    });
    const body = await res.json();
    if (!res.ok) {
      throw new ServiceUnavailableException(`Cashfree vendor creation failed: ${body?.message ?? res.statusText}`);
    }
    return { vendorId: body.vendor_id, status: body.status };
  }

  async getVendorStatus(vendorId: string): Promise<CashfreeVendorResult> {
    const res = await fetch(`${this.baseUrl()}/easy-split/vendors/${encodeURIComponent(vendorId)}`, {
      method: 'GET',
      headers: this.headers()
    });
    const body = await res.json();
    if (!res.ok) {
      throw new ServiceUnavailableException(`Cashfree vendor lookup failed: ${body?.message ?? res.statusText}`);
    }
    return { vendorId: body.vendor_id, status: body.status };
  }
```

- [ ] **Step 6: Write tests for the two new methods**

Append to `cloud/api/src/modules/payments/cashfree-gateway.service.spec.ts` (reusing the existing file's `buildService`/`CONFIGURED_ENV` helpers):

```ts
  it('createVendor posts to the easy-split vendors endpoint with correct field mapping', async () => {
    const service = await buildService(CONFIGURED_ENV);
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ vendor_id: 'rest_abc123', status: 'IN_BENE_CREATION' }), { status: 200 })
    );

    const result = await service.createVendor({
      vendorId: 'rest_abc123',
      status: 'ACTIVE',
      name: 'Demo Restaurant',
      email: 'owner@demo.jamanvaar.app',
      phone: '9876543210',
      kycDetails: { accountType: 'BUSINESS', businessType: 'Restaurant', pan: 'ABCDE1234F' },
      bank: { accountNumber: '1234567890', accountHolder: 'Demo Restaurant', ifsc: 'HDFC0000001' }
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://sandbox.cashfree.com/pg/easy-split/vendors');
    const body = JSON.parse(init!.body as string);
    expect(body.vendor_id).toBe('rest_abc123');
    expect(body.kyc_details.account_type).toBe('BUSINESS');
    expect(body.kyc_details.pan).toBe('ABCDE1234F');
    expect(body.bank.account_number).toBe('1234567890');
    expect(body.upi).toBeUndefined();
    expect(result.vendorId).toBe('rest_abc123');
    expect(result.status).toBe('IN_BENE_CREATION');
  });

  it('getVendorStatus fetches the vendor by id', async () => {
    const service = await buildService(CONFIGURED_ENV);
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ vendor_id: 'rest_abc123', status: 'ACTIVE' }), { status: 200 })
    );

    const result = await service.getVendorStatus('rest_abc123');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://sandbox.cashfree.com/pg/easy-split/vendors/rest_abc123',
      expect.objectContaining({ method: 'GET' })
    );
    expect(result.status).toBe('ACTIVE');
  });
```

- [ ] **Step 7: Run tests**

Run: `cd cloud/api && npx vitest run src/modules/payments/cashfree-gateway.service.spec.ts`
Expected: PASS (9/9 — 7 existing + 2 new)

- [ ] **Step 8: Commit**

```bash
git add cloud/api/prisma/schema.prisma cloud/api/prisma/migrations cloud/api/src/modules/payments/cashfree-gateway.service.ts cloud/api/src/modules/payments/cashfree-gateway.service.spec.ts
git commit -m "feat(payments): add payment-connection KYC schema fields and Cashfree vendor API client methods"
```

---

## Task 2: Tenant-facing submission (Kiosk Admin backend)

**Files:**
- Create: `cloud/api/src/modules/payments/dto/payment-connection.dto.ts`
- Create: `cloud/api/src/modules/payments/payment-connections.service.ts`
- Create: `cloud/api/src/modules/payments/kiosk-payment-connection.controller.ts`
- Modify: `cloud/api/src/modules/payments/payments.module.ts`
- Test: `cloud/api/test/payment-connections.e2e.spec.ts`

**Interfaces:**
- Consumes: `CashfreeGatewayService` (Task 1), `credential-encryption.util.ts` (Phase 1, existing), `AuditService` (existing).
- Produces: `PaymentConnectionsService.submit(restaurantId, dto)`, `.getOwn(restaurantId)` — consumed by this task's controller now, and by Task 3's platform controller (same service file, extended there). `POST`/`GET api/v1/tenant/payment-connection` (TenantAuthGuard).

- [ ] **Step 1: Write the DTO**

```ts
// cloud/api/src/modules/payments/dto/payment-connection.dto.ts
import { z } from 'zod';

export const submitPaymentConnectionSchema = z
  .object({
    accountType: z.enum(['BUSINESS', 'INDIVIDUAL']),
    businessType: z.string().trim().min(1).optional(),
    pan: z.string().trim().min(1),
    gst: z.string().trim().optional(),
    cin: z.string().trim().optional(),
    uidai: z.string().trim().optional(),
    contactName: z.string().trim().min(1),
    contactEmail: z.string().trim().toLowerCase().email(),
    contactPhone: z.string().trim().min(8).max(12),
    settlementAccountName: z.string().trim().min(1).optional(),
    settlementAccountNumber: z.string().trim().min(1).optional(),
    settlementIfsc: z.string().trim().min(1).optional(),
    settlementUpiVpa: z.string().trim().min(1).optional()
  })
  .refine(
    (data) =>
      Boolean(data.settlementUpiVpa) ||
      Boolean(data.settlementAccountNumber && data.settlementIfsc && data.settlementAccountName),
    { message: 'Provide either a UPI VPA, or a settlement account name + account number + IFSC' }
  );
export type SubmitPaymentConnectionDto = z.infer<typeof submitPaymentConnectionSchema>;
```

- [ ] **Step 2: Write the service (tenant-facing methods)**

```ts
// cloud/api/src/modules/payments/payment-connections.service.ts
import { ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformUser } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CashfreeGatewayService } from './cashfree-gateway.service';
import { encryptCredential, decryptCredential } from '../../common/security/credential-encryption.util';
import { SubmitPaymentConnectionDto } from './dto/payment-connection.dto';

const RESUBMITTABLE_STATUSES = ['NOT_CONNECTED', 'PENDING_VERIFICATION', 'DISCONNECTED'];

function maskLast4(value: string | null | undefined): string | null {
  if (!value) return null;
  return `•••• ${value.slice(-4)}`;
}

@Injectable()
export class PaymentConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly cashfree: CashfreeGatewayService,
    private readonly audit: AuditService
  ) {}

  private encryptionKey(): string {
    const key = this.config.get<string>('PAYMENT_CREDENTIAL_ENCRYPTION_KEY');
    if (!key) {
      throw new ServiceUnavailableException('PAYMENT_CREDENTIAL_ENCRYPTION_KEY is not configured on this server');
    }
    return key;
  }

  async submit(restaurantId: string, dto: SubmitPaymentConnectionDto) {
    return this.prisma.runAsTenant(restaurantId, async (tx) => {
      const existing = await tx.restaurantPaymentConnection.findUnique({ where: { restaurantId } });
      if (existing && !RESUBMITTABLE_STATUSES.includes(existing.status)) {
        throw new ForbiddenException(
          `Cannot resubmit while the connection is ${existing.status} — contact Super Admin to disconnect first.`
        );
      }

      const data = {
        accountType: dto.accountType,
        businessType: dto.businessType ?? null,
        pan: dto.pan,
        gst: dto.gst ?? null,
        cin: dto.cin ?? null,
        uidai: dto.uidai ?? null,
        contactName: dto.contactName,
        contactEmail: dto.contactEmail,
        contactPhone: dto.contactPhone,
        settlementAccountName: dto.settlementAccountName ?? null,
        settlementAccountNumberEncrypted: dto.settlementAccountNumber
          ? encryptCredential(dto.settlementAccountNumber, this.encryptionKey())
          : null,
        settlementIfsc: dto.settlementIfsc ?? null,
        settlementUpiVpa: dto.settlementUpiVpa ?? null,
        status: 'PENDING_VERIFICATION' as const
      };

      const connection = await tx.restaurantPaymentConnection.upsert({
        where: { restaurantId },
        create: { restaurantId, ...data },
        update: data
      });

      await this.audit.log(
        {
          actorType: 'TENANT',
          restaurantId,
          action: 'PAYMENT_CONNECTION_SUBMITTED',
          category: 'PAYMENTS',
          details: { connectionId: connection.id }
        },
        tx
      );

      return this.toOwnView(connection);
    });
  }

  async getOwn(restaurantId: string) {
    const connection = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.restaurantPaymentConnection.findUnique({ where: { restaurantId } })
    );
    if (!connection) return { status: 'NOT_CONNECTED' as const };
    return this.toOwnView(connection);
  }

  private toOwnView(connection: {
    status: string;
    accountType: string | null;
    businessType: string | null;
    pan: string | null;
    gst: string | null;
    cin: string | null;
    uidai: string | null;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    settlementAccountName: string | null;
    settlementIfsc: string | null;
    settlementUpiVpa: string | null;
    cashfreeVendorId: string | null;
    verifiedAt: Date | null;
  }) {
    // Deliberately never includes the settlement account number, even
    // decrypted for its own owner — once encrypted at submission time, the
    // plaintext is never sent back over the wire again.
    return {
      status: connection.status,
      accountType: connection.accountType,
      businessType: connection.businessType,
      pan: connection.pan,
      gst: connection.gst,
      cin: connection.cin,
      uidai: connection.uidai,
      contactName: connection.contactName,
      contactEmail: connection.contactEmail,
      contactPhone: connection.contactPhone,
      settlementAccountName: connection.settlementAccountName,
      settlementIfsc: connection.settlementIfsc,
      settlementUpiVpa: connection.settlementUpiVpa,
      cashfreeVendorId: connection.cashfreeVendorId,
      verifiedAt: connection.verifiedAt
    };
  }
}
```

(`maskLast4` and `decryptCredential`/`ServiceUnavailableException`/`NotFoundException`/`PlatformUser` imports are unused by this task's own methods but ARE needed by Task 3, which extends this same file — leave them in place; do not remove as "unused" mid-task.)

- [ ] **Step 3: Write the controller**

```ts
// cloud/api/src/modules/payments/kiosk-payment-connection.controller.ts
import { Body, Controller, Get, Post, UseGuards, UsePipes } from '@nestjs/common';
import { User } from '@prisma/client';
import { PaymentConnectionsService } from './payment-connections.service';
import { submitPaymentConnectionSchema, SubmitPaymentConnectionDto } from './dto/payment-connection.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard';
import { CurrentTenantUser } from '../../common/decorators/current-tenant-user.decorator';

@Controller('api/v1/tenant/payment-connection')
@UseGuards(TenantAuthGuard)
export class KioskPaymentConnectionController {
  constructor(private readonly connections: PaymentConnectionsService) {}

  @Get()
  getOwn(@CurrentTenantUser() user: User) {
    return this.connections.getOwn(user.restaurantId);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(submitPaymentConnectionSchema))
  submit(@Body() body: SubmitPaymentConnectionDto, @CurrentTenantUser() user: User) {
    return this.connections.submit(user.restaurantId, body);
  }
}
```

No extra role check beyond the guard: Sub-project A's Kiosk Admin login already restricts every session reaching this endpoint to `OWNER`/`MANAGER` (`adminOnly: true` at login) — this endpoint deliberately doesn't re-implement that check.

- [ ] **Step 4: Wire the module**

In `cloud/api/src/modules/payments/payments.module.ts`, add `AuditModule` to imports and register the new controller/service:

```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { MenuSyncController } from './menu-sync.controller';
import { MenuSyncService } from './menu-sync.service';
import { PaymentOrdersController } from './payment-orders.controller';
import { CashfreeWebhookController } from './cashfree-webhook.controller';
import { KioskPaymentConnectionController } from './kiosk-payment-connection.controller';
import { PaymentsService } from './payments.service';
import { CashfreeGatewayService } from './cashfree-gateway.service';
import { PaymentConnectionsService } from './payment-connections.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [MenuSyncController, PaymentOrdersController, CashfreeWebhookController, KioskPaymentConnectionController],
  providers: [PaymentsService, CashfreeGatewayService, MenuSyncService, PaymentConnectionsService],
  exports: [PaymentsService, CashfreeGatewayService]
})
export class PaymentsModule {}
```

(Task 3 will add `PlatformPaymentConnectionsController` to this same `controllers` array — don't remove anything added here.)

- [ ] **Step 5: Write the e2e test**

```ts
// cloud/api/test/payment-connections.e2e.spec.ts
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Payment connection onboarding', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-payconn-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;
  let restaurantId: string;
  let ownerToken: string;

  const authed = (method: 'get' | 'post' | 'patch', url: string, token: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  const validSubmission = {
    accountType: 'BUSINESS',
    businessType: 'Restaurant',
    pan: 'ABCDE1234F',
    contactName: 'Demo Owner',
    contactEmail: 'owner@demo.example.com',
    contactPhone: '9876543210',
    settlementAccountName: 'Demo Restaurant',
    settlementAccountNumber: '1234567890',
    settlementIfsc: 'HDFC0000001'
  };

  beforeAll(async () => {
    process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });

    const loginRes = await request(app.getHttpServer()).post('/api/v1/platform-auth/login').send({ email: adminEmail, password: adminPassword });
    platformToken = loginRes.body.accessToken;

    const ownerEmail = `pay-connection-owner-${Date.now()}@test.example.com`;
    const ownerPassword = 'owner-correct-horse-battery';
    const restaurantRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Pay Connection Restaurant ${Date.now()}`,
      ownerName: 'Pay Connection Owner',
      ownerEmail
    });
    restaurantId = restaurantRes.body.restaurant.id;
    const activationToken = restaurantRes.body.activationToken;

    await request(app.getHttpServer()).post('/api/v1/tenant-auth/set-initial-password').send({
      restaurantId, email: ownerEmail, activationToken, newPassword: ownerPassword
    });
    const ownerLoginRes = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/login')
      .send({ restaurantId, email: ownerEmail, password: ownerPassword });
    ownerToken = ownerLoginRes.body.accessToken;
  });

  afterAll(async () => {
    delete process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY;
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('GET returns NOT_CONNECTED when nothing has been submitted yet', async () => {
    const res = await authed('get', '/api/v1/tenant/payment-connection', ownerToken);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('NOT_CONNECTED');
  });

  it('rejects a submission with neither bank nor UPI details', async () => {
    const res = await authed('post', '/api/v1/tenant/payment-connection', ownerToken).send({
      accountType: 'BUSINESS', pan: 'ABCDE1234F', contactName: 'X', contactEmail: 'x@example.com', contactPhone: '9876543210'
    });
    expect(res.status).toBe(400);
  });

  it('accepts a UPI-only submission and moves status to PENDING_VERIFICATION', async () => {
    const res = await authed('post', '/api/v1/tenant/payment-connection', ownerToken).send({
      accountType: 'INDIVIDUAL', pan: 'ABCDE1234F', contactName: 'X', contactEmail: 'x@example.com', contactPhone: '9876543210',
      settlementUpiVpa: 'demo@upi'
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING_VERIFICATION');
    expect(res.body.settlementUpiVpa).toBe('demo@upi');
  });

  it('accepts a full bank submission, overwriting the prior UPI-only one while still PENDING_VERIFICATION', async () => {
    const res = await authed('post', '/api/v1/tenant/payment-connection', ownerToken).send(validSubmission);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING_VERIFICATION');
    expect(res.body.settlementAccountName).toBe('Demo Restaurant');
    // Never returns the raw/decrypted account number, even to its own owner.
    expect(JSON.stringify(res.body)).not.toContain('1234567890');
  });

  it('GET now reflects the submitted PENDING_VERIFICATION connection', async () => {
    const res = await authed('get', '/api/v1/tenant/payment-connection', ownerToken);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PENDING_VERIFICATION');
    expect(res.body.pan).toBe('ABCDE1234F');
  });

  it('the settlement account number is actually encrypted at rest, not stored in plaintext', async () => {
    const row = await prisma.runAsPlatform((tx) => tx.restaurantPaymentConnection.findUniqueOrThrow({ where: { restaurantId } }));
    expect(row.settlementAccountNumberEncrypted).not.toBe('1234567890');
    expect(row.settlementAccountNumberEncrypted).toContain(':'); // credential-encryption.util's iv:authTag:ciphertext format
  });
});
```

- [ ] **Step 6: Run tests**

Run: `cd cloud/api && npx vitest run test/payment-connections.e2e.spec.ts`
Expected: PASS (6/6)

- [ ] **Step 7: Commit**

```bash
git add cloud/api/src/modules/payments/dto/payment-connection.dto.ts cloud/api/src/modules/payments/payment-connections.service.ts cloud/api/src/modules/payments/kiosk-payment-connection.controller.ts cloud/api/src/modules/payments/payments.module.ts cloud/api/test/payment-connections.e2e.spec.ts
git commit -m "feat(payments): add tenant-facing payment-connection submission endpoint"
```

---

## Task 3: Platform-facing review/approval (Super Admin backend)

**Files:**
- Modify: `cloud/api/src/modules/payments/payment-connections.service.ts` (append)
- Create: `cloud/api/src/modules/payments/platform-payment-connections.controller.ts`
- Modify: `cloud/api/src/modules/payments/payments.module.ts`
- Test: `cloud/api/test/payment-connections.e2e.spec.ts` (extend)

**Interfaces:**
- Consumes: `PaymentConnectionsService` (Task 2, same file, extended here), `CashfreeGatewayService.createVendor`/`.getVendorStatus` (Task 1).
- Produces: `PaymentConnectionsService.listForPlatform()`, `.getForPlatform(restaurantId)`, `.approve/.suspend/.reactivate/.disconnect(restaurantId, actor)`, `.refreshStatus(restaurantId)` — consumed by this task's controller. `GET api/v1/payment-connections`, `GET/PATCH api/v1/restaurants/:id/payment-connection[/approve|/suspend|/reactivate|/disconnect|/refresh-status]` (PlatformAuthGuard) — consumed by Task 5's Super Admin frontend.

- [ ] **Step 1: Append the platform-facing methods to the service**

Append to `cloud/api/src/modules/payments/payment-connections.service.ts` (inside the `PaymentConnectionsService` class, after `getOwn`/`toOwnView`):

```ts
  async listForPlatform() {
    return this.prisma.runAsPlatform(async (tx) => {
      const connections = await tx.restaurantPaymentConnection.findMany({
        include: { restaurant: { select: { id: true, name: true } } },
        orderBy: { updatedAt: 'desc' }
      });
      return connections.map((c) => this.toPlatformView(c));
    });
  }

  async getForPlatform(restaurantId: string) {
    const connection = await this.prisma.runAsPlatform((tx) =>
      tx.restaurantPaymentConnection.findUnique({
        where: { restaurantId },
        include: { restaurant: { select: { id: true, name: true } } }
      })
    );
    if (!connection) throw new NotFoundException('No payment connection for this restaurant');
    return this.toPlatformView(connection);
  }

  async approve(restaurantId: string, actor: PlatformUser) {
    return this.prisma.runAsPlatform(async (tx) => {
      const connection = await tx.restaurantPaymentConnection.findUnique({ where: { restaurantId } });
      if (!connection) throw new NotFoundException('No payment connection for this restaurant');
      if (connection.status !== 'PENDING_VERIFICATION') {
        throw new ForbiddenException(`Cannot approve a connection in status ${connection.status}`);
      }
      if (!connection.pan || !connection.accountType || !connection.contactName || !connection.contactEmail || !connection.contactPhone) {
        throw new ForbiddenException('Submission is incomplete — missing required KYC/contact fields');
      }

      const vendorId = `rest_${restaurantId.replace(/-/g, '')}`;
      const bank =
        connection.settlementAccountNumberEncrypted && connection.settlementIfsc && connection.settlementAccountName
          ? {
              accountNumber: decryptCredential(connection.settlementAccountNumberEncrypted, this.encryptionKey()),
              accountHolder: connection.settlementAccountName,
              ifsc: connection.settlementIfsc
            }
          : undefined;
      const upi =
        !bank && connection.settlementUpiVpa
          ? { vpa: connection.settlementUpiVpa, accountHolder: connection.settlementAccountName ?? connection.contactName }
          : undefined;

      const result = await this.cashfree.createVendor({
        vendorId,
        status: 'ACTIVE',
        name: connection.contactName,
        email: connection.contactEmail,
        phone: connection.contactPhone,
        kycDetails: {
          accountType: connection.accountType as 'BUSINESS' | 'INDIVIDUAL',
          businessType: connection.businessType ?? undefined,
          pan: connection.pan,
          gst: connection.gst ?? undefined,
          cin: connection.cin ?? undefined,
          uidai: connection.uidai ?? undefined
        },
        bank,
        upi
      });

      const updated = await tx.restaurantPaymentConnection.update({
        where: { restaurantId },
        data: { status: 'ACTIVE', cashfreeVendorId: result.vendorId, cashfreeVendorStatus: result.status, verifiedAt: new Date() }
      });

      await this.audit.log(
        { actorType: 'PLATFORM', actorId: actor.id, restaurantId, action: 'PAYMENT_CONNECTION_APPROVED', category: 'PAYMENTS', details: { vendorId: result.vendorId } },
        tx
      );

      return { status: updated.status, cashfreeVendorId: updated.cashfreeVendorId };
    });
  }

  private async transitionStatus(restaurantId: string, actor: PlatformUser, allowedFrom: string[], to: string, auditAction: string) {
    return this.prisma.runAsPlatform(async (tx) => {
      const connection = await tx.restaurantPaymentConnection.findUnique({ where: { restaurantId } });
      if (!connection) throw new NotFoundException('No payment connection for this restaurant');
      if (!allowedFrom.includes(connection.status)) {
        throw new ForbiddenException(`Cannot transition from ${connection.status} to ${to}`);
      }
      const updated = await tx.restaurantPaymentConnection.update({
        where: { restaurantId },
        data: { status: to as 'NOT_CONNECTED' | 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'DISCONNECTED' }
      });
      await this.audit.log({ actorType: 'PLATFORM', actorId: actor.id, restaurantId, action: auditAction, category: 'PAYMENTS', details: {} }, tx);
      return { status: updated.status };
    });
  }

  async suspend(restaurantId: string, actor: PlatformUser) {
    return this.transitionStatus(restaurantId, actor, ['ACTIVE'], 'SUSPENDED', 'PAYMENT_CONNECTION_SUSPENDED');
  }

  async reactivate(restaurantId: string, actor: PlatformUser) {
    return this.transitionStatus(restaurantId, actor, ['SUSPENDED'], 'ACTIVE', 'PAYMENT_CONNECTION_REACTIVATED');
  }

  async disconnect(restaurantId: string, actor: PlatformUser) {
    return this.transitionStatus(restaurantId, actor, ['ACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION'], 'DISCONNECTED', 'PAYMENT_CONNECTION_DISCONNECTED');
  }

  async refreshStatus(restaurantId: string) {
    return this.prisma.runAsPlatform(async (tx) => {
      const connection = await tx.restaurantPaymentConnection.findUnique({ where: { restaurantId } });
      if (!connection) throw new NotFoundException('No payment connection for this restaurant');
      if (!connection.cashfreeVendorId) {
        throw new ForbiddenException('No Cashfree vendor exists yet for this connection — approve it first');
      }
      const result = await this.cashfree.getVendorStatus(connection.cashfreeVendorId);
      await tx.restaurantPaymentConnection.update({ where: { restaurantId }, data: { cashfreeVendorStatus: result.status } });
      return { cashfreeVendorStatus: result.status };
    });
  }

  private toPlatformView(connection: {
    id: string;
    restaurantId: string;
    restaurant: { id: string; name: string };
    status: string;
    accountType: string | null;
    businessType: string | null;
    pan: string | null;
    gst: string | null;
    cin: string | null;
    uidai: string | null;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    settlementAccountName: string | null;
    settlementAccountNumberEncrypted: string | null;
    settlementIfsc: string | null;
    settlementUpiVpa: string | null;
    cashfreeVendorId: string | null;
    cashfreeVendorStatus: string | null;
    verifiedAt: Date | null;
    lastWebhookAt: Date | null;
    lastPaymentAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    let settlementAccountNumberMasked: string | null = null;
    if (connection.settlementAccountNumberEncrypted) {
      try {
        settlementAccountNumberMasked = maskLast4(decryptCredential(connection.settlementAccountNumberEncrypted, this.encryptionKey()));
      } catch {
        // Encryption key unset/rotated, or corrupt data — degrade gracefully
        // rather than break the whole list for every restaurant.
        settlementAccountNumberMasked = '•••• (unavailable)';
      }
    }

    return {
      id: connection.id,
      restaurantId: connection.restaurantId,
      restaurant: connection.restaurant,
      status: connection.status,
      accountType: connection.accountType,
      businessType: connection.businessType,
      panMasked: maskLast4(connection.pan),
      gstMasked: maskLast4(connection.gst),
      cinMasked: maskLast4(connection.cin),
      uidaiMasked: maskLast4(connection.uidai),
      contactName: connection.contactName,
      contactEmail: connection.contactEmail,
      contactPhone: connection.contactPhone,
      settlementAccountName: connection.settlementAccountName,
      settlementAccountNumberMasked,
      settlementIfsc: connection.settlementIfsc,
      settlementUpiVpa: connection.settlementUpiVpa,
      cashfreeVendorId: connection.cashfreeVendorId,
      cashfreeVendorStatus: connection.cashfreeVendorStatus,
      verifiedAt: connection.verifiedAt,
      lastWebhookAt: connection.lastWebhookAt,
      lastPaymentAt: connection.lastPaymentAt,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt
    };
  }
```

- [ ] **Step 2: Write the controller**

```ts
// cloud/api/src/modules/payments/platform-payment-connections.controller.ts
import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { PaymentConnectionsService } from './payment-connections.service';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';

@Controller()
@UseGuards(PlatformAuthGuard)
export class PlatformPaymentConnectionsController {
  constructor(private readonly connections: PaymentConnectionsService) {}

  @Get('api/v1/payment-connections')
  list() {
    return this.connections.listForPlatform();
  }

  @Get('api/v1/restaurants/:id/payment-connection')
  detail(@Param('id') id: string) {
    return this.connections.getForPlatform(id);
  }

  @Patch('api/v1/restaurants/:id/payment-connection/approve')
  approve(@Param('id') id: string, @CurrentPlatformUser() actor: PlatformUser) {
    return this.connections.approve(id, actor);
  }

  @Patch('api/v1/restaurants/:id/payment-connection/suspend')
  suspend(@Param('id') id: string, @CurrentPlatformUser() actor: PlatformUser) {
    return this.connections.suspend(id, actor);
  }

  @Patch('api/v1/restaurants/:id/payment-connection/reactivate')
  reactivate(@Param('id') id: string, @CurrentPlatformUser() actor: PlatformUser) {
    return this.connections.reactivate(id, actor);
  }

  @Patch('api/v1/restaurants/:id/payment-connection/disconnect')
  disconnect(@Param('id') id: string, @CurrentPlatformUser() actor: PlatformUser) {
    return this.connections.disconnect(id, actor);
  }

  @Patch('api/v1/restaurants/:id/payment-connection/refresh-status')
  refreshStatus(@Param('id') id: string) {
    return this.connections.refreshStatus(id);
  }
}
```

- [ ] **Step 3: Register the controller in the module**

In `cloud/api/src/modules/payments/payments.module.ts`, add `import { PlatformPaymentConnectionsController } from './platform-payment-connections.controller';` and add it to the `controllers` array (alongside `KioskPaymentConnectionController` from Task 2).

- [ ] **Step 4: Extend the e2e test**

Append to `cloud/api/test/payment-connections.e2e.spec.ts`, inside the existing `describe` block. This requires overriding `CashfreeGatewayService` the same way Phase 1's order-creation tests did — change the file's `app = await createTestApp();` line in `beforeAll` to:

```ts
    app = await createTestApp((builder) =>
      builder.overrideProvider(CashfreeGatewayService).useValue({
        isConfigured: () => true,
        createVendor: vi.fn().mockResolvedValue({ vendorId: 'rest_mocked', status: 'IN_BENE_CREATION' }),
        getVendorStatus: vi.fn().mockResolvedValue({ vendorId: 'rest_mocked', status: 'ACTIVE' })
      })
    );
```

Add the import at the top of the file: `import { CashfreeGatewayService } from '../src/modules/payments/cashfree-gateway.service';` and `import { vi } from 'vitest';` (extend the existing `vitest` import if one exists rather than duplicating it).

Then add these test cases:

```ts
  it('platform list shows the connection with masked settlement details', async () => {
    const res = await authed('get', '/api/v1/payment-connections', platformToken);
    expect(res.status).toBe(200);
    const mine = res.body.find((c: { restaurantId: string }) => c.restaurantId === restaurantId);
    expect(mine).toBeDefined();
    expect(mine.status).toBe('PENDING_VERIFICATION');
    expect(mine.settlementAccountNumberMasked).toBe('•••• 7890');
    expect(mine.panMasked).toBe('•••• 234F');
    expect(JSON.stringify(mine)).not.toContain('1234567890');
    expect(JSON.stringify(mine)).not.toContain('ABCDE1234F');
  });

  it('platform detail matches the list entry', async () => {
    const res = await authed('get', `/api/v1/restaurants/${restaurantId}/payment-connection`, platformToken);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PENDING_VERIFICATION');
  });

  it('suspend/reactivate/disconnect are rejected from the wrong starting status', async () => {
    const suspendRes = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/suspend`, platformToken);
    expect(suspendRes.status).toBe(403); // still PENDING_VERIFICATION, not ACTIVE
  });

  it('approve calls CashfreeGatewayService.createVendor and moves the connection to ACTIVE', async () => {
    const res = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/approve`, platformToken);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ACTIVE');
    expect(res.body.cashfreeVendorId).toBe('rest_mocked');

    const row = await prisma.runAsPlatform((tx) => tx.restaurantPaymentConnection.findUniqueOrThrow({ where: { restaurantId } }));
    expect(row.status).toBe('ACTIVE');
    expect(row.verifiedAt).not.toBeNull();
  });

  it('cannot approve twice — already ACTIVE is rejected', async () => {
    const res = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/approve`, platformToken);
    expect(res.status).toBe(403);
  });

  it('cannot resubmit while ACTIVE', async () => {
    const res = await authed('post', '/api/v1/tenant/payment-connection', ownerToken).send(validSubmission);
    expect(res.status).toBe(403);
  });

  it('refresh-status calls getVendorStatus and stores the raw Cashfree status without changing our own status', async () => {
    const res = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/refresh-status`, platformToken);
    expect(res.status).toBe(200);
    expect(res.body.cashfreeVendorStatus).toBe('ACTIVE');

    const row = await prisma.runAsPlatform((tx) => tx.restaurantPaymentConnection.findUniqueOrThrow({ where: { restaurantId } }));
    expect(row.status).toBe('ACTIVE'); // unchanged — our own status is a separate concept from Cashfree's
    expect(row.cashfreeVendorStatus).toBe('ACTIVE');
  });

  it('suspend then reactivate works from ACTIVE, and disconnect works from SUSPENDED', async () => {
    const suspendRes = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/suspend`, platformToken);
    expect(suspendRes.status).toBe(200);
    expect(suspendRes.body.status).toBe('SUSPENDED');

    const reactivateRes = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/reactivate`, platformToken);
    expect(reactivateRes.status).toBe(200);
    expect(reactivateRes.body.status).toBe('ACTIVE');

    const suspendAgain = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/suspend`, platformToken);
    expect(suspendAgain.status).toBe(200);

    const disconnectRes = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/disconnect`, platformToken);
    expect(disconnectRes.status).toBe(200);
    expect(disconnectRes.body.status).toBe('DISCONNECTED');
  });

  it('can resubmit after DISCONNECTED', async () => {
    const res = await authed('post', '/api/v1/tenant/payment-connection', ownerToken).send(validSubmission);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING_VERIFICATION');
  });

  it('a tenant from another restaurant cannot see or act on this connection', async () => {
    const otherOwnerEmail = `payconn-other-owner-${Date.now()}@test.example.com`;
    const otherOwnerPassword = 'other-correct-horse-battery';
    const otherRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Other Pay Connection Restaurant ${Date.now()}`, ownerName: 'Other Owner', ownerEmail: otherOwnerEmail
    });
    const otherRestaurantId = otherRes.body.restaurant.id;
    await request(app.getHttpServer()).post('/api/v1/tenant-auth/set-initial-password').send({
      restaurantId: otherRestaurantId, email: otherOwnerEmail, activationToken: otherRes.body.activationToken, newPassword: otherOwnerPassword
    });
    const otherLoginRes = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/login')
      .send({ restaurantId: otherRestaurantId, email: otherOwnerEmail, password: otherOwnerPassword });
    const otherToken = otherLoginRes.body.accessToken;

    const res = await authed('get', '/api/v1/tenant/payment-connection', otherToken);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('NOT_CONNECTED'); // sees only their own (empty) connection, never ours

    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: otherRestaurantId } }));
  });
```

- [ ] **Step 5: Run tests**

Run: `cd cloud/api && npx vitest run test/payment-connections.e2e.spec.ts`
Expected: PASS (17/17)

- [ ] **Step 6: Run regression + typecheck**

Run: `cd cloud/api && npx vitest run test/payment-connections.e2e.spec.ts test/payments-orders.e2e.spec.ts test/tenant-auth.e2e.spec.ts && npx tsc --noEmit -p tsconfig.json`
Expected: all pass, typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add cloud/api/src/modules/payments/payment-connections.service.ts cloud/api/src/modules/payments/platform-payment-connections.controller.ts cloud/api/src/modules/payments/payments.module.ts cloud/api/test/payment-connections.e2e.spec.ts
git commit -m "feat(payments): add Super Admin payment-connection review/approval endpoints"
```

---

## Task 4: Kiosk Admin frontend — Payment Gateway settings card

**Files:**
- Modify: `apps/kiosk-system/kiosk-admin/src/cloud/cloudClient.ts`
- Modify: `apps/kiosk-system/kiosk-admin/src/App.tsx`

**Interfaces:**
- Consumes: `getTenantAccessToken()` (Sub-project A, existing) — this is the first real caller of that accessor. `api/v1/tenant/payment-connection` `GET`/`POST` (Task 2).
- Produces: `submitPaymentConnection(fields)`, `getPaymentConnection()` in `cloudClient.ts` — consumed by this task's own `App.tsx` UI.

**Important — check `App.tsx`'s git status before touching it**: this file has had unrelated, pre-existing uncommitted work in it throughout this whole project (a Hindi/Gujarati menu-translation feature). Run `git status --porcelain -- apps/kiosk-system/kiosk-admin/src/App.tsx` first. If it still shows modified, use the manual git-staging isolation technique already used twice in this project's history (extract the current HEAD version to a scratch file, apply only this task's edit there, verify the diff touches only your intended lines, `git hash-object -w` + `git update-index --cacheinfo` to stage that exact blob, commit) rather than a plain `git add`. If it's clean, a normal `git add` is fine.

- [ ] **Step 1: Add the API functions to `cloudClient.ts`**

Append to `apps/kiosk-system/kiosk-admin/src/cloud/cloudClient.ts`:

```ts
export interface PaymentConnectionFields {
  accountType: 'BUSINESS' | 'INDIVIDUAL';
  businessType?: string;
  pan: string;
  gst?: string;
  cin?: string;
  uidai?: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  settlementAccountName?: string;
  settlementAccountNumber?: string;
  settlementIfsc?: string;
  settlementUpiVpa?: string;
}

export interface PaymentConnectionStatus {
  status: 'NOT_CONNECTED' | 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'DISCONNECTED';
  accountType?: string | null;
  businessType?: string | null;
  pan?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  settlementAccountName?: string | null;
  settlementIfsc?: string | null;
  settlementUpiVpa?: string | null;
}

async function tenantFetch(path: string, init: RequestInit): Promise<Response> {
  const token = getTenantAccessToken();
  if (!token) {
    throw new CloudApiError('Not signed in', 401);
  }
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers ?? {}) }
  });
}

export async function getPaymentConnection(): Promise<PaymentConnectionStatus> {
  const res = await tenantFetch('/api/v1/tenant/payment-connection', { method: 'GET' });
  const data = await parseJsonResponse(res);
  if (!res.ok) {
    throw new CloudApiError(data?.message ?? `Failed to load payment connection (${res.status})`, res.status);
  }
  return data;
}

export async function submitPaymentConnection(fields: PaymentConnectionFields): Promise<PaymentConnectionStatus> {
  const res = await tenantFetch('/api/v1/tenant/payment-connection', { method: 'POST', body: JSON.stringify(fields) });
  const data = await parseJsonResponse(res);
  if (!res.ok) {
    throw new CloudApiError(data?.message ?? `Submission failed (${res.status})`, res.status);
  }
  return data;
}
```

(`getTenantAccessToken` and `CloudApiError` are already defined earlier in this same file from Sub-project A — no new import needed within the file itself.)

- [ ] **Step 2: Add the Payment Gateway card to the Settings tab**

Update the import line for `cloudClient` (~line 62) to include `getPaymentConnection`, `submitPaymentConnection`, and the two new type names:

```ts
import {
  connectDeviceStep1,
  connectDeviceStep2,
  isDeviceConnected,
  CloudApiError,
  staffLogin,
  staffLogout,
  isStaffLoggedIn,
  getStaffUser,
  startSilentRefresh,
  getConnectedRestaurantId,
  getPaymentConnection,
  submitPaymentConnection,
  type PaymentConnectionFields,
  type PaymentConnectionStatus
} from './cloud/cloudClient';
```

Add new state near the other Settings-tab-local state (this file's convention is plain `useState` calls near the top of the component, not per-tab-scoped state — add these alongside the existing settings-related `useState` calls):

```ts
  const [paymentConnection, setPaymentConnection] = useState<PaymentConnectionStatus | null>(null);
  const [paymentConnectionLoading, setPaymentConnectionLoading] = useState(false);
  const [paymentConnectionError, setPaymentConnectionError] = useState('');
  const [paymentFormFields, setPaymentFormFields] = useState<PaymentConnectionFields>({
    accountType: 'BUSINESS', pan: '', contactName: '', contactEmail: '', contactPhone: ''
  });
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);

  useEffect(() => {
    if (activeTab !== 'SETTINGS') return;
    setPaymentConnectionLoading(true);
    getPaymentConnection()
      .then((data) => {
        setPaymentConnection(data);
        setPaymentFormFields((prev) => ({
          ...prev,
          accountType: (data.accountType as 'BUSINESS' | 'INDIVIDUAL') ?? prev.accountType,
          businessType: data.businessType ?? prev.businessType,
          pan: data.pan ?? prev.pan,
          contactName: data.contactName ?? prev.contactName,
          contactEmail: data.contactEmail ?? prev.contactEmail,
          contactPhone: data.contactPhone ?? prev.contactPhone,
          settlementAccountName: data.settlementAccountName ?? prev.settlementAccountName,
          settlementIfsc: data.settlementIfsc ?? prev.settlementIfsc,
          settlementUpiVpa: data.settlementUpiVpa ?? prev.settlementUpiVpa
        }));
      })
      .catch((err) => setPaymentConnectionError(err instanceof CloudApiError ? err.message : 'Could not load payment connection status'))
      .finally(() => setPaymentConnectionLoading(false));
  }, [activeTab]);

  const handleSubmitPaymentConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    setPaymentSubmitting(true);
    setPaymentConnectionError('');
    try {
      const updated = await submitPaymentConnection(paymentFormFields);
      setPaymentConnection(updated);
      showToast('Payment connection details submitted for review.');
    } catch (err) {
      setPaymentConnectionError(err instanceof CloudApiError ? err.message : 'Submission failed');
    } finally {
      setPaymentSubmitting(false);
    }
  };
```

Add a new card inside the `activeTab === 'SETTINGS'` block's `<div className="space-y-6">` container, immediately after the existing "Customer Kiosk Language & Idle Timeout" card (after its closing `</div>` around line 3960 — locate the exact closing tag by reading the surrounding block, since precise line numbers may have shifted):

```tsx
              <div className="bg-white rounded-2xl p-6 border border-[#EBE6DD] shadow-sm space-y-4">
                <div>
                  <h4 className="font-bold text-[#0B253A]">Payment Gateway</h4>
                  <p className="text-xs text-[#4A5568]">
                    Connect your restaurant's own Cashfree settlement account to receive kiosk payments.
                    Your submission is reviewed by JAMANVAAR before it goes live.
                  </p>
                </div>

                {paymentConnectionLoading && <p className="text-xs text-[#4A5568]">Loading…</p>}

                {paymentConnection && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[#0B253A]">Status:</span>
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                        paymentConnection.status === 'ACTIVE'
                          ? 'bg-green-100 text-green-700'
                          : paymentConnection.status === 'PENDING_VERIFICATION'
                            ? 'bg-amber-100 text-amber-700'
                            : paymentConnection.status === 'SUSPENDED' || paymentConnection.status === 'DISCONNECTED'
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {paymentConnection.status.replace('_', ' ')}
                    </span>
                  </div>
                )}

                {paymentConnectionError && (
                  <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3.5 py-2 rounded-xl">
                    {paymentConnectionError}
                  </div>
                )}

                {(paymentConnection?.status === 'NOT_CONNECTED' ||
                  paymentConnection?.status === 'PENDING_VERIFICATION' ||
                  paymentConnection?.status === 'DISCONNECTED') && (
                  <form onSubmit={handleSubmitPaymentConnection} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-[#0B253A] mb-1">Account Type *</label>
                      <select
                        value={paymentFormFields.accountType}
                        onChange={(e) => setPaymentFormFields((p) => ({ ...p, accountType: e.target.value as 'BUSINESS' | 'INDIVIDUAL' }))}
                        className="w-full bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold"
                      >
                        <option value="BUSINESS">Business</option>
                        <option value="INDIVIDUAL">Individual</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#0B253A] mb-1">Business Type</label>
                      <input
                        type="text"
                        value={paymentFormFields.businessType ?? ''}
                        onChange={(e) => setPaymentFormFields((p) => ({ ...p, businessType: e.target.value }))}
                        placeholder="e.g. Restaurant, Proprietorship"
                        className="w-full bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#0B253A] mb-1">PAN *</label>
                      <input
                        type="text"
                        required
                        value={paymentFormFields.pan}
                        onChange={(e) => setPaymentFormFields((p) => ({ ...p, pan: e.target.value }))}
                        className="w-full bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#0B253A] mb-1">Contact Name *</label>
                      <input
                        type="text"
                        required
                        value={paymentFormFields.contactName}
                        onChange={(e) => setPaymentFormFields((p) => ({ ...p, contactName: e.target.value }))}
                        className="w-full bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#0B253A] mb-1">Contact Email *</label>
                      <input
                        type="email"
                        required
                        value={paymentFormFields.contactEmail}
                        onChange={(e) => setPaymentFormFields((p) => ({ ...p, contactEmail: e.target.value }))}
                        className="w-full bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#0B253A] mb-1">Contact Phone *</label>
                      <input
                        type="tel"
                        required
                        value={paymentFormFields.contactPhone}
                        onChange={(e) => setPaymentFormFields((p) => ({ ...p, contactPhone: e.target.value }))}
                        className="w-full bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#0B253A] mb-1">UPI VPA (or fill bank details below)</label>
                      <input
                        type="text"
                        value={paymentFormFields.settlementUpiVpa ?? ''}
                        onChange={(e) => setPaymentFormFields((p) => ({ ...p, settlementUpiVpa: e.target.value }))}
                        placeholder="restaurant@upi"
                        className="w-full bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#0B253A] mb-1">Settlement Account Name</label>
                      <input
                        type="text"
                        value={paymentFormFields.settlementAccountName ?? ''}
                        onChange={(e) => setPaymentFormFields((p) => ({ ...p, settlementAccountName: e.target.value }))}
                        className="w-full bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#0B253A] mb-1">Bank Account Number</label>
                      <input
                        type="text"
                        value={paymentFormFields.settlementAccountNumber ?? ''}
                        onChange={(e) => setPaymentFormFields((p) => ({ ...p, settlementAccountNumber: e.target.value }))}
                        className="w-full bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#0B253A] mb-1">IFSC</label>
                      <input
                        type="text"
                        value={paymentFormFields.settlementIfsc ?? ''}
                        onChange={(e) => setPaymentFormFields((p) => ({ ...p, settlementIfsc: e.target.value }))}
                        className="w-full bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <button
                        type="submit"
                        disabled={paymentSubmitting}
                        className="py-3 px-6 rounded-2xl bg-[#E66817] hover:bg-[#EA580C] text-white font-black text-xs uppercase tracking-wider disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {paymentSubmitting ? 'Submitting…' : 'Submit for Review'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
```

- [ ] **Step 3: Verify it compiles**

Run: `cd apps/kiosk-system/kiosk-admin && npx tsc --noEmit && npx vite build`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Same environment caveat as Sub-project A: if a working browser-automation tool is available, use it against the Vite dev server (with `cloud/api`'s dev server also running and this restaurant's payment-connection endpoints reachable) to confirm the card renders, the form submits, and status updates after submission. If not available in this environment, verify via `tsc`/`vite build` success and careful code review, and report honestly which was actually done — do not fabricate a browser verification that didn't happen (see Sub-project A's precedent for how to report this truthfully).

- [ ] **Step 5: Commit**

```bash
git add apps/kiosk-system/kiosk-admin/src/cloud/cloudClient.ts apps/kiosk-system/kiosk-admin/src/App.tsx
git commit -m "feat(kiosk-admin): add Payment Gateway settings card"
```

(Use the git-staging isolation technique for the `App.tsx` portion if that file still carries unrelated uncommitted content — see the note at the top of this task.)

---

## Task 5: Super Admin frontend — Payment Connections review page

**Files:**
- Modify: `cloud/super-admin-web/src/api/types.ts`
- Create: `cloud/super-admin-web/src/pages/PaymentConnections/PaymentConnectionsListPage.tsx`
- Modify: `cloud/super-admin-web/src/app/App.tsx`
- Modify: `cloud/super-admin-web/src/layout/ProtectedLayout.tsx`

**Interfaces:**
- Consumes: `api/v1/payment-connections` `GET`, `api/v1/restaurants/:id/payment-connection/[approve|suspend|reactivate|disconnect|refresh-status]` `PATCH` (Task 3).

- [ ] **Step 1: Add the `PaymentConnection` type**

Add to `cloud/super-admin-web/src/api/types.ts` (anywhere alongside the other resource interfaces, e.g. near `ActivationKey`):

```ts
export interface PaymentConnection {
  id: string;
  restaurantId: string;
  restaurant: { id: string; name: string };
  status: 'NOT_CONNECTED' | 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'DISCONNECTED';
  accountType: 'BUSINESS' | 'INDIVIDUAL' | null;
  businessType: string | null;
  panMasked: string | null;
  gstMasked: string | null;
  cinMasked: string | null;
  uidaiMasked: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  settlementAccountName: string | null;
  settlementAccountNumberMasked: string | null;
  settlementIfsc: string | null;
  settlementUpiVpa: string | null;
  cashfreeVendorId: string | null;
  cashfreeVendorStatus: string | null;
  verifiedAt: string | null;
  lastWebhookAt: string | null;
  lastPaymentAt: string | null;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Write the list page**

```tsx
// cloud/super-admin-web/src/pages/PaymentConnections/PaymentConnectionsListPage.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { PaymentConnection } from '../../api/types';
import { Badge, Button, Card, ConfirmModal, EmptyState, FilterTabs, SearchBar, SkeletonTable, statusTone } from '../../components/ui';
import { CreditCard, RefreshCw } from 'lucide-react';
import '../../components/shared.css';

type StatusFilter = 'ALL' | 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'DISCONNECTED' | 'NOT_CONNECTED';
type PendingAction = { connection: PaymentConnection; action: 'approve' | 'suspend' | 'reactivate' | 'disconnect' };

export function PaymentConnectionsListPage() {
  const [connections, setConnections] = useState<PaymentConnection[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [confirmTarget, setConfirmTarget] = useState<PendingAction | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .get<PaymentConnection[]>('/api/v1/payment-connections')
      .then((data) => setConnections(data))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load payment connections'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const filtered = useMemo(() => {
    if (!connections) return [];
    return connections.filter((c) => {
      if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!c.restaurant.name.toLowerCase().includes(q) && !(c.contactEmail ?? '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [connections, statusFilter, search]);

  const countsByStatus = useMemo(() => {
    const counts: Record<string, number> = {};
    connections?.forEach((c) => { counts[c.status] = (counts[c.status] ?? 0) + 1; });
    return counts;
  }, [connections]);

  async function handleExecuteAction() {
    if (!confirmTarget) return;
    setActionPending(true);
    try {
      await api.patch(`/api/v1/restaurants/${confirmTarget.connection.restaurantId}/payment-connection/${confirmTarget.action}`);
      showToast(`${confirmTarget.connection.restaurant.name}: ${confirmTarget.action} succeeded`);
      setConfirmTarget(null);
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : `${confirmTarget.action} failed`);
    } finally {
      setActionPending(false);
    }
  }

  async function handleRefreshStatus(c: PaymentConnection) {
    setRefreshingId(c.id);
    try {
      await api.patch(`/api/v1/restaurants/${c.restaurantId}/payment-connection/refresh-status`);
      showToast(`${c.restaurant.name}: Cashfree status refreshed`);
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Refresh failed');
    } finally {
      setRefreshingId(null);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Payment Gateways</h1>
          <p className="page-subtitle">Review and approve restaurants' Cashfree settlement connections.</p>
        </div>
      </div>

      {error && (
        <div className="page-error" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={load}>Retry</Button>
        </div>
      )}

      {toast && (
        <div style={{ padding: '10px 16px', background: '#0B253A', color: '#fff', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
          {toast}
        </div>
      )}

      <div className="toolbar" style={{ marginTop: 12 }}>
        <SearchBar value={search} onChange={setSearch} placeholder="Search by restaurant or contact email…" width="340px" />
        <FilterTabs<StatusFilter>
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { id: 'ALL', label: 'All', count: connections?.length },
            { id: 'PENDING_VERIFICATION', label: 'Pending Review', count: countsByStatus.PENDING_VERIFICATION },
            { id: 'ACTIVE', label: 'Active', count: countsByStatus.ACTIVE },
            { id: 'SUSPENDED', label: 'Suspended', count: countsByStatus.SUSPENDED },
            { id: 'DISCONNECTED', label: 'Disconnected', count: countsByStatus.DISCONNECTED }
          ]}
        />
        <div className="spacer" />
        <span className="muted" style={{ fontSize: 13 }}>{filtered.length} of {connections?.length ?? 0}</span>
      </div>

      {loading && !connections && <SkeletonTable rows={5} cols={6} />}

      {connections && (
        <Card>
          {filtered.length === 0 ? (
            <EmptyState
              icon={<CreditCard className="w-6 h-6 text-slate-400" />}
              title={connections.length === 0 ? 'No payment connections yet' : 'No matching connections'}
              description="Restaurants submit their settlement details from Kiosk Admin's Payment Gateway settings."
            />
          ) : (
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Restaurant</th>
                    <th>Status</th>
                    <th>Contact</th>
                    <th>Settlement</th>
                    <th>Cashfree</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link to={`/restaurants/${c.restaurantId}`} className="table-link" style={{ fontWeight: 600 }}>
                          {c.restaurant.name}
                        </Link>
                      </td>
                      <td>
                        <Badge tone={statusTone(c.status)}>{c.status.replace('_', ' ')}</Badge>
                      </td>
                      <td>
                        <div style={{ fontSize: 12 }}>{c.contactName ?? '—'}</div>
                        <div className="muted" style={{ fontSize: 11 }}>{c.contactEmail ?? ''}</div>
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {c.settlementUpiVpa ? c.settlementUpiVpa : c.settlementAccountNumberMasked ? `${c.settlementAccountNumberMasked} (${c.settlementIfsc ?? ''})` : '—'}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {c.cashfreeVendorId ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span>{c.cashfreeVendorStatus ?? 'unknown'}</span>
                            <Button size="sm" variant="ghost" icon={<RefreshCw className="w-3 h-3" />} disabled={refreshingId === c.id} onClick={() => handleRefreshStatus(c)} title="Refresh Cashfree status" />
                          </div>
                        ) : '—'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {c.status === 'PENDING_VERIFICATION' && (
                            <Button size="sm" variant="accent" onClick={() => setConfirmTarget({ connection: c, action: 'approve' })}>Approve</Button>
                          )}
                          {c.status === 'ACTIVE' && (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => setConfirmTarget({ connection: c, action: 'suspend' })}>Suspend</Button>
                              <Button size="sm" variant="danger" onClick={() => setConfirmTarget({ connection: c, action: 'disconnect' })}>Disconnect</Button>
                            </>
                          )}
                          {c.status === 'SUSPENDED' && (
                            <>
                              <Button size="sm" variant="accent" onClick={() => setConfirmTarget({ connection: c, action: 'reactivate' })}>Reactivate</Button>
                              <Button size="sm" variant="danger" onClick={() => setConfirmTarget({ connection: c, action: 'disconnect' })}>Disconnect</Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {confirmTarget && (
        <ConfirmModal
          isOpen={true}
          title={`${confirmTarget.action[0].toUpperCase()}${confirmTarget.action.slice(1)} payment connection?`}
          message={
            confirmTarget.action === 'approve'
              ? `This creates a real Cashfree vendor for "${confirmTarget.connection.restaurant.name}" and lets their kiosk start accepting payments.`
              : `This will ${confirmTarget.action} "${confirmTarget.connection.restaurant.name}"'s payment connection.`
          }
          tone={confirmTarget.action === 'disconnect' ? 'danger' : 'default'}
          isPending={actionPending}
          onConfirm={handleExecuteAction}
          onClose={() => setConfirmTarget(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Register the route and sidebar entry**

In `cloud/super-admin-web/src/app/App.tsx`, add the import `import { PaymentConnectionsListPage } from '../pages/PaymentConnections/PaymentConnectionsListPage';` and add this route inside the `<Route element={<ProtectedLayout />}>` block, alongside the other resource routes (e.g. right after the `/activation-keys` route):

```tsx
              <Route path="/payment-connections" element={page('PaymentConnectionsList', <PaymentConnectionsListPage />)} />
```

In `cloud/super-admin-web/src/layout/ProtectedLayout.tsx`, add a sidebar nav entry in the same array that contains the `/activation-keys` entry (around line 87):

```ts
      { to: '/payment-connections', label: 'Payment Gateways', icon: CreditCard },
```

(Add `CreditCard` to this file's existing `lucide-react` import if it isn't already imported there.)

- [ ] **Step 4: Verify it compiles and builds**

Run: `cd cloud/super-admin-web && npx tsc --noEmit && npx vite build` (check `package.json` for the exact script names first; use whatever this app's own `build`/`typecheck` scripts are if they differ from a bare `tsc`/`vite build` invocation).
Expected: no errors.

- [ ] **Step 5: Manual verification**

Same as Task 4's Step 4 — use a browser-automation tool against this app's dev server if available (with the backend from Tasks 1-3 running, a `PENDING_VERIFICATION` connection seeded via Task 2's e2e test path or manually), confirming the list renders, filters work, and Approve/Suspend/Reactivate/Disconnect/Refresh Status each call through correctly and the list refreshes afterward. Report honestly what was actually verified if the tool isn't available in this environment.

- [ ] **Step 6: Commit**

```bash
git add cloud/super-admin-web/src/api/types.ts cloud/super-admin-web/src/pages/PaymentConnections cloud/super-admin-web/src/app/App.tsx cloud/super-admin-web/src/layout/ProtectedLayout.tsx
git commit -m "feat(super-admin): add Payment Connections review/approval page"
```

## Self-Review Notes

**Spec coverage:** schema/CashfreeGatewayService (Task 1), tenant submission with resubmission rules and encryption (Task 2), platform review/approve/suspend/reactivate/disconnect/refresh-status with masking (Task 3), Kiosk Admin UI (Task 4), Super Admin UI (Task 5) — every spec section has a task. Non-goals (no Cashfree call on suspend/reactivate, no background polling, no document upload) correctly have no corresponding task.

**Placeholder scan:** no TBD/TODO; every step has complete code. Task 4/5's manual-verification steps explicitly instruct honest reporting rather than fabricated success, matching Sub-project A's established precedent for this exact environment limitation.

**Type consistency:** `SubmitPaymentConnectionDto` (Task 2) fields match exactly what Task 4's `PaymentConnectionFields` interface sends and what Task 2/3's `toOwnView`/`toPlatformView` read back. `CreateCashfreeVendorInput`/`CashfreeVendorResult` (Task 1) match exactly how Task 3's `approve`/`refreshStatus` call `this.cashfree.createVendor`/`.getVendorStatus`. `PaymentConnection` (Task 5's frontend type) matches `toPlatformView`'s exact return shape (Task 3) field-for-field.
