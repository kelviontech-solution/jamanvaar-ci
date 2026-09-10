# Cashfree Payment Gateway — Sub-project B: Connection Onboarding

Status: Approved for planning
Date: 2026-09-10
Scope: Phase 2 of the Cashfree integration (see Phase 1's spec for the four-phase breakdown). Depends on Sub-project A (Kiosk Admin real staff login, already shipped) for the tenant-user session that gates the submission endpoint. Covers: Kiosk Admin's settlement/KYC submission screen, Super Admin's connection review/approval page, and the backend endpoints + Cashfree Easy Split vendor integration behind both.

## Context

Phase 1 built `RestaurantPaymentConnection` (status `NOT_CONNECTED`/`PENDING_VERIFICATION`/`ACTIVE`/`SUSPENDED`/`DISCONNECTED`, settlement bank/UPI fields, encrypted account number) and `CashfreeGatewayService` (order creation, refund, webhook verification — no vendor-onboarding methods yet). Phase 1's order-creation endpoint already gates on `connection.status === 'ACTIVE'` before accepting a payment. This sub-project builds the missing piece: how a connection actually gets from `NOT_CONNECTED` to `ACTIVE`.

Cashfree's real Easy Split Vendor API was verified directly against current docs (not invented):

- `POST /pg/easy-split/vendors` — required: `vendor_id` (alphanumeric + underscore only — a UUID's hyphens are NOT valid, so the ID must be derived, not used raw), `status` (`ACTIVE`/`BLOCKED`/`DELETED` — this is *our* instruction to Cashfree about whether the vendor should be live, not a report of Cashfree's own verification progress), `name`/`email`/`phone`, and a `kyc_details` object requiring `account_type` (`BUSINESS`/`INDIVIDUAL`) and `pan`, with optional `business_type`/`gst`/`cin`/`uidai`/`passport_number`/`driving_license`/`voter_id`. Exactly one of `bank` (`account_number`/`account_holder`/`ifsc`) or `upi` (`vpa`/`account_holder`) is provided.
- `GET /pg/easy-split/vendors/{vendor_id}` — same shape back, for status polling.
- On creation, Cashfree's own vendor record starts at `IN_BENE_CREATION` and asynchronously becomes `ACTIVE` (sandbox: automatically after ~10 minutes with test data) or `ACTION_REQUIRED` if something's wrong — independent of the `status` field we set, which only says whether the vendor *should* be allowed to transact once verified.
- **Known gap, honestly disclosed rather than guessed at**: `business_type`'s exact valid enum values are not documented anywhere found during research (secondhand sources mention values like "NBFC", "Jewellery" with no authoritative complete list). This field is collected as free text and passed through verbatim; Cashfree's own API validates it and returns a clear 400 if invalid, surfaced to the Super Admin at approval time. Not hardcoding a guessed enum here is deliberate.

## Goals

- A restaurant (via Kiosk Admin, using Sub-project A's real OWNER/MANAGER login) can submit settlement (bank or UPI) and KYC details, moving their connection to `PENDING_VERIFICATION`.
- A restaurant can resubmit/correct their details while not yet `ACTIVE` (covers "needs correction" without a separate reject state).
- Super Admin can see every restaurant's connection status platform-wide, with settlement details masked (last 4 digits of account number only — never the full number, matching Phase 1's "UI shows masked info" security requirement).
- Super Admin can **Approve** a `PENDING_VERIFICATION` connection — this is the moment `CashfreeGatewayService.createVendor()` is actually called; on success the connection becomes `ACTIVE` with a stored `cashfreeVendorId`. On failure (Cashfree unconfigured, or Cashfree rejects the submitted data), the connection stays `PENDING_VERIFICATION` with the error surfaced clearly — approval never silently "succeeds" without a real vendor being created.
- Super Admin can **Suspend**, **Reactivate**, and **Disconnect** a connection — internal status flips only (see Non-goals).
- Super Admin can manually **Refresh Status** to poll Cashfree's own async verification progress (`getVendorStatus()`) for a connection that already has a `cashfreeVendorId`.

## Non-goals

- No automatic background polling of Cashfree's vendor verification status — manual refresh only. Nothing in this sub-project needs real-time reaction to Cashfree completing KYC verification; that's naturally deferred to whenever the "restaurant actually goes live and takes payments" flow needs it.
- Suspend/Reactivate do not call any Cashfree API to toggle the vendor's own `status` field (`ACTIVE`/`BLOCKED`) — they only flip JAMANVAAR's internal gate, which Phase 1's order-creation endpoint already checks before ever reaching Cashfree. Calling Cashfree's vendor-update endpoint too would be redundant belt-and-suspenders for this phase.
- No document-upload flow for KYC proof documents — Cashfree's Create Vendor API accepts KYC data fields directly; no separate upload endpoint was found in the verified docs, and none is invented here.
- No changes to Sub-project A's login/session code.

## Data model (migration on top of Phase 1's schema)

New enum:

```prisma
enum CashfreeAccountType {
  BUSINESS
  INDIVIDUAL
}
```

New fields on the existing `RestaurantPaymentConnection` model:

```prisma
accountType    CashfreeAccountType?
businessType   String?  // free text, passed through to Cashfree verbatim — see "Known gap" above
pan            String?
gst            String?
cin            String?
uidai          String?  // Aadhar; stored as String (not the API's `number`) to avoid precision/leading-zero loss
contactName    String?  // Cashfree's vendor-level `name`
contactEmail   String?
contactPhone   String?
```

(`settlementAccountName`/`settlementAccountNumberEncrypted`/`settlementIfsc`/`settlementUpiVpa`/`cashfreeVendorId`/`status`/`verifiedAt` already exist from Phase 1.)

## Backend

New files in the existing `cloud/api/src/modules/payments/` module (extending it, not a new module — this is the same domain as Phase 1's order/webhook code):

- `dto/payment-connection.dto.ts` — Zod schema for submission: `accountType` (required), `businessType` (optional), `pan` (required), `gst`/`cin`/`uidai` (optional), `contactName`/`contactEmail`/`contactPhone` (required), and exactly one of (`settlementAccountName`+`settlementAccountNumber`+`settlementIfsc`) or (`settlementUpiVpa`) — enforced via a Zod `.refine()`, matching Cashfree's own bank-XOR-upi requirement.
- `payment-connections.service.ts` — `submit(restaurantId, dto)`, `getOwn(restaurantId)`, `listForPlatform()`, `getForPlatform(restaurantId)`, `approve(restaurantId, actor)`, `suspend/reactivate/disconnect(restaurantId, actor)`, `refreshStatus(restaurantId)`.
- `kiosk-payment-connection.controller.ts` — `TenantAuthGuard`, mounted at `api/v1/tenant/payment-connection`. `POST` (submit/resubmit) and `GET` (own status, unmasked — it's the restaurant's own data). No extra role check beyond the guard: Sub-project A's login already restricts Kiosk Admin sessions to `OWNER`/`MANAGER`, so any authenticated tenant session reaching this endpoint already satisfies that bar — mirrors the reasoning already established there rather than re-implementing a redundant check.
- `platform-payment-connections.controller.ts` — `PlatformAuthGuard`, mounted at `api/v1/restaurants/:id/payment-connection` (detail + all actions) and `api/v1/payment-connections` (platform-wide list) — same "mount under the resource it naturally belongs to" convention as Phase 1's `application-entitlements` split.

### Submission rules (`PaymentConnectionsService.submit`)

- Allowed when current status is `NOT_CONNECTED`, `PENDING_VERIFICATION`, or `DISCONNECTED` (covers first submission, correction, and reconnecting after a disconnect).
- Rejected with a clear `ForbiddenException` when `ACTIVE` or `SUSPENDED` — an already-approved or paused connection must go through Super Admin (suspend/disconnect) before the restaurant can resubmit, preventing a restaurant from silently rewriting live settlement details out from under an active integration.
- `settlementAccountNumber` is encrypted via Phase 1's existing `credential-encryption.util.ts` before storage (same as the field is already documented to require in Phase 1's schema comment).
- Sets/keeps `status = PENDING_VERIFICATION`.

### Approve (`PaymentConnectionsService.approve`)

- Only valid from `PENDING_VERIFICATION`.
- Derives a Cashfree-safe vendor ID: `` `rest_${restaurantId.replace(/-/g, '')}` `` (strips the UUID's hyphens, which Cashfree's `vendor_id` charset rejects).
- Calls `CashfreeGatewayService.createVendor()` with `status: 'ACTIVE'`, the stored KYC/contact fields, and the decrypted settlement details (bank or UPI, whichever was submitted).
- On success: stores `cashfreeVendorId`, sets `status = ACTIVE`, `verifiedAt = now()`.
- On failure (Cashfree unconfigured → `ServiceUnavailableException`, or Cashfree rejects the data → its own error message surfaced as-is): connection stays `PENDING_VERIFICATION`, error propagates to the Super Admin UI. Never a silent partial-success.

### Suspend / Reactivate / Disconnect

Simple status transitions (`ACTIVE`→`SUSPENDED`, `SUSPENDED`→`ACTIVE`, any→`DISCONNECTED`), each audit-logged with the acting `PlatformUser`. No Cashfree API call (see Non-goals).

### Refresh Status

Only valid when `cashfreeVendorId` is set. Calls `getVendorStatus()`, stores the raw Cashfree status string for display (does not change JAMANVAAR's own `status` field automatically — Cashfree's own verification state and our approval gate are deliberately separate, per the Goals section).

### `CashfreeGatewayService` additions

`createVendor(input): Promise<{ vendorId, status }>` and `getVendorStatus(vendorId): Promise<{ vendorId, status }>`, matching the verified request/response shapes above exactly, following the exact same pattern as Phase 1's `createOrder`/`getOrderStatus` (`this.headers()`, `this.baseUrl()`, `ServiceUnavailableException` on non-2xx or when unconfigured).

### Masking

Platform-facing responses (list/detail) mask `settlementAccountNumberEncrypted` down to `•••• <last 4 digits>` (decrypt only long enough to slice the last 4, never return the decrypted value itself) and never include `pan`/`gst`/`cin`/`uidai` in full — last-4-masked the same way, since these are also sensitive identity documents. The tenant's own `GET` (their own restaurant) returns unmasked data — it's already theirs.

## Frontend

**Kiosk Admin** (`apps/kiosk-system/kiosk-admin`): a new "Payment Gateway" section, reachable only while logged in via Sub-project A's real session (already the case for the whole app post-login). Given this app has no router (a tab-based state machine), the natural home is either a new `AdminTab` value or a sub-section of the existing `'SETTINGS'` tab (~line 3877) — the implementation plan will decide based on how that tab is currently structured. Shows current status + a form for the fields above, calling the new `api/v1/tenant/payment-connection` endpoints via `cloudClient.ts` (using Sub-project A's `getTenantAccessToken()`/session layer — this is the first real consumer of that accessor).

