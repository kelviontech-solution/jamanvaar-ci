# Real WhatsApp / SMS E-Bill Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded `GATEWAY_CONFIGURED = false` stub and POS's fully-fake "sent!" toast with a real, template-driven WhatsApp Cloud API / MSG91 SMS send, routed through a new cloud/api endpoint that holds the provider secrets server-side.

**Architecture:** A new `cloud/api` module (`notifications`) wraps the real WhatsApp Cloud API and MSG91 Flow API behind a device-authed `POST /api/v1/receipts/send` endpoint. `packages/api`'s `EBillService` takes an injected `sendFn` instead of checking a hardcoded flag, so it stays framework-agnostic. Each Tauri app's own `cloudClient.ts` supplies that `sendFn` via its existing device-token fetch helper.

**Tech Stack:** NestJS + Zod (backend), TypeScript (packages/api, shared across kiosk-user/kiosk-admin/POS), Vitest (both backend e2e and packages/api unit tests).

**Spec:** `docs/superpowers/specs/2026-09-12-real-ebill-delivery-design.md`

## Global Constraints

- Real sends require a pre-approved WhatsApp template and a DLT-registered MSG91 SMS flow, configured entirely via server env vars (`WHATSAPP_CLOUD_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANGUAGE`, `WHATSAPP_API_VERSION`, `MSG91_AUTH_KEY`, `MSG91_SMS_FLOW_ID`, `MSG91_SENDER_ID`) — no template content is created by this plan.
- `templateParams` is always `[order.orderNumber, order.tokenNumber, formatINR(order.totalAmount)]`, in that exact order, for both channels — this is an external contract the restaurant's real templates must match.
- No provider secret is ever sent to or stored in any Tauri app bundle. All provider calls happen inside `cloud/api`.
- An unconfigured server (missing env vars) is a 503 (`ServiceUnavailableException`); a configured-but-provider-rejected send is a 200 with `{ success: false, errorMessage }` — these are different failure classes and must not be conflated.
- No rate limiting, no new Prisma model, no server-side persistence of send attempts (per spec Non-goals).

---

### Task 1: Backend — `NotificationGatewayService` + `POST /api/v1/receipts/send`

**Files:**
- Create: `cloud/api/src/modules/notifications/notification-gateway.service.ts`
- Create: `cloud/api/src/modules/notifications/dto/send-receipt.dto.ts`
- Create: `cloud/api/src/modules/notifications/receipts.controller.ts`
- Create: `cloud/api/src/modules/notifications/notifications.module.ts`
- Modify: `cloud/api/src/app.module.ts`
- Test: `cloud/api/test/receipts.e2e.spec.ts`

**Interfaces:**
- Consumes: `DeviceAuthGuard` (existing, `cloud/api/src/common/guards/device-auth.guard.ts`), `CurrentDevice` decorator (existing, `cloud/api/src/common/decorators/current-device.decorator.ts`), `ZodValidationPipe` (existing, `cloud/api/src/common/pipes/zod-validation.pipe.ts`).
- Produces: `NotificationGatewayService.sendWhatsAppTemplate(input: SendWhatsAppTemplateInput): Promise<NotificationSendResult>`, `NotificationGatewayService.sendSms(input: SendSmsInput): Promise<NotificationSendResult>`, and the HTTP route `POST /api/v1/receipts/send` with body `{ channel: 'WHATSAPP'|'SMS', phoneNumber: string, templateParams: string[] }` returning `NotificationSendResult` (`{ success: boolean; providerMessageId?: string; errorMessage?: string }`) — Task 2's frontend work calls this route, not these TypeScript symbols directly.

- [ ] **Step 1: Write the failing e2e tests**

