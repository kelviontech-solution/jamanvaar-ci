# Real WhatsApp / SMS E-Bill Delivery — Design

**Status:** Approved
**Phase:** Phase 4, sub-project C-1 (of: refunds ✅, payments visibility ✅, real e-bill delivery, real printer transport, POS live payment-status check)

## Problem

`packages/api/src/services/ebill.ts` (`EBillService`, shared by kiosk-user and kiosk-admin) and `apps/restaurant-system/pos/src/components/receipt/PosThermalReceiptModal.tsx` (POS) both offer "Send via WhatsApp" / "Send via SMS" buttons after checkout, but neither actually sends anything:

- `EBillService` has a hardcoded `private static readonly GATEWAY_CONFIGURED = false;` — every call to `sendWhatsAppEBill`/`sendSmsEBill` deterministically returns `{ success: false, ... errorMessage: 'No WhatsApp/SMS gateway is configured for this outlet' }`. This is an honest failure, not a fake success, but it is still not real delivery.
- POS's `dispatchDigitalReceipt()` is worse: it unconditionally sets `E-Receipt sent via WhatsApp to <phone>!` regardless of whether anything happened — no validation, no real send, no failure path at all.

No WhatsApp Business API / SMS provider SDK, API key, or webhook exists anywhere in the repo today — this is a green-field integration.

## Prerequisite the user must complete before this goes live

Both WhatsApp Cloud API and Indian SMS delivery require a **pre-approved message template** before any message can be sent to a customer who hasn't messaged the business first:

- **WhatsApp Cloud API**: free-form text is only allowed within a 24-hour window after the customer initiates contact. An unprompted post-checkout e-bill requires a template message, approved in advance through Meta Business Manager (business verification + template content review, which takes real-world time).
- **Indian SMS**: TRAI's DLT regulation requires every SMS template sent to Indian numbers to be pre-registered with a telecom operator via the SMS gateway (MSG91's "Flow ID"/template ID). An unregistered template is rejected by the gateway, not by this code.

This spec builds a **template-driven** integration: cloud/api sends whatever template name/ID and parameter values are configured via environment variables, in a fixed parameter order this spec documents. Once the restaurant/platform registers real templates with Meta and with MSG91's DLT flow, delivery works with zero code changes. Until then, real sends will fail with the provider's own rejection reason — an honest failure, same spirit as today's stub, but now failing for a real, correctable, external reason instead of a hardcoded flag.

## Non-goals