**Super Admin** (`cloud/super-admin-web`): new `cloud/super-admin-web/src/pages/PaymentConnections/PaymentConnectionsListPage.tsx`, following `ActivationKeysListPage.tsx`'s exact established pattern (local `components/ui` kit — `Badge`/`Card`/`ConfirmModal`/`Button`/`SearchBar`/`FilterTabs`/`SkeletonTable`/`EmptyState`, plain `useState`/`useEffect` + the hand-rolled `api` client, no react-query, confirm-modal-then-refetch for actions). New route registered in `cloud/super-admin-web/src/app/App.tsx` alongside the existing resource routes, plus a new `PaymentConnection` type added to `cloud/super-admin-web/src/api/types.ts`.

## Testing

Backend e2e tests (new `cloud/api/test/payment-connections.e2e.spec.ts`, following the established `createTestApp`/`createTestPlatformUser`/restaurant-setup pattern): submission validation (bank-XOR-upi enforcement, rejected when `ACTIVE`/`SUSPENDED`, allowed when `DISCONNECTED`), approve success/failure paths (mocked `CashfreeGatewayService` the same way Phase 1's order-creation tests did), suspend/reactivate/disconnect status transitions, masking (platform list/detail never contains a full account number or full PAN/GST/CIN/UIDAI), tenant isolation (one restaurant cannot see or act on another's connection).

Frontend: manual verification for both apps (Kiosk Admin has no test runner per Sub-project A's finding; Super Admin's test setup, if any, will be checked during planning).

## Open items explicitly out of scope

- Automatic Cashfree status polling/webhooks for vendor verification (Non-goals).
- Suspend/Reactivate touching Cashfree's own vendor `status` (Non-goals).
- True per-restaurant independent Cashfree merchant accounts (blocked on Cashfree Partner approval — carried forward from Phase 1's spec, unchanged).