Create `cloud/api/test/receipts.e2e.spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestApp, createTestPlatformUser } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationGatewayService } from '../src/modules/notifications/notification-gateway.service';

describe('Receipt e-bill delivery', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-receipts-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;
  let restaurantId: string;
  let kioskToken: string;
  let posToken: string;
  let kdsToken: string;
  let sendWhatsAppMock: ReturnType<typeof vi.fn>;
  let sendSmsMock: ReturnType<typeof vi.fn>;

  const authed = (method: 'get' | 'post', url: string, token: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    sendWhatsAppMock = vi.fn().mockResolvedValue({ success: true, providerMessageId: 'wamid.mock123' });
    sendSmsMock = vi.fn().mockResolvedValue({ success: true, providerMessageId: 'msg91-mock-req-id' });
    app = await createTestApp((builder) =>
      builder.overrideProvider(NotificationGatewayService).useValue({
        sendWhatsAppTemplate: sendWhatsAppMock,
        sendSms: sendSmsMock
      })
    );
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });

    const loginRes = await request(app.getHttpServer()).post('/api/v1/platform-auth/login').send({ email: adminEmail, password: adminPassword });
    platformToken = loginRes.body.accessToken;

    const restaurantRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Receipts Restaurant ${Date.now()}`, ownerName: 'Receipts Owner', ownerEmail: `receipts-owner-${Date.now()}@test.example.com`
    });
    restaurantId = restaurantRes.body.restaurant.id;

    const planRes = await authed('post', '/api/v1/plans', platformToken).send({
      tier: 'PRO', name: `TEST Receipts Plan ${Date.now()}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: { kiosk: true }
    });
    await authed('post', '/api/v1/subscriptions', platformToken).send({
      restaurantId, planId: planRes.body.id, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });

    const kioskKeyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId, allowedDeviceType: 'KIOSK', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const kioskRedeemRes = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: kioskKeyRes.body.code, deviceType: 'KIOSK' });
    kioskToken = kioskRedeemRes.body.deviceToken;

    const posKeyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId, allowedDeviceType: 'POS', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const posRedeemRes = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: posKeyRes.body.code, deviceType: 'POS' });
    posToken = posRedeemRes.body.deviceToken;

    const kdsKeyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId, allowedDeviceType: 'KDS', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const kdsRedeemRes = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: kdsKeyRes.body.code, deviceType: 'KDS' });
    kdsToken = kdsRedeemRes.body.deviceToken;
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('a KIOSK device can send a WhatsApp receipt', async () => {
    const res = await authed('post', '/api/v1/receipts/send', kioskToken).send({
      channel: 'WHATSAPP', phoneNumber: '9876543210', templateParams: ['ORD-1', '108', 'Rs. 252.00']
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true, providerMessageId: 'wamid.mock123' });
    expect(sendWhatsAppMock).toHaveBeenCalledWith({ phoneNumber: '9876543210', templateParams: ['ORD-1', '108', 'Rs. 252.00'] });
  });

  it('a POS device can send an SMS receipt', async () => {
    const res = await authed('post', '/api/v1/receipts/send', posToken).send({
      channel: 'SMS', phoneNumber: '9876543210', templateParams: ['ORD-2', '109', 'Rs. 100.00']
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true, providerMessageId: 'msg91-mock-req-id' });
  });

  it('rejects an invalid phone number before calling the gateway', async () => {
    const res = await authed('post', '/api/v1/receipts/send', kioskToken).send({
      channel: 'WHATSAPP', phoneNumber: '12345', templateParams: ['ORD-3', '110', 'Rs. 50.00']
    });
    expect(res.status).toBe(400);
  });

  it('a KDS device cannot send a receipt (403)', async () => {
    const res = await authed('post', '/api/v1/receipts/send', kdsToken).send({
      channel: 'WHATSAPP', phoneNumber: '9876543210', templateParams: ['ORD-4', '111', 'Rs. 75.00']
    });
    expect(res.status).toBe(403);
  });

  it('a gateway rejection surfaces as 200 with success:false, not a 500', async () => {
    sendWhatsAppMock.mockResolvedValueOnce({ success: false, errorMessage: 'Template not approved' });
    const res = await authed('post', '/api/v1/receipts/send', kioskToken).send({
      channel: 'WHATSAPP', phoneNumber: '9876543210', templateParams: ['ORD-5', '112', 'Rs. 90.00']
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: false, errorMessage: 'Template not approved' });
  });

  it('no device token at all is rejected 401', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/receipts/send').send({
      channel: 'WHATSAPP', phoneNumber: '9876543210', templateParams: ['ORD-6', '113', 'Rs. 60.00']
    });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd cloud/api && npx vitest run test/receipts.e2e.spec.ts`
Expected: FAIL — `Cannot POST /api/v1/receipts/send` (404), since the module doesn't exist yet.

- [ ] **Step 3: Write `notification-gateway.service.ts`**

```typescript
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SendWhatsAppTemplateInput {
  phoneNumber: string;
  templateParams: string[];
}

export interface SendSmsInput {
  phoneNumber: string;
  templateParams: string[];
}

export interface NotificationSendResult {
  success: boolean;
  providerMessageId?: string;
  errorMessage?: string;
}

@Injectable()
export class NotificationGatewayService {
  constructor(private readonly config: ConfigService) {}

  isWhatsAppConfigured(): boolean {
    return Boolean(
      this.config.get<string>('WHATSAPP_CLOUD_API_TOKEN') &&
        this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID') &&
        this.config.get<string>('WHATSAPP_TEMPLATE_NAME')
    );
  }

  isSmsConfigured(): boolean {
    return Boolean(
      this.config.get<string>('MSG91_AUTH_KEY') && this.config.get<string>('MSG91_SMS_FLOW_ID')
    );
  }

  async sendWhatsAppTemplate(input: SendWhatsAppTemplateInput): Promise<NotificationSendResult> {
    if (!this.isWhatsAppConfigured()) {
      throw new ServiceUnavailableException(
        'WhatsApp is not configured on this server (set WHATSAPP_CLOUD_API_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TEMPLATE_NAME, and optionally WHATSAPP_TEMPLATE_LANGUAGE / WHATSAPP_API_VERSION)'
      );
    }
    const phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    const version = this.config.get<string>('WHATSAPP_API_VERSION') ?? 'v21.0';
    const res = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.get<string>('WHATSAPP_CLOUD_API_TOKEN')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: input.phoneNumber,
        type: 'template',
        template: {
          name: this.config.get<string>('WHATSAPP_TEMPLATE_NAME'),
          language: { code: this.config.get<string>('WHATSAPP_TEMPLATE_LANGUAGE') ?? 'en' },
          components: [
            {
              type: 'body',
              parameters: input.templateParams.map((text) => ({ type: 'text', text }))
            }
          ]
        }
      })
    });
    const body = await res.json();
    if (!res.ok) {
      return { success: false, errorMessage: body?.error?.message ?? `WhatsApp send failed (${res.status})` };
    }
    return { success: true, providerMessageId: body?.messages?.[0]?.id };
  }

  async sendSms(input: SendSmsInput): Promise<NotificationSendResult> {
    if (!this.isSmsConfigured()) {
      throw new ServiceUnavailableException(
        'SMS is not configured on this server (set MSG91_AUTH_KEY, MSG91_SMS_FLOW_ID, and optionally MSG91_SENDER_ID)'
      );
    }
    const recipient: Record<string, string> = { mobiles: input.phoneNumber };
    input.templateParams.forEach((value, i) => {
      recipient[`VAR${i + 1}`] = value;
    });
    const res = await fetch('https://api.msg91.com/api/v5/flow/', {
      method: 'POST',
      headers: { authkey: this.config.get<string>('MSG91_AUTH_KEY')!, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        flow_id: this.config.get<string>('MSG91_SMS_FLOW_ID'),
        sender: this.config.get<string>('MSG91_SENDER_ID') ?? undefined,
        recipients: [recipient]
      })
    });
    const body = await res.json();
    if (body?.type !== 'success') {
      return { success: false, errorMessage: body?.message ?? `SMS send failed (${res.status})` };
    }
    return { success: true, providerMessageId: body.message };
  }
}
```

- [ ] **Step 4: Write `dto/send-receipt.dto.ts`**

```typescript
import { z } from 'zod';

export const sendReceiptSchema = z.object({
  channel: z.enum(['WHATSAPP', 'SMS']),
  phoneNumber: z.string().regex(/^(\+?91)?[6-9]\d{9}$/, 'Must be a 10-digit Indian mobile number, optionally prefixed with +91'),
  templateParams: z.array(z.string().max(200)).min(0).max(10)
});

export type SendReceiptDto = z.infer<typeof sendReceiptSchema>;
```

- [ ] **Step 5: Write `receipts.controller.ts`**

```typescript
import { Body, Controller, ForbiddenException, Post, UseGuards, UsePipes } from '@nestjs/common';
import { Device } from '@prisma/client';
import { NotificationGatewayService } from './notification-gateway.service';
import { sendReceiptSchema, SendReceiptDto } from './dto/send-receipt.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { CurrentDevice } from '../../common/decorators/current-device.decorator';

@Controller('api/v1/receipts')
@UseGuards(DeviceAuthGuard)
export class ReceiptsController {
  constructor(private readonly notifications: NotificationGatewayService) {}

  @Post('send')
  @UsePipes(new ZodValidationPipe(sendReceiptSchema))
  async send(@Body() body: SendReceiptDto, @CurrentDevice() device: Device) {
    if (!['KIOSK', 'KIOSK_ADMIN', 'POS', 'POS_ADMIN'].includes(device.type)) {
      throw new ForbiddenException('This device type cannot send receipts');
    }
    if (body.channel === 'WHATSAPP') {
      return this.notifications.sendWhatsAppTemplate({ phoneNumber: body.phoneNumber, templateParams: body.templateParams });
    }
    return this.notifications.sendSms({ phoneNumber: body.phoneNumber, templateParams: body.templateParams });
  }
}
```

- [ ] **Step 6: Write `notifications.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ReceiptsController } from './receipts.controller';
import { NotificationGatewayService } from './notification-gateway.service';

@Module({
  controllers: [ReceiptsController],
  providers: [NotificationGatewayService]
})
export class NotificationsModule {}
```

- [ ] **Step 7: Register the module in `app.module.ts`**

In `cloud/api/src/app.module.ts`, add the import next to the existing `import { PaymentsModule } from './modules/payments/payments.module';` line:

```typescript
import { NotificationsModule } from './modules/notifications/notifications.module';
```

Add `NotificationsModule` to the `imports` array, next to `PaymentsModule`.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd cloud/api && npx vitest run test/receipts.e2e.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 9: Run the full backend test suite to confirm no regressions**

Run: `cd cloud/api && npm test`
Expected: PASS (all suites).

- [ ] **Step 10: Commit**

```bash
git add cloud/api/src/modules/notifications cloud/api/src/app.module.ts cloud/api/test/receipts.e2e.spec.ts
git commit -m "feat(notifications): add real WhatsApp Cloud API / MSG91 e-bill send endpoint"
```

---

### Task 2: `packages/api` — inject a real send function into `EBillService`

**Files:**
- Modify: `packages/api/src/services/ebill.ts`
- Test: `tests/ebill.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 directly (this task defines the client-side contract; Task 3 wires the actual HTTP call).
- Produces: `export type SendReceiptFn = (channel: 'WHATSAPP' | 'SMS', phoneNumber: string, templateParams: string[]) => Promise<{ success: boolean; providerMessageId?: string; errorMessage?: string }>`; `EBillService.sendWhatsAppEBill(order: Order, phoneNumber: string, config: ReceiptConfig, sendFn: SendReceiptFn)`; `EBillService.sendSmsEBill(order: Order, phoneNumber: string, sendFn: SendReceiptFn)` — Task 4 (kiosk-user) and Task 5 (POS) call these with their own `sendFn`.

- [ ] **Step 1: Write the failing unit tests**

Replace the two "honest failure" tests in `tests/ebill.test.ts` (currently lines 87-103) with:

```typescript
  it('sends a real WhatsApp e-bill when the injected send function succeeds', async () => {
    const sendFn = vi.fn().mockResolvedValue({ success: true, providerMessageId: 'wamid.123' });
    const res = await EBillService.sendWhatsAppEBill(mockOrder, '9876543210', mockReceiptConfig, sendFn);
    expect(res.success).toBe(true);
    expect(res.record.deliveryStatus).toBe('SENT');
    expect(res.record.recipient).toBe('******3210');
    // content is still the human-readable formatted text for the admin's
    // receipt history — it is not the literal WhatsApp template payload sent.
    expect(res.record.content).toContain('ORDER #ORD-99');
    expect(sendFn).toHaveBeenCalledWith('WHATSAPP', '9876543210', ['ORD-99', '108', expect.stringContaining('252')]);
  });

  it('reports a real provider failure for WhatsApp e-bill when the injected send function fails', async () => {
    const sendFn = vi.fn().mockResolvedValue({ success: false, errorMessage: 'Template not approved by Meta' });
    const res = await EBillService.sendWhatsAppEBill(mockOrder, '9876543210', mockReceiptConfig, sendFn);
    expect(res.success).toBe(false);
    expect(res.record.deliveryStatus).toBe('FAILED');
    expect(res.record.errorMessage).toBe('Template not approved by Meta');
  });

  it('reports a connectivity failure for WhatsApp e-bill when the injected send function throws', async () => {
    const sendFn = vi.fn().mockRejectedValue(new Error('Network unreachable'));
    const res = await EBillService.sendWhatsAppEBill(mockOrder, '9876543210', mockReceiptConfig, sendFn);
    expect(res.success).toBe(false);
    expect(res.record.deliveryStatus).toBe('FAILED');
    expect(res.record.errorMessage).toBe('Network unreachable');
  });

  it('sends a real SMS e-bill when the injected send function succeeds', async () => {
    const sendFn = vi.fn().mockResolvedValue({ success: true, providerMessageId: 'msg91-req-1' });
    const res = await EBillService.sendSmsEBill(mockOrder, '9876543210', sendFn);
    expect(res.success).toBe(true);
    expect(res.record.deliveryStatus).toBe('SENT');
    expect(sendFn).toHaveBeenCalledWith('SMS', '9876543210', ['ORD-99', '108', expect.stringContaining('252')]);
  });

  it('reports a real provider failure for SMS e-bill when the injected send function fails', async () => {
    const sendFn = vi.fn().mockResolvedValue({ success: false, errorMessage: 'DLT template mismatch' });
    const res = await EBillService.sendSmsEBill(mockOrder, '9876543210', sendFn);
    expect(res.success).toBe(false);
    expect(res.record.deliveryStatus).toBe('FAILED');
    expect(res.record.errorMessage).toBe('DLT template mismatch');
  });
```

Add `vi` to the existing `import { describe, expect, it } from 'vitest';` line (becomes `import { describe, expect, it, vi } from 'vitest';`).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/ebill.test.ts`
Expected: FAIL — `sendWhatsAppEBill`/`sendSmsEBill` don't accept a 4th/3rd `sendFn` argument yet, and the old two removed tests are gone so only the new ones run and fail on the missing parameter / old `GATEWAY_CONFIGURED` behavior.

- [ ] **Step 3: Rewrite `sendWhatsAppEBill` and `sendSmsEBill`**

In `packages/api/src/services/ebill.ts`, add this exported type near the top of the file, right after the existing imports:

```typescript
export type SendReceiptFn = (
  channel: 'WHATSAPP' | 'SMS',
  phoneNumber: string,
  templateParams: string[]
) => Promise<{ success: boolean; providerMessageId?: string; errorMessage?: string }>;
```

Delete the `GATEWAY_CONFIGURED` field and its comment block (current lines 65-75). Replace `sendWhatsAppEBill` (current lines 80-156) with:

```typescript
  /**
   * Send WhatsApp e-bill. `sendFn` is the app-specific device-authed call to
   * cloud/api's POST /api/v1/receipts/send — packages/api has no fetch/API
   * base URL of its own, so the actual network call is always injected by
   * the calling Tauri app's own cloudClient.ts.
   */
  public static async sendWhatsAppEBill(
    order: Order,
    phoneNumber: string,
    config: ReceiptConfig,
    sendFn: SendReceiptFn
  ): Promise<{ success: boolean; record: ReceiptRecord; message: string }> {
    const isVal = this.validateIndianPhone(phoneNumber);
    if (!isVal) {
      return {
        success: false,
        record: {
          id: `rec-err-${Date.now()}`,
          orderId: order.id,
          orderNumber: order.orderNumber,
          tokenNumber: order.tokenNumber,
          deliveryMethod: 'WHATSAPP',
          deliveryStatus: 'FAILED',
          recipient: phoneNumber,
          content: '',
          createdAt: new Date().toISOString(),
          errorMessage: 'Invalid 10-digit Indian phone number'
        },
        message: 'Invalid 10-digit Indian phone number'
      };
    }

    // content is the human-readable audit copy shown in receipt history —
    // NOT the literal wire payload. The real WhatsApp send is a pre-approved
    // template (see templateParams below); free text cannot be sent to a
    // customer who hasn't messaged the business first.
    const messageContent = this.formatWhatsAppMessage(order, config);
    const masked = this.maskRecipient(phoneNumber);
    // Fixed external contract: the restaurant's approved WhatsApp template
    // must accept these three values, in this order, as {{1}}, {{2}}, {{3}}.
    const templateParams = [order.orderNumber, order.tokenNumber, formatINR(order.totalAmount)];

    let sendResult: { success: boolean; providerMessageId?: string; errorMessage?: string };
    try {
      sendResult = await sendFn('WHATSAPP', phoneNumber, templateParams);
    } catch (err: any) {
      sendResult = { success: false, errorMessage: err?.message || 'Failed to reach the notification service' };
    }

    if (!sendResult.success) {
      const record: ReceiptRecord = {
        id: `rec-err-${Date.now()}`,
        orderId: order.id,
        orderNumber: order.orderNumber,
        tokenNumber: order.tokenNumber,
        deliveryMethod: 'WHATSAPP',
        deliveryStatus: 'FAILED',
        recipient: masked,
        content: messageContent,
        createdAt: new Date().toISOString(),
        errorMessage: sendResult.errorMessage || 'WhatsApp send failed'
      };
      order.eBillMethod = 'WHATSAPP';
      order.eBillStatus = 'FAILED';
      order.eBillRecipient = masked;
      db.notify();
      return {
        success: false,
        record,
        message: `WhatsApp e-bill not sent — ${sendResult.errorMessage || 'send failed'}`
      };
    }

    const record: ReceiptRecord = {
      id: `rec-${Date.now()}`,
      orderId: order.id,
      orderNumber: order.orderNumber,
      tokenNumber: order.tokenNumber,
      deliveryMethod: 'WHATSAPP',
      deliveryStatus: 'SENT',
      recipient: masked,
      content: messageContent,
      createdAt: new Date().toISOString(),
      sentAt: new Date().toISOString()
    };

    order.eBillMethod = 'WHATSAPP';
    order.eBillStatus = 'SENT';
    order.eBillRecipient = masked;
    db.notify();

    return {
      success: true,
      record,
      message: `WhatsApp e-bill dispatched to ${masked}`
    };
  }
```

Replace `sendSmsEBill` (current lines 161-215, i.e. everything from the method's doc comment down to its closing brace, right before the class's final closing brace) with:

```typescript
  /**
   * Send SMS e-bill via the same injected sendFn as WhatsApp.
   */
  public static async sendSmsEBill(
    order: Order,
    phoneNumber: string,
    sendFn: SendReceiptFn
  ): Promise<{ success: boolean; record: ReceiptRecord; message: string }> {
    const masked = this.maskRecipient(phoneNumber);
    const smsText = `JAMANVAAR: Thank you for Order #${order.orderNumber} (Token #${order.tokenNumber}). Total: ${formatINR(order.totalAmount)}. Track live: https://kiosk.jamanvaar.com/track/${order.orderNumber}`;
    const templateParams = [order.orderNumber, order.tokenNumber, formatINR(order.totalAmount)];

    let sendResult: { success: boolean; providerMessageId?: string; errorMessage?: string };
    try {
      sendResult = await sendFn('SMS', phoneNumber, templateParams);
    } catch (err: any) {
      sendResult = { success: false, errorMessage: err?.message || 'Failed to reach the notification service' };
    }

    if (!sendResult.success) {
      const record: ReceiptRecord = {
        id: `rec-sms-err-${Date.now()}`,
        orderId: order.id,
        orderNumber: order.orderNumber,
        tokenNumber: order.tokenNumber,
        deliveryMethod: 'SMS',
        deliveryStatus: 'FAILED',
        recipient: masked,
        content: smsText,
        createdAt: new Date().toISOString(),
        errorMessage: sendResult.errorMessage || 'SMS send failed'
      };
      order.eBillMethod = 'SMS';
      order.eBillStatus = 'FAILED';
      order.eBillRecipient = masked;
      db.notify();
      return {
        success: false,
        record,
        message: `SMS e-bill not sent — ${sendResult.errorMessage || 'send failed'}`
      };
    }

    const record: ReceiptRecord = {
      id: `rec-sms-${Date.now()}`,
      orderId: order.id,
      orderNumber: order.orderNumber,
      tokenNumber: order.tokenNumber,
      deliveryMethod: 'SMS',
      deliveryStatus: 'SENT',
      recipient: masked,
      content: smsText,
      createdAt: new Date().toISOString(),
      sentAt: new Date().toISOString()
    };

    order.eBillMethod = 'SMS';
    order.eBillStatus = 'SENT';
    order.eBillRecipient = masked;
    db.notify();

    return {
      success: true,
      record,
      message: `SMS e-bill dispatched to ${masked}`
    };
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/ebill.test.ts`
Expected: PASS (8 tests: the 3 pre-existing ones for `maskRecipient`/`validateIndianPhone`/`formatWhatsAppMessage`, plus the 5 new ones).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/ebill.ts tests/ebill.test.ts
git commit -m "feat(ebill): replace hardcoded gateway stub with an injected real send function"
```

---

### Task 3: Wire `sendReceipt` into kiosk-user's and POS's `cloudClient.ts`

**Files:**
- Modify: `apps/kiosk-system/kiosk-user/src/cloud/cloudClient.ts`
- Modify: `apps/restaurant-system/pos/src/cloud/cloudClient.ts`

**Interfaces:**
- Consumes: `deviceFetch(path: string, init?: RequestInit): Promise<Response>` (existing in both files); `CloudApiError` (existing in both files); `parseJsonResponse` (existing in both files); backend route from Task 1, `POST /api/v1/receipts/send`.
- Produces: `export async function sendReceipt(channel: 'WHATSAPP' | 'SMS', phoneNumber: string, templateParams: string[]): Promise<{ success: boolean; providerMessageId?: string; errorMessage?: string }>` in both files — Task 4 (kiosk-user) and Task 5 (POS) import this.

- [ ] **Step 1: Add `sendReceipt` to kiosk-user's `cloudClient.ts`**

Append to `apps/kiosk-system/kiosk-user/src/cloud/cloudClient.ts` (after the existing `getPaymentOrderStatus` function, at the end of the file):

```typescript
export async function sendReceipt(
  channel: 'WHATSAPP' | 'SMS',
  phoneNumber: string,
  templateParams: string[]
): Promise<{ success: boolean; providerMessageId?: string; errorMessage?: string }> {
  const res = await deviceFetch('/api/v1/receipts/send', {
    method: 'POST',
    body: JSON.stringify({ channel, phoneNumber, templateParams })
  });
  const data = await parseJsonResponse(res);
  if (!res.ok) {
    throw new CloudApiError(data?.message ?? `Receipt send failed (${res.status})`, res.status);
  }
  return data;
}
```

- [ ] **Step 2: Add the identical `sendReceipt` to POS's `cloudClient.ts`**

Append the exact same function (identical body — both files already define `deviceFetch`/`parseJsonResponse`/`CloudApiError` with matching signatures) to `apps/restaurant-system/pos/src/cloud/cloudClient.ts`, after the existing `createRefund` function at the end of the file.

- [ ] **Step 3: Type-check both apps**

Run: `cd apps/kiosk-system/kiosk-user && npx tsc --noEmit`
Run: `cd apps/restaurant-system/pos && npx tsc --noEmit`
Expected: no errors in either (this task only adds a new export; nothing calls it yet).

- [ ] **Step 4: Commit**

```bash
git add apps/kiosk-system/kiosk-user/src/cloud/cloudClient.ts apps/restaurant-system/pos/src/cloud/cloudClient.ts
git commit -m "feat(cloud-client): add sendReceipt to kiosk-user and POS device clients"
```

---

### Task 4: kiosk-user — wire the real send into the e-bill modal

**Files:**
- Modify: `apps/kiosk-system/kiosk-user/src/App.tsx`

**Interfaces:**
- Consumes: `sendReceipt` from `./cloud/cloudClient` (Task 3); `EBillService.sendWhatsAppEBill(order, phoneNumber, config, sendFn)` / `EBillService.sendSmsEBill(order, phoneNumber, sendFn)` (Task 2).
- Produces: nothing new — this is a leaf call site.

- [ ] **Step 1: Import `sendReceipt`**

In `apps/kiosk-system/kiosk-user/src/App.tsx`, the existing import block at lines 3-12 reads:

```typescript
import {
  activateKioskDevice,
  isKioskDeviceConnected,
  getKioskDeviceId,
  getKioskRestaurantId,
  createPaymentOrder,
  getPaymentOrderStatus,
  CloudApiError,
  type CartLinePayload
} from './cloud/cloudClient';
```

Add `sendReceipt` to that list:

```typescript
import {
  activateKioskDevice,
  isKioskDeviceConnected,
  getKioskDeviceId,
  getKioskRestaurantId,
  createPaymentOrder,
  getPaymentOrderStatus,
  sendReceipt,
  CloudApiError,
  type CartLinePayload
} from './cloud/cloudClient';
```

- [ ] **Step 2: Pass `sendReceipt` into both `EBillService` calls, and persist failures too**

Replace `handleDispatchEBill` (current lines 1006-1029):

```typescript
  // Dispatch WhatsApp or SMS E-Bill
  const handleDispatchEBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!placedOrder || !eBillPhoneInput) return;

    if (selectedEBillMethod === 'WHATSAPP') {
      const res = await EBillService.sendWhatsAppEBill(placedOrder, eBillPhoneInput, receiptConfig, sendReceipt);
      ReceiptRepository.addRecord(res.record);
      if (res.success) {
        setEBillSuccessMessage(res.message);
        showToast(res.message);
      } else {
        alert(res.message);
      }
    } else if (selectedEBillMethod === 'SMS') {
      const res = await EBillService.sendSmsEBill(placedOrder, eBillPhoneInput, sendReceipt);
      ReceiptRepository.addRecord(res.record);
      if (res.success) {
        setEBillSuccessMessage(res.message);
        showToast(res.message);
      } else {
        alert(res.message);
      }
    }
  };
```

The only structural change from the current code: `ReceiptRepository.addRecord(res.record)` moved outside the `if (res.success)` branch, since a real failed attempt (with a real provider error message) is exactly the kind of thing the admin's receipt history should show — today's code silently drops failed attempts.

- [ ] **Step 3: Type-check**

Run: `cd apps/kiosk-system/kiosk-user && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/kiosk-system/kiosk-user/src/App.tsx
git commit -m "feat(kiosk-user): send real WhatsApp/SMS e-bills through cloud/api"
```

---

### Task 5: POS — replace the fake "sent!" toast with a real send

**Files:**
- Modify: `apps/restaurant-system/pos/src/components/receipt/PosThermalReceiptModal.tsx`

**Interfaces:**
- Consumes: `sendReceipt` from `../../cloud/cloudClient` (Task 3); `EBillService` from `@jamanvaar/api` (Task 2's updated signatures).
- Produces: nothing new — this is a leaf call site.

- [ ] **Step 1: Import `EBillService` and `sendReceipt`**

In `apps/restaurant-system/pos/src/components/receipt/PosThermalReceiptModal.tsx`, the current imports (lines 1-18) are:

```tsx
import React, { useState } from 'react';
import { usePosStore } from '../../store/posStore';
import { db, ReceiptRepository, PrintQueueRepository } from '@jamanvaar/database';
import { PosPrinterService } from '../../services/printerService';
import { ThermalReceiptView } from '@jamanvaar/ui';
import {
  X,
  Printer,
  Phone,
  Mail,
  QrCode,
  CheckCircle2,
  AlertTriangle,
  Download,
  RotateCcw,
  Sliders,
  Share2
} from 'lucide-react';
```

Add two new imports right after the `PosPrinterService` import:

```tsx
import { EBillService } from '@jamanvaar/api';
import { sendReceipt } from '../../cloud/cloudClient';
```

- [ ] **Step 2: Add a `sendError` state next to the existing `shareToast` state**

Current line 32 is `const [shareToast, setShareToast] = useState('');`. Add directly after it:

```tsx
  const [sendError, setSendError] = useState('');
```

- [ ] **Step 3: Replace the fake dispatch with a real one**

Replace `handleWhatsAppClick` and `dispatchDigitalReceipt` (current lines 74-86):

```tsx
  const handleWhatsAppClick = () => {
    if (!order.customerPhone) {
      setPhonePromptOpen(true);
    } else {
      dispatchDigitalReceipt('WHATSAPP', order.customerPhone);
    }
  };

  const dispatchDigitalReceipt = async (channel: 'WHATSAPP' | 'SMS', targetPhone: string) => {
    if (!EBillService.validateIndianPhone(targetPhone)) {
      setSendError('Enter a valid 10-digit Indian mobile number');
      setTimeout(() => setSendError(''), 4000);
      return;
    }
    setPhonePromptOpen(false);
    const res =
      channel === 'WHATSAPP'
        ? await EBillService.sendWhatsAppEBill(order, targetPhone, config, sendReceipt)
        : await EBillService.sendSmsEBill(order, targetPhone, sendReceipt);
    ReceiptRepository.addRecord(res.record);
    if (res.success) {
      setShareToast(res.message);
      setTimeout(() => setShareToast(''), 3000);
    } else {
      setSendError(res.message);
      setTimeout(() => setSendError(''), 4000);
    }
  };
```

- [ ] **Step 4: Update the SMS button to go through the same validated path**

Current lines 252-258:

```tsx
            <button
              onClick={() => dispatchDigitalReceipt('SMS', order.customerPhone || '9876543210')}
              className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>SMS</span>
            </button>
```

Replace with (no more `|| '9876543210'` fallback — that was silently sending to a fake placeholder number when the order had none):

```tsx
            <button
              onClick={() => (order.customerPhone ? dispatchDigitalReceipt('SMS', order.customerPhone) : setPhonePromptOpen(true))}
              className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>SMS</span>
            </button>
```

- [ ] **Step 5: Update the phone-prompt modal's Send button to go through the same validated path**

Current lines 223-228:

```tsx
              <button
                onClick={() => dispatchDigitalReceipt('WhatsApp', inputPhone || '9876543210')}
                className="px-3 py-1 bg-[#E66817] text-white rounded-lg font-bold text-xs"
              >
                Send
              </button>
```

Replace with:

```tsx
              <button
                onClick={() => dispatchDigitalReceipt('WHATSAPP', inputPhone)}
                className="px-3 py-1 bg-[#E66817] text-white rounded-lg font-bold text-xs"
              >
                Send
              </button>
```

- [ ] **Step 6: Render the real error banner**

Current lines 167-172:

```tsx
        {/* Status Banners */}
        {shareToast && (
          <div className="p-2.5 bg-emerald-50 text-emerald-800 text-xs font-bold text-center border-t border-emerald-200">
            ✓ {shareToast}
          </div>
        )}
```

Add a sibling block directly after it:

```tsx
        {sendError && (
          <div className="p-2.5 bg-rose-50 text-rose-900 text-xs font-bold text-center border-t border-rose-200">
            ⚠ {sendError}
          </div>
        )}
```

- [ ] **Step 7: Type-check and build**

Run: `cd apps/restaurant-system/pos && npx tsc --noEmit`
Expected: no errors.

Run: `cd apps/restaurant-system/pos && npm run build`
Expected: build succeeds (this app is not necessarily part of automated e2e coverage — a clean production build is the verification bar here, same as Sub-project B's frontend task).

- [ ] **Step 8: Commit**

```bash
git add apps/restaurant-system/pos/src/components/receipt/PosThermalReceiptModal.tsx
git commit -m "fix(pos): replace fake e-bill success toast with a real WhatsApp/SMS send"
```
