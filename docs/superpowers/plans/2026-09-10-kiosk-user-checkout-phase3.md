# Kiosk-User Device Activation & Checkout (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give kiosk-user (the customer-facing kiosk app) a real device identity and a real Cashfree UPI payment flow at checkout, replacing its hardcoded single-kiosk assumption and its unconditional fake `paymentStatus: 'SUCCESS'`.

**Architecture:** kiosk-user activates itself via the existing generic activation-key system (`deviceType: 'KIOSK'`), consuming the device token directly from the redeem response — no login layer needed, since a walk-up kiosk has no staff credentials to attach. At checkout, kiosk-user creates its local order `PENDING` first (for a stable id), calls Phase 1's already-built `POST /api/v1/payments/orders` (backend prices from `MenuSnapshotItem`, never trusts the client), renders Cashfree's own hosted checkout via `cashfree.js`, and polls `GET /api/v1/payments/:paymentId/status` — the Cashfree webhook (already idempotent, signature-verified) is what actually confirms payment, polling only reflects it. Kiosk Admin gains one new call to the existing (currently unused) menu-sync endpoint so `MenuSnapshotItem` has real data to price against.

**Tech Stack:** React + Vite + Tauri (kiosk-user, kiosk-admin), `@jamanvaar/database` (shared local store), `@cashfreepayments/cashfree-js` (new dependency), existing NestJS/Prisma `cloud/api`.

**Spec:** docs/superpowers/specs/2026-09-10-kiosk-user-checkout-phase3-design.md

## Global Constraints

- **Never fabricate payment success.** An order's `paymentStatus` is `'PENDING'` until either Cashfree's webhook-confirmed `SUCCESS` (verified via `GET /api/v1/payments/:paymentId/status`, which only ever reflects what the webhook already recorded) or a staff member actually collects cash and calls `OrderRepository.settleOrder(...)`. No code path in this plan sets `paymentStatus: 'SUCCESS'` speculatively.
- **Never trust a client-computed price.** `POST /api/v1/payments/orders` is called with cart lines only (`externalItemId`, `quantity`, `selectedOptionIds`) — never an amount. This endpoint already exists and already enforces this (`createPaymentOrderSchema` has no amount field, by design).
- **All new money amounts sent to `cloud/api` are integer paise**, matching every other payment code in this codebase. The local domain model (`packages/types/src/domain.ts`) stores rupee amounts — every conversion point below is explicit about the `* 100` / rounding.
- **Device tokens are `Authorization: Bearer <token>` headers**, verified by `DeviceAuthGuard` against `Device.deviceTokenHash` — identical pattern to every other device-authed call in this codebase (confirmed directly in `cloud/api/src/common/guards/device-auth.guard.ts`).
- **`cloud/api`'s CSP for kiosk-user is unrestricted** (`src-tauri/tauri.conf.json`'s `"csp": null`) — loading Cashfree's checkout script needs no CSP change.
- Do not modify `apps/kiosk-system/kiosk-admin/src/App.tsx`'s existing menu-management logic beyond adding the two sync trigger call sites in Task 1 — this file also carries unrelated, pre-existing, uncommitted local work (a Hindi/Gujarati menu-translation feature) from earlier in this project. If a task's diff touches this file, verify with `git diff -- apps/kiosk-system/kiosk-admin/src/App.tsx` that only the intended lines changed before committing; if unrelated uncommitted changes are still present in the working tree, they must not be swept into this task's commit (use `git add -p` or the git blob-staging technique documented in this project's earlier task ledgers if a plain `git add` would include them).

---

## Task 1: Kiosk Admin pushes its menu to cloud (menu-sync wiring)

**Files:**
- Modify: `apps/kiosk-system/kiosk-admin/src/cloud/cloudClient.ts`
- Modify: `apps/kiosk-system/kiosk-admin/src/App.tsx`

**Interfaces:**
- Consumes: `POST /api/v1/tenant/menu-sync` (existing, `cloud/api/src/modules/payments/menu-sync.controller.ts`, `DeviceAuthGuard`, body `{ items: MenuSyncItemDto[] }` per `cloud/api/src/modules/payments/dto/menu-sync.dto.ts`); the `DEVICE_TOKEN_KEY` localStorage value Kiosk Admin's own `connectDeviceStep2` already writes (`apps/kiosk-system/kiosk-admin/src/cloud/cloudClient.ts:153`) but nothing currently reads.
- Produces: `syncMenuToCloud(): Promise<void>` — exported from `cloudClient.ts`, called by later steps in this task only (no other task in this plan imports it).

- [ ] **Step 1: Add a device-authenticated fetch helper and the menu mapper**

In `apps/kiosk-system/kiosk-admin/src/cloud/cloudClient.ts`, add after the existing `DEVICE_TOKEN_KEY` constant (line 27):

```typescript
function getDeviceToken(): string | null {
  try {
    return localStorage.getItem(DEVICE_TOKEN_KEY);
  } catch {
    return null;
  }
}
```

Then, at the end of the file, add:

```typescript
// --- Menu Sync (Phase 3 prerequisite) ---

import type { MenuItem } from '@jamanvaar/types';

interface MenuSyncItemPayload {
  externalItemId: string;
  name: string;
  category?: string;
  basePrice: number; // paise
  modifierGroups: Array<{
    id: string;
    name: string;
    isRequired: boolean;
    minSelections: number;
    maxSelections: number;
    options: Array<{ id: string; name: string; priceDelta: number }>;
  }>;
  taxRate: number; // basis points, e.g. 500 = 5.00%
  isAvailable: boolean;
}

/**
 * The local domain model stores rupee amounts and treats item price as
 * already tax-exclusive (packages/business/src/pricing.ts's calculateCart
 * adds CGST+SGST on top of item.price unconditionally — confirmed directly,
 * it does not consult TaxGroup.isInclusive). cloud/api's pricing.util.ts
 * does the identical "add tax on top of basePrice" math, so this is a
 * straightforward rupee->paise conversion, not a tax-inclusive/exclusive
 * split.
 */
function toMenuSyncItem(item: MenuItem, taxRatePercent: number): MenuSyncItemPayload {
  return {
    externalItemId: item.id,
    name: item.name,
    category: undefined,
    basePrice: Math.round((item.basePrice ?? item.price) * 100),
    modifierGroups: (item.modifierGroups ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      isRequired: g.isRequired,
      minSelections: g.minSelections,
      maxSelections: g.maxSelections,
      options: g.options.map((o) => ({ id: o.id, name: o.name, priceDelta: Math.round(o.priceDelta * 100) }))
    })),
    taxRate: Math.round(taxRatePercent * 100),
    isAvailable: item.isAvailable
  };
}

/**
 * Pushes every kiosk-enabled menu item to cloud/api's MenuSnapshotItem
 * table, which PaymentOrdersController prices kiosk-user's real orders
 * against. A silent no-op (not an error) if this terminal has never been
 * activated (getDeviceToken() null) or has no kiosk-enabled items — most
 * callers of this function don't want a boot-time failure surfaced to the
 * Kiosk Admin operator for something this invisible.
 */
export async function syncMenuToCloud(items: MenuItem[], taxGroups: Array<{ id: string; cgstPercent: number; sgstPercent: number }>): Promise<void> {
  const token = getDeviceToken();
  if (!token) return;

  const kioskItems = items.filter((i) => i.isKioskEnabled);
  if (kioskItems.length === 0) return;

  const payload = {
    items: kioskItems.map((item) => {
      const taxGroup = taxGroups.find((tg) => tg.id === item.taxGroupId);
      const taxRatePercent = taxGroup ? taxGroup.cgstPercent + taxGroup.sgstPercent : 0;
      return toMenuSyncItem(item, taxRatePercent);
    })
  };

  const res = await fetch(`${API_BASE}/api/v1/tenant/menu-sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const data = await parseJsonResponse(res);
    throw new CloudApiError(data?.message ?? `Menu sync failed (${res.status})`, res.status);
  }
}
```

**Step 1 verification:** `menuSyncSchema` caps at 500 items (`cloud/api/src/modules/payments/dto/menu-sync.dto.ts:29`) — if a restaurant's kiosk-enabled catalog ever exceeds that, this call 400s; that's an acceptable, clearly-surfaced failure for a catalog size no restaurant in this system's current scale approaches, not something to chunk/paginate in this task.

- [ ] **Step 2: Wire the two trigger points in App.tsx**

In `apps/kiosk-system/kiosk-admin/src/App.tsx`, import `syncMenuToCloud` and `isDeviceConnected` alongside the existing `cloudClient` imports at the top of the file (these already exist as named imports from `./cloud/cloudClient` — add `syncMenuToCloud` to that same import list).

Add a boot-time sync, once, after the device-connection state is known (find the existing `useEffect` that checks `isDeviceConnected()` on mount — Sub-project A's staff-session `startSilentRefresh()` call is the nearest anchor; add this as a sibling effect, not inside that one):

```typescript
useEffect(() => {
  if (!isDeviceConnected()) return;
  syncMenuToCloud(MenuRepository.getAllMenuItems(), db.taxGroups).catch((err) => {
    console.error('Menu sync failed:', err);
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

(`MenuRepository.getAllMenuItems()` and `db` are already imported in this file from `@jamanvaar/database` for the existing Menu Management screen — confirm the exact existing import list and reuse it rather than adding a duplicate import.)

Then find the existing menu item save/create handler(s) in the Menu Management section of this file (the ones that call `MenuRepository.createMenuItem`/`MenuRepository.updateMenuItem` — Sub-project B's earlier work in this same file added translation fields to one of these) and add the same `syncMenuToCloud(...)` call (fire-and-forget, same `.catch` pattern) immediately after each successful local save.

- [ ] **Step 3: Manual verification**

Kiosk Admin has no test runner (confirmed in this project's earlier work). Verify manually: with a device-activated Kiosk Admin instance and `cloud/api` running locally, trigger a menu save and confirm (via a direct Prisma/psql read of `MenuSnapshotItem`, or a temporary log) that the item appears with the expected `basePrice`/`taxRate` in paise/basis-points. Run `npx tsc --noEmit` in `apps/kiosk-system/kiosk-admin` and confirm clean.

- [ ] **Step 4: Commit**

```bash
git add apps/kiosk-system/kiosk-admin/src/cloud/cloudClient.ts
# App.tsx carries unrelated uncommitted work — stage only this task's hunks (git add -p, or the blob-staging technique if -p is impractical for the specific diff shape)
git commit -m "feat(kiosk-admin): push menu to cloud on boot and on save"
```

---

## Task 2: kiosk-user device activation

**Files:**
- Create: `apps/kiosk-system/kiosk-user/src/cloud/cloudClient.ts`
- Modify: `apps/kiosk-system/kiosk-user/src/App.tsx`

**Interfaces:**
- Consumes: `POST /api/v1/activation/redeem` (existing, unguarded, `cloud/api/src/modules/activation-keys/activation-redeem.controller.ts`), body `{ code, deviceType: 'KIOSK', appVersion? }` per `redeemActivationKeySchema`, response `{ device: { id, restaurantId, ... }, restaurantId, deviceToken }` per `activation-keys.service.ts`'s `redeem()` (verified directly — this response already carries a usable device token in one call, no second login step, unlike POS Admin's own more layered frontend flow which exists for POS Admin's separate owner-login needs and is not the right pattern to copy here).
- Produces: `isKioskDeviceConnected(): boolean`, `getKioskDeviceToken(): string | null`, `getKioskRestaurantId(): string | null`, `activateKioskDevice(code: string): Promise<void>` — all consumed by Task 3.

- [ ] **Step 1: Write kiosk-user's cloudClient.ts**

```typescript
// apps/kiosk-system/kiosk-user/src/cloud/cloudClient.ts

/**
 * kiosk-user's only connection to cloud/api. Unlike every other app in this
 * monorepo's activation flow, this one is deliberately a single call: a
 * walk-up customer kiosk has no staff credentials to layer a login step on
 * top of, so the activation-key redeem response's own deviceToken (which
 * cloud/api's activation-keys.service.ts already returns, unused by any
 * other app's frontend) is used directly.
 */

const API_BASE = import.meta.env.VITE_CLOUD_API_BASE_URL ?? 'http://localhost:4000';

const RESTAURANT_ID_KEY = 'jamanvaar_kiosk_user_restaurant_id';
const DEVICE_ID_KEY = 'jamanvaar_kiosk_user_device_id';
const DEVICE_TOKEN_KEY = 'jamanvaar_kiosk_user_device_token';

export class CloudApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

async function parseJsonResponse(res: Response): Promise<any> {
  const contentType = res.headers.get('content-type') ?? '';
  return contentType.includes('application/json') ? res.json() : undefined;
}

export function isKioskDeviceConnected(): boolean {
  try {
    return localStorage.getItem(DEVICE_TOKEN_KEY) !== null;
  } catch {
    return false;
  }
}

export function getKioskDeviceToken(): string | null {
  try {
    return localStorage.getItem(DEVICE_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getKioskRestaurantId(): string | null {
  try {
    return localStorage.getItem(RESTAURANT_ID_KEY);
  } catch {
    return null;
  }
}

export function getKioskDeviceId(): string | null {
  try {
    return localStorage.getItem(DEVICE_ID_KEY);
  } catch {
    return null;
  }
}

export async function activateKioskDevice(code: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/activation/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code.trim(), deviceType: 'KIOSK', appVersion: '1.0.0' })
  });

  const data = await parseJsonResponse(res);
  if (!res.ok) {
    throw new CloudApiError(data?.message ?? `Activation failed (${res.status})`, res.status);
  }

  try {
    localStorage.setItem(RESTAURANT_ID_KEY, data.restaurantId);
    localStorage.setItem(DEVICE_ID_KEY, data.device.id);
    localStorage.setItem(DEVICE_TOKEN_KEY, data.deviceToken);
  } catch {
    // Storage unavailable — activation succeeded server-side, but this
    // terminal won't remember it across reloads. Caller sees no error since
    // the current session is still usable via the in-memory result.
  }
}

export function deviceFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getKioskDeviceToken();
  if (!token) return Promise.reject(new CloudApiError('Device not activated', 401));
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers ?? {}) }
  });
}
```

- [ ] **Step 2: Write the failing manual check**

There is no test runner for this app (matching Kiosk Admin's own earlier finding). The manual check for this step: with `cloud/api` running locally and a valid activation key generated for `deviceType: 'KIOSK'` (or `'ANY'`) via Super Admin's existing activation-keys screen, call `activateKioskDevice(code)` from a scratch script or the browser console against the built app, and confirm `isKioskDeviceConnected()` becomes `true` and `getKioskRestaurantId()` returns the expected restaurant id.

- [ ] **Step 3: Add the first-run activation gate to App.tsx**

In `apps/kiosk-system/kiosk-user/src/App.tsx`, import `activateKioskDevice`, `isKioskDeviceConnected`, `getKioskRestaurantId`, `getKioskDeviceId`, `CloudApiError` from `./cloud/cloudClient`.

Add new state near the top of the `KioskUserApp` component (alongside the other `useState` declarations, e.g. near line 197's `paymentTimeLeft`):

```typescript
const [isDeviceActivated, setIsDeviceActivated] = useState<boolean>(() => isKioskDeviceConnected());
const [activationCode, setActivationCode] = useState('');
const [activationError, setActivationError] = useState('');
const [isActivating, setIsActivating] = useState(false);

const handleActivate = async (e: React.FormEvent) => {
  e.preventDefault();
  setIsActivating(true);
  setActivationError('');
  try {
    await activateKioskDevice(activationCode);
    setIsDeviceActivated(true);
  } catch (err) {
    setActivationError(err instanceof CloudApiError ? err.message : 'Activation failed');
  } finally {
    setIsActivating(false);
  }
};
```

At the top of the component's render (before the existing `step === 'LANGUAGE_SELECT'` block, replacing this app's single top-level return with a gate), add:

```tsx
if (!isDeviceActivated) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAF7F2] p-6">
      <form onSubmit={handleActivate} className="bg-white rounded-3xl p-8 max-w-md w-full shadow-lg space-y-4 text-center">
        <h1 className="text-2xl font-black text-[#0B253A]">Activate This Kiosk</h1>
        <p className="text-sm text-[#4A5568]">Enter the activation code provided by JAMANVAAR to connect this device to your restaurant.</p>
        <input
          type="text"
          value={activationCode}
          onChange={(e) => setActivationCode(e.target.value)}
          placeholder="Activation code"
          className="w-full text-center text-lg font-mono bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl px-4 py-3"
          autoFocus
        />
        {activationError && <p className="text-sm font-bold text-rose-700">{activationError}</p>}
        <button
          type="submit"
          disabled={isActivating || !activationCode.trim()}
          className="w-full py-3 rounded-2xl bg-[#E66817] text-white font-black uppercase tracking-wider disabled:opacity-60"
        >
          {isActivating ? 'Activating…' : 'Activate'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Replace every hardcoded `kioskId: 'KIOSK-01'` with the real device id**

Add near the top of the component body (after the activation-state declarations): `const kioskId = getKioskDeviceId() ?? 'KIOSK-01';` (the fallback only matters pre-activation, which the gate above already prevents reaching the rest of the render). Replace every literal `kioskId: 'KIOSK-01'` occurrence in this file (the order-creation call, the heartbeat call, and any others found via `grep -n "KIOSK-01" apps/kiosk-system/kiosk-user/src/App.tsx`) with `kioskId`.

The hardcoded `<span>Terminal KIOSK-01 • Sindhu Bhavan Road, Ahmedabad</span>` (currently the only occurrence, verified via `grep -n "Sindhu Bhavan" apps/kiosk-system/kiosk-user/src/App.tsx`) has no real local data source to replace the address portion with — no restaurant name/address field exists anywhere else in this file's local-DB reads. Rather than substitute one fabricated string for another, replace it with just the real terminal id: `<span>Terminal {kioskId}</span>`.

- [ ] **Step 5: Verify and commit**

Run `npx tsc --noEmit` in `apps/kiosk-system/kiosk-user`, confirm clean. Manually verify the activation gate blocks the app until a valid code is entered, and that a fresh `localStorage` (private window / cleared storage) shows the gate again.

```bash
git add apps/kiosk-system/kiosk-user/src/cloud/cloudClient.ts apps/kiosk-system/kiosk-user/src/App.tsx
git commit -m "feat(kiosk-user): add real device activation, remove hardcoded kiosk identity"
```

---

## Task 3: kiosk-user — real UPI checkout via Cashfree

**Files:**
- Modify: `apps/kiosk-system/kiosk-user/src/cloud/cloudClient.ts`
- Modify: `apps/kiosk-system/kiosk-user/src/App.tsx`
- Modify: `apps/kiosk-system/kiosk-user/package.json` (new dependency)

**Interfaces:**
- Consumes: `POST /api/v1/payments/orders` (existing, `DeviceAuthGuard`, gates on `device.type === 'KIOSK'` — already true after Task 2) body `{ externalOrderId, lines: [{ externalItemId, quantity, selectedOptionIds }] }`, response `{ orderId, paymentId, paymentSessionId, amount, currency, status }`. `GET /api/v1/payments/:paymentId/status`, response `{ paymentId, orderId, status, amount, currency, orderStatus }`. Task 2's `deviceFetch`, `getKioskRestaurantId`.
- Produces: `createPaymentOrder(externalOrderId, lines)`, `getPaymentOrderStatus(paymentId)` in `cloudClient.ts` — consumed by Task 5's extended polling.

- [ ] **Step 1: Add the Cashfree JS SDK dependency**

```bash
cd apps/kiosk-system/kiosk-user
npm install @cashfreepayments/cashfree-js
```

- [ ] **Step 2: Add payment-order functions to cloudClient.ts**

Append to `apps/kiosk-system/kiosk-user/src/cloud/cloudClient.ts`:

```typescript
// --- Real Cashfree Payment (Phase 3) ---

export interface PaymentOrderResult {
  orderId: string;
  paymentId: string;
  paymentSessionId: string | null;
  amount: number; // paise
  currency: string;
  status: string;
}

export interface CartLinePayload {
  externalItemId: string;
  quantity: number;
  selectedOptionIds: string[];
}

export async function createPaymentOrder(externalOrderId: string, lines: CartLinePayload[]): Promise<PaymentOrderResult> {
  const res = await deviceFetch('/api/v1/payments/orders', {
    method: 'POST',
    body: JSON.stringify({ externalOrderId, lines })
  });
  const data = await parseJsonResponse(res);
  if (!res.ok) {
    throw new CloudApiError(data?.message ?? `Payment order creation failed (${res.status})`, res.status);
  }
  return data;
}

export async function getPaymentOrderStatus(paymentId: string): Promise<{ status: string; orderStatus: string }> {
  const res = await deviceFetch(`/api/v1/payments/${paymentId}/status`);
  const data = await parseJsonResponse(res);
  if (!res.ok) {
    throw new CloudApiError(data?.message ?? `Payment status check failed (${res.status})`, res.status);
  }
  return data;
}
```

`ONLINE_PAYMENTS_NOT_ACTIVE_MESSAGE` isn't a separate exported constant — callers detect this specific case by checking `err instanceof CloudApiError && err.status === 403` from `createPaymentOrder` (the backend's exact rejection for a restaurant whose `RestaurantPaymentConnection.status !== 'ACTIVE'`, per `payments.service.ts:42`, verified directly) — a 403 here means "digital payment isn't available for this restaurant right now," not a retryable error.

- [ ] **Step 3: Replace the UPI path in `handleProceedToPayment`/`handleFinalizePayment`**

In `apps/kiosk-system/kiosk-user/src/App.tsx`, import `createPaymentOrder`, `getPaymentOrderStatus`, `getKioskRestaurantId`, `CartLinePayload` from `./cloud/cloudClient`, and `load` (as `loadCashfree`) from `@cashfreepayments/cashfree-js`.

Add new state near the other payment-related state (`paymentTxId`, etc.):

```typescript
const [realPaymentId, setRealPaymentId] = useState<string | null>(null);
const [localOrderIdForPayment, setLocalOrderIdForPayment] = useState<string | null>(null);
const [cashfreeUnavailable, setCashfreeUnavailable] = useState(false);
```

Replace `handleProceedToPayment` (currently lines 695-731) with a version that branches on `paymentMethod`. The existing mock `PaymentService.startPayment` call is removed entirely for the `UPI_QR` case (renamed `'UPI'` in the button/state below) and replaced with:

```typescript
const handleProceedToPayment = async () => {
  SoundService.playTap();
  resetIdleTimer();
  if (cartItems.length === 0) return;

  if (networkState === 'OFFLINE' && paymentMethod === 'UPI') {
    setPaymentMethod('CASH_AT_COUNTER');
    showToast('Internet offline: Switched to Pay Cash at Counter.');
  }

  setIsCartOpen(false);
  setStep('CHECKOUT_PAYMENT');
  setPaymentTimeLeft(180);
  setPaymentStatus('WAITING_FOR_USER');
  setCashfreeUnavailable(false);

  const effectiveMethod = networkState === 'OFFLINE' ? 'CASH_AT_COUNTER' : paymentMethod;

  // Create the local order PENDING first, before any network call, so it
  // has a stable id — this order is what handleSettleCash (Task 4) and the
  // real UPI success path below both act on. Never paymentStatus: 'SUCCESS'
  // here; that only ever happens once a real payment is confirmed.
  const pendingOrder = OrderRepository.createOrder({
    idempotencyKey: generateIdempotencyKey('kiosk_ord'),
    kioskId,
    sessionId,
    orderType,
    tableId: selectedTable?.id,
    tableNumber: selectedTable?.tableNumber,
    guestCount,
    customerPhone: loggedInAccount?.phone || undefined,
    customerName: loggedInAccount?.name || undefined,
    items: cartItems.map((ci) => ({
      id: generateUUID(),
      orderId: '',
      menuItemId: ci.menuItemId,
      name: ci.item.name,
      sku: ci.item.sku,
      quantity: ci.quantity,
      unitPrice: ci.unitPrice,
      modifiers: ci.selectedModifiers,
      specialInstructions: ci.specialInstructions,
      totalPrice: ci.itemTotal,
      kitchenStatus: 'PENDING'
    })),
    subtotal: rawCalculated.subtotal,
    discountAmount: rawCalculated.discountAmount + redeemedPoints + staffDiscount,
    couponCode: appliedCoupon?.code,
    cgstAmount: rawCalculated.cgstAmount,
    sgstAmount: rawCalculated.sgstAmount,
    taxAmount: rawCalculated.taxAmount,
    roundOffAmount: rawCalculated.roundOffAmount,
    totalAmount: netTotalPayable,
    paymentMethod: effectiveMethod,
    paymentStatus: 'PENDING',
    orderStatus: 'CONFIRMED',
    estimatedWaitMinutes: APP_CONSTANTS.DEFAULT_ESTIMATED_PREP_MINUTES,
    syncStatus: networkState === 'ONLINE' ? 'SYNCED' : 'SAVED_LOCALLY',
    isSynced: networkState === 'ONLINE'
  });
  setLocalOrderIdForPayment(pendingOrder.id);

  if (effectiveMethod !== 'UPI') {
    // Cash-at-counter: the order is created, kitchen prep proceeds (Task 4
    // covers the confirmation/KOT flow already in place below this
    // function), payment is settled for real later at the counter.
    return;
  }

  const restaurantId = getKioskRestaurantId();
  if (!restaurantId) {
    setCashfreeUnavailable(true);
    return;
  }

  const lines: CartLinePayload[] = cartItems.map((ci) => ({
    externalItemId: ci.menuItemId,
    quantity: ci.quantity,
    selectedOptionIds: ci.selectedModifiers.map((m) => m.optionId)
  }));

  try {
    const result = await createPaymentOrder(pendingOrder.id, lines);
    setRealPaymentId(result.paymentId);

    if (!result.paymentSessionId) {
      setCashfreeUnavailable(true);
      return;
    }

    const cashfree = await loadCashfree({ mode: import.meta.env.VITE_CASHFREE_MODE ?? 'sandbox' });
    if (!cashfree) {
      setCashfreeUnavailable(true);
      return;
    }
    cashfree.checkout({ paymentSessionId: result.paymentSessionId, redirectTarget: '_modal' });
  } catch (err) {
    // A 403 here means this restaurant's Cashfree connection isn't ACTIVE
    // yet (payments.service.ts's own gate) — not a transient failure, so no
    // retry is offered; fall straight to the cash-at-counter messaging the
    // render below already shows when cashfreeUnavailable is true.
    console.error('Payment order creation failed:', err);
    setCashfreeUnavailable(true);
  }
};
```

`OrderRepository.createOrder` is already imported in this file. `generateIdempotencyKey`, `rawCalculated`, `netTotalPayable`, `sessionId`, `orderType`, `selectedTable`, `guestCount`, `loggedInAccount`, `cartItems`, `appliedCoupon`, `redeemedPoints`, `staffDiscount`, `kioskId` (from Task 2 Step 4), `networkState` are all already in scope in this component exactly as used by the current `handleFinalizePayment` — this step only moves order-creation earlier (before payment, not after) and removes the hardcoded `paymentStatus`/`paymentTransactionId` fabrication.

- [ ] **Step 4: Poll for real confirmation and settle on success**

Replace the Payment Countdown `useEffect` (currently lines 350-362) — which today only counts down and marks `EXPIRED` — with a version that also polls when a real payment is in flight:

```typescript
useEffect(() => {
  if (step !== 'CHECKOUT_PAYMENT' || paymentStatus === 'SUCCESS' || paymentStatus === 'EXPIRED') return;

  const interval = setInterval(async () => {
    if (realPaymentId) {
      try {
        const result = await getPaymentOrderStatus(realPaymentId);
        if (result.status === 'SUCCESS') {
          setPaymentStatus('SUCCESS');
          if (localOrderIdForPayment) {
            OrderRepository.settleOrder(localOrderIdForPayment, 'UPI', undefined, realPaymentId, 'Cashfree UPI');
          }
          return;
        }
        if (result.status === 'FAILED' || result.status === 'USER_DROPPED') {
          setCashfreeUnavailable(true);
          setPaymentTimeLeft(0);
          setPaymentStatus('EXPIRED');
          return;
        }
      } catch (err) {
        console.error('Payment status poll failed:', err);
      }
    }

    setPaymentTimeLeft((prev) => {
      if (prev <= 1) {
        setPaymentStatus('EXPIRED');
        return 0;
      }
      return prev - 1;
    });
  }, 3000);

  return () => clearInterval(interval);
}, [step, paymentStatus, realPaymentId, localOrderIdForPayment]);
```

(This changes the tick interval from 1000ms to 3000ms — `paymentTimeLeft`'s displayed unit becomes "polls remaining", not literal seconds; Step 5 below adjusts the countdown initialization and display copy accordingly so the on-screen timer still reads correctly.)

- [ ] **Step 5: Adjust the countdown initialization and CHECKOUT_PAYMENT render for the new poll cadence**

In `handleProceedToPayment` (Step 3 above), `setPaymentTimeLeft(180)` was a count of seconds; with a 3-second poll tick it should now represent the same real-world ~180s window as `60` ticks. Change that call to `setPaymentTimeLeft(60)`. In the render (around line 2009), change the displayed unit:

```tsx
<span>{t('paymentExpiresIn')}: <strong className="text-[#0B253A] font-mono">{paymentTimeLeft * 3}s</strong></span>
```

- [ ] **Step 6: Manual verification (Cashfree sandbox)**

With `cloud/api` running against a restaurant whose `RestaurantPaymentConnection.status === 'ACTIVE'` (Phase 2's flow) and `CASHFREE_ENVIRONMENT` set to sandbox, and Task 1's menu-sync having populated `MenuSnapshotItem` for at least one item: activate a kiosk-user instance (Task 2), add that item to cart, choose UPI, confirm the Cashfree modal checkout opens, complete a sandbox test payment, and confirm the local order transitions to `paymentStatus: 'SUCCESS'` with a real `paymentTransactionId` (Cashfree's `cf_payment_id`, not a generated UUID). This end-to-end path cannot be exercised by an automated test in this environment (no test runner for this app, and a real/sandbox Cashfree round-trip needs live network + a configured merchant) — document the honest result of this manual pass rather than claiming automated coverage.

Run `npx tsc --noEmit` in `apps/kiosk-system/kiosk-user`, confirm clean.

- [ ] **Step 7: Commit**

```bash
git add apps/kiosk-system/kiosk-user/src/cloud/cloudClient.ts apps/kiosk-system/kiosk-user/src/App.tsx apps/kiosk-system/kiosk-user/package.json apps/kiosk-system/kiosk-user/package-lock.json
git commit -m "feat(kiosk-user): real UPI payment via Cashfree, replacing mocked checkout"
```

---

## Task 4: Cash-at-counter honesty + remove the fake card-terminal option

**Files:**
- Modify: `apps/kiosk-system/kiosk-user/src/App.tsx`

**Interfaces:**
- Consumes: Task 3's `pendingOrder`/`localOrderIdForPayment` creation path (cash-at-counter already creates the order `PENDING` as of Task 3 Step 3 — this task only touches the UI, not order creation, since Task 3 already made cash honest as a side effect of the shared creation path).
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Remove the card-terminal payment option**

In the `CHECKOUT_PAYMENT` render block (`apps/kiosk-system/kiosk-user/src/App.tsx`, currently lines 1872-2045), delete the entire "Card POS Payment" button block (currently lines 1914-1944) and the `paymentMethod === 'CARD_TERMINAL'` status-display block (currently lines 2014-2020). Change the grid from `md:grid-cols-3` to `md:grid-cols-2` (line 1881) to match the now-two payment options.

Rename the first button's method value and copy from `'UPI_QR'` to `'UPI'` throughout this render block and its `onClick` (`setPaymentMethod('UPI')`), matching the state values Task 3 introduced. Update the button label copy (`t('upiQr')`/`t('upiSubtitle')`) to reflect a real payment rather than a QR scan if those translation keys' current text implies a static QR image — this is a copy-only change; if the existing i18n keys already read generically enough ("Pay via UPI"), leave them as-is rather than inventing new keys for this task.

- [ ] **Step 2: Replace the fake QR-image block with the real Cashfree wait state**

Replace the `paymentMethod === 'UPI_QR'` block (currently lines 1995-2012, showing a static `QrCode` icon) with:

```tsx
{paymentMethod === 'UPI' && !cashfreeUnavailable && (
  <div className="space-y-4">
    <p className="text-sm font-semibold text-[#4A5568]">Complete your payment in the window that opened.</p>
    <div className="text-xs text-[#8C9BAE] font-medium flex items-center justify-center gap-1.5">
      <Clock className="w-4 h-4 text-[#E66817]" />
      <span>{t('paymentExpiresIn')}: <strong className="text-[#0B253A] font-mono">{paymentTimeLeft * 3}s</strong></span>
    </div>
  </div>
)}

{paymentMethod === 'UPI' && cashfreeUnavailable && (
  <div className="py-8 space-y-4">
    <Coins className="w-16 h-16 text-[#E66817] mx-auto" />
    <h3 className="text-xl font-black text-[#0B253A]">Online Payment Unavailable</h3>
    <p className="text-sm text-[#4A5568]">Please pay cash at the counter instead — your order is already confirmed.</p>
  </div>
)}
```

(Cashfree's own modal checkout, opened by Task 3's `cashfree.checkout(...)` call, is what the customer actually interacts with — this block is only the kiosk screen behind/after that modal.)

- [ ] **Step 3: Remove the manual "Simulate Payment Success" confirm button for the UPI path**

The existing confirm button (currently lines 2030-2040) calls `handleFinalizePayment` for every method, labeled `'Simulate Payment Success'` for non-cash methods — this was always fake. For `UPI`, there is no manual confirm anymore (Task 3's polling `useEffect` transitions `paymentStatus` to `'SUCCESS'` on its own once Cashfree/the webhook actually confirms). Change the button to only render for `CASH_AT_COUNTER`:

```tsx
{paymentMethod === 'CASH_AT_COUNTER' && (
  <div className="pt-4 border-t border-[#F3EFE6]">
    <Button
      variant="accent"
      size="touch"
      className="w-full"
      isLoading={isProcessingPayment}
      onClick={handleGetToken}
    >
      Confirm & Get Token
    </Button>
  </div>
)}
```

- [ ] **Step 4: Split `handleFinalizePayment` into a shared confirmation helper + a cash-only trigger**

`handleFinalizePayment` (original lines 734-885) did two jobs: create the order, then run the KOT/print/points/voice/confirmation-screen tail. Task 3 Step 3 already moved order creation into `handleProceedToPayment`. This step extracts the tail (everything from the original's `KdsMeshService.broadcastOrderCreated` line onward) into a standalone helper both the cash path and the real UPI success path can call, and confirms `OrderRepository.getOrderById` (`packages/database/src/repositories.ts:405`) as the accessor for re-fetching the now-settled order.

Delete `handleFinalizePayment` entirely and replace it with:

```typescript
const proceedToConfirmation = async (order: Order, isCurrentlyOnline: boolean) => {
  if (isCurrentlyOnline) {
    KdsMeshService.broadcastOrderCreated(order);
  }

  const kotItems = cartItems.map((ci, idx) => ({
    id: `koti-${Date.now()}-${idx}`,
    menuItemId: ci.menuItemId,
    name: ci.item.name,
    quantity: ci.quantity,
    modifiers: ci.selectedModifiers,
    specialInstructions: ci.specialInstructions,
    kitchenStation: ci.item.kitchenStation || 'Main Kitchen',
    status: 'PREPARING' as const
  }));
  const kots = KOTRepository.generateKOT({
    orderId: order.id,
    orderNumber: order.orderNumber,
    tokenNumber: order.tokenNumber,
    tableNumber: selectedTable?.tableNumber,
    orderType,
    items: kotItems,
    cashierName: 'Kiosk Self-Order'
  });
  kots.forEach((kot) => PrinterService.printKOT(kot));

  if (loggedInAccount) {
    const earned = Math.floor(netTotalPayable * 0.1);
    CustomerRepository.addPoints(loggedInAccount.phone, earned);
    if (redeemedPoints > 0) {
      CustomerRepository.redeemPoints(loggedInAccount.phone, redeemedPoints);
    }
  }

  if (appliedCoupon) {
    CouponRepository.incrementUsage(appliedCoupon.code);
  }

  AuditRepository.log({
    kioskId,
    action: 'ORDER_PLACED',
    category: 'ORDER',
    details: `Customer placed Order ${order.orderNumber} (Token #${order.tokenNumber}, Total ₹${order.totalAmount}, Mode: ${isCurrentlyOnline ? 'ONLINE' : 'OFFLINE_SAVED'})`
  });

  setPlacedOrder(order);
  setPaymentStatus('SUCCESS');
  setIsProcessingPayment(false);
  setStep('CONFIRMATION');
  setPrintSettled(false);

  try {
    const activePrn = PrinterService.getActivePrinter();
    const printRes = await PrinterService.printReceipt(order);
    setAutoPrintStatus({ printed: printRes.success, message: printRes.message, printerName: activePrn.name });
    if (printRes.success) {
      showToast(`🖨️ Receipt automatically printed on ${activePrn.name}`);
    }
  } catch (err) {
    console.warn('Auto print dispatch error:', err);
  } finally {
    setPrintSettled(true);
  }

  const voiceMsg = VoiceService.getConfirmationMessage(order.tokenNumber, lang, 'STANDARD', isCurrentlyOnline);
  VoiceService.speak(voiceMsg, lang);
};

const handleGetToken = async () => {
  resetIdleTimer();
  setIsProcessingPayment(true);
  if (!localOrderIdForPayment) {
    setIsProcessingPayment(false);
    return;
  }
  const order = OrderRepository.getOrderById(localOrderIdForPayment);
  if (!order) {
    setIsProcessingPayment(false);
    return;
  }
  await proceedToConfirmation(order, networkState === 'ONLINE');
};
```

`kioskId` here is Task 2 Step 4's real device id (replacing the original's hardcoded `'KIOSK-01'` in the audit log call). The `idempotencyKey`/`IdempotencyManager` duplicate-creation guard the original function opened with is no longer needed here — creation now happens once, in `handleProceedToPayment`, not on every tap of this confirm button; the button's existing `isLoading={isProcessingPayment}` already prevents a double-tap from calling this handler twice.

Now update Task 3 Step 4's polling `useEffect` (the block ending in `OrderRepository.settleOrder(localOrderIdForPayment, 'UPI', undefined, realPaymentId, 'Cashfree UPI');`) — that line alone leaves the UI on the payment screen forever and never prints a KOT. Replace that single line with:

```typescript
if (localOrderIdForPayment) {
  OrderRepository.settleOrder(localOrderIdForPayment, 'UPI', undefined, realPaymentId, 'Cashfree UPI');
  const settledOrder = OrderRepository.getOrderById(localOrderIdForPayment);
  if (settledOrder) {
    proceedToConfirmation(settledOrder, networkState === 'ONLINE');
  }
}
```

(`proceedToConfirmation` must therefore be defined earlier in the component than this `useEffect` — place it directly above the polling effect, same as the original `handleFinalizePayment`'s position relative to the countdown effect.)

- [ ] **Step 5: Verify and commit**

Manually verify: choosing Cash at Counter still produces a KOT and moves to the confirmation screen exactly as before, but the order's `paymentStatus` is now `PENDING` (not `SUCCESS`) until settled. Run `npx tsc --noEmit`, confirm clean.

```bash
git add apps/kiosk-system/kiosk-user/src/App.tsx
git commit -m "feat(kiosk-user): remove fake card-terminal option, make cash-at-counter honestly PENDING"
```

---

## Task 5: Extended reconciliation window + POS counter-settlement safety copy

**Files:**
- Modify: `apps/kiosk-system/kiosk-user/src/App.tsx`
- Modify: `apps/restaurant-system/pos/src/components/orders/PosOrdersView.tsx`

**Interfaces:**
- Consumes: Task 3's `getPaymentOrderStatus`, `realPaymentId`, `localOrderIdForPayment`; Task 4's `proceedToConfirmation(order, isCurrentlyOnline)`; `OrderRepository.settleOrder`/`getOrderById` (existing, `packages/database/src/repositories.ts:655`/`:405`); the existing `handleSettleCounterCash` (`PosOrdersView.tsx:98`) and its surrounding order-list render (confirmed at `PosOrdersView.tsx:227-232`, `order.source_type === 'KIOSK'` detection already exists).
- Produces: nothing consumed by other tasks — this is the last task in this plan.

- [ ] **Step 1: Extend polling past the visible countdown**

In the polling `useEffect` from Task 3 Step 4, the visible countdown reaching 0 currently sets `paymentStatus: 'EXPIRED'`, which the effect's own guard (`paymentStatus === 'EXPIRED'`) then stops on. Change this so expiry stops the *visible* countdown UI but not the underlying poll, for a bounded extra window. Add a new ref near the other refs in this component:

```typescript
const reconciliationDeadlineRef = useRef<number | null>(null);
```

In `handleProceedToPayment` (Task 3 Step 3), right after `setRealPaymentId(result.paymentId)`, add:

```typescript
reconciliationDeadlineRef.current = Date.now() + 5 * 60 * 1000; // 5 minutes total from order creation
```

Change the polling `useEffect`'s guard and stop condition:

```typescript
useEffect(() => {
  if (step !== 'CHECKOUT_PAYMENT' || paymentStatus === 'SUCCESS') return;
  if (!realPaymentId) {
    // Cash-at-counter path: no real payment to poll, fall back to the
    // original plain countdown.
    if (paymentStatus === 'EXPIRED') return;
    const plainInterval = setInterval(() => {
      setPaymentTimeLeft((prev) => {
        if (prev <= 1) {
          setPaymentStatus('EXPIRED');
          return 0;
        }
        return prev - 1;
      });
    }, 3000);
    return () => clearInterval(plainInterval);
  }

  const interval = setInterval(async () => {
    if (reconciliationDeadlineRef.current && Date.now() > reconciliationDeadlineRef.current) {
      clearInterval(interval);
      return;
    }

    try {
      const result = await getPaymentOrderStatus(realPaymentId);
      if (result.status === 'SUCCESS') {
        setPaymentStatus('SUCCESS');
        if (localOrderIdForPayment) {
          OrderRepository.settleOrder(localOrderIdForPayment, 'UPI', undefined, realPaymentId, 'Cashfree UPI');
          const settledOrder = OrderRepository.getOrderById(localOrderIdForPayment);
          if (settledOrder) {
            proceedToConfirmation(settledOrder, networkState === 'ONLINE');
          }
        }
        clearInterval(interval);
        return;
      }
      if (result.status === 'FAILED' || result.status === 'USER_DROPPED') {
        setCashfreeUnavailable(true);
        clearInterval(interval);
        return;
      }
    } catch (err) {
      console.error('Payment status poll failed:', err);
    }

    setPaymentTimeLeft((prev) => {
      if (prev <= 1) {
        setPaymentStatus('EXPIRED');
        return 0; // visible countdown stops; polling above continues silently until reconciliationDeadlineRef
      }
      return prev - 1;
    });
  }, 3000);

  return () => clearInterval(interval);
}, [step, paymentStatus, realPaymentId, localOrderIdForPayment]);
```

The visible "Online Payment Unavailable — please pay cash" message (Task 4 Step 2, gated on `cashfreeUnavailable`) already covers the customer-facing UI once `paymentStatus === 'EXPIRED'` — this step only keeps the background reconciliation alive for the extra window so a late webhook still settles the order automatically, without changing what the customer sees.

- [ ] **Step 2: Add the counter-staff safety warning in POS**

In `apps/restaurant-system/pos/src/components/orders/PosOrdersView.tsx`, find the order-list row rendering where `isKiosk` is computed (currently line 230-231) and the settle-cash button that calls `handleSettleCounterCash` (currently around line 321). Add a warning specifically for a kiosk-originated order whose `paymentMethod === 'UPI'` and `paymentStatus === 'PENDING'` (i.e. a UPI attempt was made and never confirmed, as opposed to a cash-at-counter order that never attempted digital payment at all):

```tsx
{isKiosk && order.paymentMethod === 'UPI' && order.paymentStatus === 'PENDING' && (
  <p className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded mb-1">
    ⚠ This order attempted UPI payment first. Confirm with the customer they haven't already paid online before accepting cash.
  </p>
)}
```

Place this immediately above the existing "Settle Cash" button for that order row. This is the manual verification step this plan's spec calls for — no new network call, no new device credential needed in the `pos` app (which has none today): kiosk-user's own extended background polling (Step 1) is what closes the gap automatically when it can; this warning is the fallback for the residual window between the visible countdown and staff actually clicking settle.

- [ ] **Step 3: Verify and commit**

Manually verify: start a UPI checkout, let the visible countdown expire without completing payment (so `cashfreeUnavailable` shows), confirm the order still appears in POS's kiosk order list with the new warning copy, still `PENDING`. Separately, verify that if the Cashfree sandbox payment is completed shortly after the visible countdown expires (within the 5-minute window), the local order transitions to `SUCCESS` on its own without staff action. Run `npx tsc --noEmit` in both `apps/kiosk-system/kiosk-user` and `apps/restaurant-system/pos`.

```bash
git add apps/kiosk-system/kiosk-user/src/App.tsx apps/restaurant-system/pos/src/components/orders/PosOrdersView.tsx
git commit -m "feat: extend background payment reconciliation, warn counter staff on unconfirmed kiosk UPI orders"
```