- No template content design in this repo — the actual approved WhatsApp template body and MSG91 DLT-registered SMS text are created by the user in Meta Business Manager / MSG91's dashboard, outside this codebase. This spec only defines the parameter contract (order and count of values) those templates must accept.
- No rate limiting on the new endpoint. Device auth (the same device types already trusted for payment orders/refunds) is the only gate, matching the existing refund endpoint's precedent of relying on device auth rather than a dedicated rate limiter.
- No server-side persistence of send attempts. The client already persists a `ReceiptRecord` locally via `ReceiptRepository.addRecord` — cloud/api's new endpoint is a stateless relay, not a new source of truth.
- No change to kiosk-admin — it imports `EBillService` but never calls `sendWhatsAppEBill`/`sendSmsEBill` itself (confirmed by repo search); this sub-project doesn't need to touch its call sites, only keep it compiling against the new signature (which it does, since it never calls the changed methods).
- No fix to the "manual wa.me deep-link" marketing/reporting features (`MarketingCampaignsModal.tsx`, kiosk-admin's Z-report WhatsApp share) — those are a different feature (human taps "send" themselves each time) working as designed, not part of the customer e-bill flow this spec covers.

## Architecture

**Why server-side:** `packages/api` is imported directly into Tauri desktop apps shipped to end-user machines. A WhatsApp Cloud API access token or MSG91 auth key embedded in that bundle would be extractable by anyone with the installed `.exe`. Every other secret-holding integration in this codebase (Razorpay order creation, vendor onboarding, refunds) already routes through `cloud/api`, which holds the real credentials as server env vars — this follows the same pattern.

**New backend module: `cloud/api/src/modules/notifications/`**

- `notification-gateway.service.ts` — thin wrapper over WhatsApp Cloud API and MSG91, mirroring `RazorpayGatewayService`'s exact shape (`isConfigured()`, plain `fetch`, `ConfigService`, `ServiceUnavailableException` when unconfigured):

```typescript
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SendWhatsAppTemplateInput {
  phoneNumber: string; // E.164-ish, digits only after normalization
  templateParams: string[]; // ordered values for the template's {{1}}, {{2}}, ... placeholders
}

export interface SendSmsInput {
  phoneNumber: string;
  templateParams: string[]; // ordered values for the MSG91 flow's VAR1, VAR2, ... placeholders
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

Note the deliberate distinction: an *unconfigured* server throws `ServiceUnavailableException` (503 — this deployment forgot to set env vars, a server misconfiguration), while a *configured-but-rejected* send (bad template, unapproved number, provider outage) returns `{ success: false, errorMessage }` (200 — the request was valid, the external provider said no). The controller only ever returns 200 with a success/failure body for the second case; the first is a real 503.

- `receipts.controller.ts` — device-authed, mirrors `payment-orders.controller.ts`'s guard style:

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

- `dto/send-receipt.dto.ts`:

```typescript
import { z } from 'zod';

export const sendReceiptSchema = z.object({
  channel: z.enum(['WHATSAPP', 'SMS']),
  phoneNumber: z.string().regex(/^(\+?91)?[6-9]\d{9}$/, 'Must be a 10-digit Indian mobile number, optionally prefixed with +91'),
  templateParams: z.array(z.string().max(200)).min(0).max(10)
});

export type SendReceiptDto = z.infer<typeof sendReceiptSchema>;
```

- `notifications.module.ts` — registers `ReceiptsController` + `NotificationGatewayService`, imports nothing beyond what `DeviceAuthGuard` needs (it's a standalone guard, same as how `PaymentsModule` uses it with no extra imports). Registered in `cloud/api/src/app.module.ts`'s `imports` array alongside `PaymentsModule`.

**Client contract (`packages/api/src/services/ebill.ts`)**

Replace the `GATEWAY_CONFIGURED` flag with an injected send function — `packages/api` stays framework-agnostic (no `fetch`/`API_BASE`, matching its current zero-dependency `package.json`); each Tauri app's own `cloudClient.ts` supplies the actual network call:

```typescript
export type SendReceiptFn = (
  channel: 'WHATSAPP' | 'SMS',
  phoneNumber: string,
  templateParams: string[]
) => Promise<{ success: boolean; providerMessageId?: string; errorMessage?: string }>;
```

`sendWhatsAppEBill(order, phoneNumber, config, sendFn: SendReceiptFn)` and `sendSmsEBill(order, phoneNumber, sendFn: SendReceiptFn)` gain a required `sendFn` parameter. `templateParams` is built as a fixed-order array both channels share:

```typescript
const templateParams = [order.orderNumber, order.tokenNumber, formatINR(order.totalAmount)];
```

This order (order number, token number, total) is the contract a restaurant's real WhatsApp template and MSG91 flow must both accept as `{{1}}`/`{{2}}`/`{{3}}` (WhatsApp) or `VAR1`/`VAR2`/`VAR3` (MSG91) — documented as a code comment directly above this array, since it's an external contract with no compiler to enforce it.

`formatWhatsAppMessage()` (the existing free-text formatter) is kept unchanged and still used to populate `ReceiptRecord.content` — it's the human-readable audit copy shown in the kiosk-admin receipt history, not what's actually transmitted (the real WhatsApp send is a template, not this free text). A comment is added clarifying this distinction so a future reader doesn't assume `content` is the literal wire payload.

On `sendFn` throwing (network failure) or returning `{ success: false, errorMessage }`, both methods build the existing `FAILED` `ReceiptRecord` shape with that real `errorMessage` (replacing today's hardcoded "no gateway configured" string). On `{ success: true }`, they build the existing `SENT` shape, using `providerMessageId` nowhere yet (not part of `ReceiptRecord` today — out of scope to add a field for it now; `providerMessageId` is available in the return value for a future caller that wants it).

**Per-app wiring** — each app already has its own `cloudClient.ts` (kiosk-user, kiosk-admin, POS, POS-Admin, Captain all have one). Only kiosk-user and POS need a new export, since only they call the send methods:

```typescript
// added to kiosk-user's and POS's cloudClient.ts
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

(POS's own `cloudClient.ts` — distinct from POS-Admin's — already has its own `deviceFetch` helper, identical in shape to kiosk-user's; `sendReceipt` there uses it the same way.)

**Call-site updates:**

- `apps/kiosk-system/kiosk-user/src/App.tsx`, `handleDispatchEBill` — passes `cloudClient.sendReceipt` as the new argument to both `sendWhatsAppEBill`/`sendSmsEBill` calls, and on failure now calls `ReceiptRepository.addRecord(res.record)` too (today it only persists on success — a gap this spec also closes, since a real failed attempt is exactly the kind of thing kiosk-admin's receipt history/audit view should show).
- `apps/restaurant-system/pos/src/components/receipt/PosThermalReceiptModal.tsx` — `handleWhatsAppClick`/the SMS button's handler and `dispatchDigitalReceipt` are replaced with real calls to `EBillService.sendWhatsAppEBill`/`sendSmsEBill` (imported from `@jamanvaar/api`, already a POS dependency), using `EBillService.validateIndianPhone` before sending and `cloudClient.sendReceipt` as the injected function. The toast becomes conditional on the real result (`res.success`) instead of unconditionally showing "sent."

## Data flow

1. Customer/staff taps "WhatsApp E-Bill" (kiosk-user) or "WhatsApp"/"SMS" (POS receipt modal) and confirms a phone number.
2. The app calls `EBillService.sendWhatsAppEBill`/`sendSmsEBill`, which validates the phone number locally, builds `templateParams`, and calls the injected `sendFn`.
3. `sendFn` (the app's `cloudClient.sendReceipt`) POSTs to `cloud/api`'s `/api/v1/receipts/send` with the device's bearer token.
4. `DeviceAuthGuard` authenticates the device; `ReceiptsController` checks device type, re-validates the phone format (defense in depth — the client already validated, but the endpoint doesn't trust that), and calls `NotificationGatewayService`.
5. The gateway service calls the real WhatsApp Cloud API or MSG91 Flow API and returns a normalized `{ success, providerMessageId?, errorMessage? }`.
6. The app persists a `ReceiptRecord` (SENT or FAILED, with the real error message on failure) and shows the result to the user — no more unconditional "sent" toast anywhere in this flow.

## Error handling

- Server not configured (missing env vars): `ServiceUnavailableException` → HTTP 503 → the client's `deviceFetch`/direct-token call throws `CloudApiError` → `EBillService` catches it and returns the existing `FAILED` shape with that message.
- Server configured, provider rejects (bad phone, unapproved template, provider outage): HTTP 200 with `{ success: false, errorMessage }` — the real provider's own rejection reason surfaces all the way to the `ReceiptRecord.errorMessage` the admin already sees in the receipt history.
- Invalid phone number format: rejected by the DTO's Zod schema (400) before any provider call — same behavior as today's client-side-only check, now also enforced server-side.
- Wrong device type (e.g. a KDS token somehow calling this): 403, same pattern as the refund endpoint's device-type gate.
- Network failure reaching cloud/api at all (kiosk offline): `deviceFetch`/`fetch` rejects, caught the same way as any other `CloudApiError` in these apps' existing patterns (e.g. `createPaymentOrder`) — surfaces as a `FAILED` record with a connectivity-flavored message, never a crash.

## Testing

- Backend e2e (`cloud/api/test/receipts.e2e.spec.ts`), overriding `NotificationGatewayService` the same way `payments-refund.e2e.spec.ts` overrides `RazorpayGatewayService`:
  - A KIOSK device can send a WHATSAPP receipt; mocked gateway returns success; response is `{ success: true, providerMessageId }`.
  - A POS device can send an SMS receipt; mocked gateway returns success.
  - An invalid phone number (e.g. `12345`) is rejected 400 before the gateway mock is ever called.
  - A KDS device token is rejected 403.
  - A gateway-mocked failure (`{ success: false, errorMessage: 'Template not approved' }`) surfaces as HTTP 200 with that exact body — not a 500, since a provider rejection is not a server error.
  - No device token at all is rejected 401 (`DeviceAuthGuard`'s existing behavior — confirms the guard is actually applied, not new guard logic).
- `packages/api` unit tests (`tests/ebill.test.ts`, rewritten): inject a mock `sendFn` — one test asserts a successful send builds a `SENT` record with `content` still containing the human-readable `formatWhatsAppMessage()` text; one asserts a `sendFn` rejection/failure builds a `FAILED` record with the real error message (replacing today's "no gateway configured, ever" assertions, since that's no longer true).
- POS: no automated test infra exists for `PosThermalReceiptModal.tsx` today (confirmed — no test file references it) — manual verification only, same limitation as every other POS UI change this session: type-check and production build, described explicitly as unverified-in-browser if a browser isn't available in the execution environment.
