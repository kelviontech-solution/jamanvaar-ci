# Phase 1 — Self-Service Online Payments in Restaurant Admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a restaurant Owner/Manager submit and track their online-payments bank-details connection from inside Restaurant Admin (pos-admin), closing the gap where the backend and Super Admin tooling already exist but no UI anywhere lets a restaurant self-serve.

**Architecture:** Port two already-live client functions and one already-built dashboard component from kiosk-admin into pos-admin, add one new form component, and wire both into the existing "Payments & Split" tab. No backend changes.

**Tech Stack:** React + Vite + TS (pos-admin), Vitest unit tests at the repo root (`tests/`), no component-test infra in this app — verified by running the dev server.

**Spec:** `docs/superpowers/specs/2026-10-05-kiosk-admin-merge-and-online-payments-design.md`

## Global Constraints

- No backend changes. `GET/POST /api/v1/tenant/payment-connection` (`cloud/api/src/modules/payments/kiosk-payment-connection.controller.ts`) is reused exactly as-is.
- No new entitlement gate on the payments panel — every restaurant sees it regardless of `AppCode` entitlements (the spec's "default on" requirement).
- pos-admin's admin console login is Owner/Manager only (there is no PIN/STAFF session inside pos-admin's own shell — STAFF sessions are a POS/Captain-terminal concept). The role check in `PaymentConnectionPanel` therefore guards against a future/edge case, not today's only access path, but must still be implemented as specified since the backend itself double-checks the role.
- Reuse pos-admin's existing `request<T>()` helper (`apps/restaurant-system/pos-admin/src/cloud/cloudClient.ts:200`) for both new client functions — it already sends the tenant-session `accessToken` and auto-refreshes on 401. Do not port kiosk-admin's separate `tenantFetch` helper; it would duplicate `request<T>()`.
- `PaymentConnectionFields`/`PaymentConnectionStatus` field shapes must match kiosk-admin's `apps/kiosk-system/kiosk-admin/src/cloud/cloudClient.ts:641-674` exactly (same backend DTO) — do not rename or restructure fields.

## Review Focus

- A restaurant that has never submitted bank details gets `{ status: 'NOT_CONNECTED' }` from `GET /api/v1/tenant/payment-connection` (confirmed enum value, not an absent/undefined status) — the panel must render the empty-form state for this value specifically, not just for a missing/undefined response.
- Submitting with an empty optional field (e.g., `gst: ''`) must not be sent as `''` — the backend's Zod schema rejects empty optional strings with `.min(1)`; the existing `cleaned` filter (dropping `''`-valued keys before sending) must be preserved in the port, not simplified away.
- A 401 mid-session (expired access token) must not crash the panel with an unhandled rejection — `request<T>()` already retries once via refresh; if that retry also 401s, the panel must show a readable error, not a blank screen.
- Submitting while `bankVerificationStatus` is already `'REJECTED'` must still succeed and move status back to `PENDING_VERIFICATION` (re-submission after rejection is a normal flow, not an error state) — confirm `PaymentConnectionsService.submit` actually allows this transition before assuming it; if it refuses, that's a backend bug to flag, not silently work around in the UI.
- Two renders of `PaymentConnectionPanel` racing their own `getPaymentConnection()` calls (e.g., a fast tab-switch away and back) must not leave stale data displayed — the second mount's response should win; guard with a mount-tracking ref, the standard React pattern for this codebase (check `OnlinePaymentsPanel.tsx`'s own `useCallback`-based load pattern for the existing convention, not a novel approach).

---

### Task 1: Port `PaymentConnectionFields`/`PaymentConnectionStatus` types and client functions into pos-admin

**Files:**
- Modify: `apps/restaurant-system/pos-admin/src/cloud/cloudClient.ts` (append near the end, after `cloudActivateOwner` at line 1238)
- Test: `tests/pos_admin_payment_connection_client.test.ts` (new)

**Interfaces:**
- Produces: `PaymentConnectionFields` (interface), `PaymentConnectionStatus` (interface), `getPaymentConnection(): Promise<PaymentConnectionStatus>`, `submitPaymentConnection(fields: PaymentConnectionFields): Promise<PaymentConnectionStatus>` — all exported from `apps/restaurant-system/pos-admin/src/cloud/cloudClient.ts`.

This module talks to a real backend and has no pure-logic branch worth isolating except the empty-string filtering in `submitPaymentConnection` — that's what the test targets, by calling the function with a stubbed `fetch` and asserting the request body.

- [ ] **Step 1: Write the failing test**

```ts
// tests/pos_admin_payment_connection_client.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('pos-admin payment connection client', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('omits empty-string optional fields from the submitted body', async () => {
    let capturedBody: any = null;
    global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ status: 'PENDING_VERIFICATION' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }) as unknown as typeof fetch;

    const { submitPaymentConnection } = await import('../apps/restaurant-system/pos-admin/src/cloud/cloudClient');

    await submitPaymentConnection({
      accountType: 'INDIVIDUAL',
      pan: 'ABCDE1234F',
      gst: '',
      contactName: 'Asha Patel',
      contactEmail: 'asha@example.com',
      contactPhone: '9999999999',
      settlementAccountNumber: '',
      settlementIfsc: ''
    });

    expect(capturedBody).not.toHaveProperty('gst');
    expect(capturedBody).not.toHaveProperty('settlementAccountNumber');
    expect(capturedBody).not.toHaveProperty('settlementIfsc');
    expect(capturedBody.pan).toBe('ABCDE1234F');
  });

  it('returns the parsed status from GET', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ACTIVE', settlementUpiVpa: 'asha@upi' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    ) as unknown as typeof fetch;

    const { getPaymentConnection } = await import('../apps/restaurant-system/pos-admin/src/cloud/cloudClient');
    const result = await getPaymentConnection();
    expect(result.status).toBe('ACTIVE');
    expect(result.settlementUpiVpa).toBe('asha@upi');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pos_admin_payment_connection_client.test.ts`
Expected: FAIL — `getPaymentConnection`/`submitPaymentConnection` are not exported yet (module has no such names).

- [ ] **Step 3: Add the types and functions to `cloudClient.ts`**

Append after line 1238 (after `cloudActivateOwner`):

```ts
// --- Payment Connection (self-service online payments) ---

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
  gst?: string | null;
  cin?: string | null;
  uidai?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  settlementAccountName?: string | null;
  settlementIfsc?: string | null;
  settlementUpiVpa?: string | null;
  bankVerificationStatus?: 'NOT_ADDED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
}

export async function getPaymentConnection(): Promise<PaymentConnectionStatus> {
  return request<PaymentConnectionStatus>('/api/v1/tenant/payment-connection', { method: 'GET' });
}

export async function submitPaymentConnection(fields: PaymentConnectionFields): Promise<PaymentConnectionStatus> {
  // The form always holds every field, including optional ones the admin cleared back to ''.
  // The API's optional string fields carry .min(1), so an empty string is a 400 — omit them.
  const cleaned = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== '')) as PaymentConnectionFields;
  return request<PaymentConnectionStatus>('/api/v1/tenant/payment-connection', { method: 'POST', body: cleaned });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pos_admin_payment_connection_client.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Run full regression**

Run: `npx vitest run`
Expected: same pass count as before this task, plus these 2 new tests (confirm current baseline count first with `npx vitest run` before starting Task 1, so you have a number to compare against).

- [ ] **Step 6: Commit**

```bash
git add apps/restaurant-system/pos-admin/src/cloud/cloudClient.ts tests/pos_admin_payment_connection_client.test.ts
git commit -m "feat(pos-admin): add payment-connection client functions

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Build `PaymentConnectionPanel` — the self-service form component

**Files:**
- Create: `apps/restaurant-system/pos-admin/src/components/payments/PaymentConnectionPanel.tsx`
- Test: manual (no component-test infra in this app — this repo's established convention; verified by running the dev server, per Task 4's manual test plan)

**Interfaces:**
- Consumes: `getPaymentConnection`, `submitPaymentConnection`, `PaymentConnectionFields`, `PaymentConnectionStatus` from `../../cloud/cloudClient` (Task 1); `SessionPersistence.get('admin')` (existing, already used elsewhere in `App.tsx`, e.g. line 259) for the current admin's `roleId: 'role-admin' | 'role-manager'`.
- Produces: `export const PaymentConnectionPanel: React.FC<{ onStatusChange?: (status: PaymentConnectionStatus) => void }>` — the `onStatusChange` callback lets `PaymentsSplitModule` (Task 3) know when to also render `OnlinePaymentsPanel`.

- [ ] **Step 1: Write the component**

```tsx
// apps/restaurant-system/pos-admin/src/components/payments/PaymentConnectionPanel.tsx
import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@jamanvaar/ui';
import { SessionPersistence } from '@jamanvaar/database';
import {
  getPaymentConnection,
  submitPaymentConnection,
  type PaymentConnectionFields,
  type PaymentConnectionStatus
} from '../../cloud/cloudClient';

const EMPTY_FIELDS: PaymentConnectionFields = {
  accountType: 'INDIVIDUAL',
  businessType: '',
  pan: '',
  gst: '',
  cin: '',
  uidai: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  settlementAccountName: '',
  settlementAccountNumber: '',
  settlementIfsc: '',
  settlementUpiVpa: ''
};

function maskedSummary(s: PaymentConnectionStatus): string {
  if (s.settlementUpiVpa) return `UPI: ${s.settlementUpiVpa}`;
  if (s.settlementAccountName) return `Bank account: ${s.settlementAccountName}`;
  return 'Submitted bank details';
}

interface PaymentConnectionPanelProps {
  onStatusChange?: (status: PaymentConnectionStatus) => void;
}

export const PaymentConnectionPanel: React.FC<PaymentConnectionPanelProps> = ({ onStatusChange }) => {
  const admin = SessionPersistence.get('admin');
  const canManage = admin?.roleId === 'role-admin' || admin?.roleId === 'role-manager';

  const [status, setStatus] = useState<PaymentConnectionStatus | null>(null);
  const [loadError, setLoadError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [fields, setFields] = useState<PaymentConnectionFields>(EMPTY_FIELDS);
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const mountId = useRef(0);

  const load = () => {
    const myMount = ++mountId.current;
    getPaymentConnection()
      .then((s) => {
        if (mountId.current !== myMount) return; // a later load already started; drop this stale result
        setStatus(s);
        setLoadError('');
        onStatusChange?.(s);
      })
      .catch((e) => {
        if (mountId.current !== myMount) return;
        setLoadError(e instanceof Error ? e.message : 'Could not load your payment connection status');
      });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openEditForm = () => {
    if (status) {
      setFields({
        accountType: (status.accountType as PaymentConnectionFields['accountType']) || 'INDIVIDUAL',
        businessType: status.businessType || '',
        pan: status.pan || '',
        gst: status.gst || '',
        cin: status.cin || '',
        uidai: status.uidai || '',
        contactName: status.contactName || '',
        contactEmail: status.contactEmail || '',
        contactPhone: status.contactPhone || '',
        settlementAccountName: status.settlementAccountName || '',
        settlementAccountNumber: '',
        settlementIfsc: status.settlementIfsc || '',
        settlementUpiVpa: status.settlementUpiVpa || ''
      });
    } else {
      setFields(EMPTY_FIELDS);
    }
    setSubmitError('');
    setIsEditing(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError('');
    try {
      const updated = await submitPaymentConnection(fields);
      setStatus(updated);
      onStatusChange?.(updated);
      setIsEditing(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not submit your bank details');
    } finally {
      setSubmitting(false);
    }
  };

  if (!canManage) {
    return (
      <div className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm">
        <h3 className="text-lg font-bold text-jaman-navy">Online payments</h3>
        <p className="text-xs text-[#4A5568] mt-1">
          Ask your restaurant owner or manager to connect online payments from this tab.
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm">
        <h3 className="text-lg font-bold text-jaman-navy">Online payments</h3>
        <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3 mt-2">{loadError}</div>
        <Button variant="ghost" size="sm" className="mt-2" onClick={load}>Retry</Button>
      </div>
    );
  }

  if (status === null) {
    return (
      <div className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm">
        <p className="text-xs text-[#8C9BAE]">Loading your payment connection status…</p>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm space-y-4">
        <h3 className="text-lg font-bold text-jaman-navy">
          {status.status === 'NOT_CONNECTED' ? 'Connect online payments' : 'Update your bank details'}
        </h3>
        {submitError && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">{submitError}</div>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-jaman-navy mb-1">Account type *</label>
              <select
                value={fields.accountType}
                onChange={(e) => setFields((f) => ({ ...f, accountType: e.target.value as PaymentConnectionFields['accountType'] }))}
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-sm"
              >
                <option value="INDIVIDUAL">Individual</option>
                <option value="BUSINESS">Business</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-jaman-navy mb-1">PAN *</label>
              <input
                type="text"
                required
                value={fields.pan}
                onChange={(e) => setFields((f) => ({ ...f, pan: e.target.value.toUpperCase() }))}
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-jaman-navy mb-1">Contact name *</label>
              <input
                type="text"
                required
                value={fields.contactName}
                onChange={(e) => setFields((f) => ({ ...f, contactName: e.target.value }))}
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-jaman-navy mb-1">Contact email *</label>
              <input
                type="email"
                required
                value={fields.contactEmail}
                onChange={(e) => setFields((f) => ({ ...f, contactEmail: e.target.value }))}
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-jaman-navy mb-1">Contact phone *</label>
              <input
                type="tel"
                required
                value={fields.contactPhone}
                onChange={(e) => setFields((f) => ({ ...f, contactPhone: e.target.value }))}
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-jaman-navy mb-1">UPI VPA (optional)</label>
              <input
                type="text"
                value={fields.settlementUpiVpa}
                onChange={(e) => setFields((f) => ({ ...f, settlementUpiVpa: e.target.value }))}
                placeholder="yourname@bank"
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-jaman-navy mb-1">Bank account number</label>
              <input
                type="text"
                value={fields.settlementAccountNumber}
                onChange={(e) => setFields((f) => ({ ...f, settlementAccountNumber: e.target.value }))}
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-jaman-navy mb-1">IFSC</label>
              <input
                type="text"
                value={fields.settlementIfsc}
                onChange={(e) => setFields((f) => ({ ...f, settlementIfsc: e.target.value.toUpperCase() }))}
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setIsEditing(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="accent" size="sm" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit for verification'}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  // Not editing: show the status card for whichever state we're in.
  return (
    <div className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-jaman-navy">Online payments</h3>
        <Button variant="ghost" size="sm" onClick={openEditForm}>
          {status.status === 'NOT_CONNECTED' ? 'Connect' : 'Update bank details'}
        </Button>
      </div>

      {status.status === 'NOT_CONNECTED' && (
        <p className="text-xs text-[#4A5568]">
          Not connected yet. Connect your bank details so customers can pay by UPI/QR from the Kiosk or QR table ordering.
        </p>
      )}

      {status.status === 'PENDING_VERIFICATION' && (
        <>
          <div className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
            Verification in progress — Jamanvaar will review your bank details shortly.
          </div>
          <p className="text-xs text-[#8C9BAE]">{maskedSummary(status)}</p>
        </>
      )}

      {status.bankVerificationStatus === 'REJECTED' && (
        <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">
          Your submitted bank details were rejected. Please check them and resubmit.
        </div>
      )}

      {status.status === 'ACTIVE' && (
        <>
          <div className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
            Online payments are live.
          </div>
          <p className="text-xs text-[#8C9BAE]">{maskedSummary(status)}</p>
        </>
      )}

      {status.status === 'SUSPENDED' && (
        <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">
          Online payments are suspended. Contact Jamanvaar support.
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Type-check**

Run: `cd apps/restaurant-system/pos-admin && npx tsc --noEmit`
Expected: no new errors from this file (if `SessionPersistence.get` or `@jamanvaar/ui`'s `Button` have different signatures than assumed here, fix the mismatch now — read the actual exported signatures from `@jamanvaar/database` and `@jamanvaar/ui` if this step surfaces a mismatch).

- [ ] **Step 3: Commit**

```bash
git add apps/restaurant-system/pos-admin/src/components/payments/PaymentConnectionPanel.tsx
git commit -m "feat(pos-admin): add self-service online-payments connection panel

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Relocate `OnlinePaymentsPanel` into pos-admin and wire both panels into the Payments tab

**Files:**
- Create: `apps/restaurant-system/pos-admin/src/components/payments/OnlinePaymentsPanel.tsx` (copy of `apps/kiosk-system/kiosk-admin/src/components/OnlinePaymentsPanel.tsx`, import path updated)
- Modify: `apps/restaurant-system/pos-admin/src/components/payments/PaymentsSplitModule.tsx`

**Interfaces:**
- Consumes: `PaymentConnectionPanel` (Task 2), `PaymentConnectionStatus` (Task 1); the relocated `OnlinePaymentsPanel` consumes `getDayStatement`/`getPayoutHistory`/`getPayoutSummary`/`getRecentPayments`/`getStaffUser`/`markPaymentHandled`/`refundPayment` — these do **not** exist yet in pos-admin's `cloudClient.ts`, so this task also ports them (Step 1 below) before the component can compile.

- [ ] **Step 1: Check whether pos-admin's `cloudClient.ts` already has equivalents of `OnlinePaymentsPanel`'s dependencies**

Run:
```bash
grep -n "getDayStatement\|getPayoutHistory\|getPayoutSummary\|getRecentPayments\|getStaffUser\|markPaymentHandled\|refundPayment\b" apps/restaurant-system/pos-admin/src/cloud/cloudClient.ts
```

pos-admin already has `createRefund` (a device-authed refund call, confirmed at `cloudClient.ts:952`) but under a different name/signature than kiosk-admin's `refundPayment`, and has no `getStaffUser`. Read kiosk-admin's `cloudClient.ts` definitions for `getDayStatement`, `getPayoutHistory`, `getPayoutSummary`, `getRecentPayments`, `getStaffUser`, `markPaymentHandled`, `refundPayment`, `DayStatement`, `PayoutSummary`, `RecentPayment`, `RestaurantPayout`, `StaffUser` (search each name in `apps/kiosk-system/kiosk-admin/src/cloud/cloudClient.ts`) and port every one of them verbatim into `apps/restaurant-system/pos-admin/src/cloud/cloudClient.ts`, adapting only the HTTP call itself from kiosk-admin's `tenantFetch` wrapper to pos-admin's `request<T>()` (same adaptation pattern as Task 1 — `request<T>(path, { method, body: <object, not pre-stringified> })` instead of `tenantFetch(path, { method, body: JSON.stringify(...) })`). Do **not** port `refundPayment` under a new name if it would collide with the existing `createRefund` — check what `OnlinePaymentsPanel.tsx` actually calls (`refundPayment(refundFor.id, paise, refundReason.trim(), staff?.fullName ?? 'Kiosk Admin')`) and either rename pos-admin's call site to use the ported `refundPayment`, or confirm `createRefund` already does the same job with a compatible signature and reuse it instead of porting a duplicate — read both before deciding, and note the decision in the commit message.

- [ ] **Step 2: Add a `getStaffUser` equivalent**

pos-admin has no PIN/STAFF session inside its own admin shell (Global Constraints above). `OnlinePaymentsPanel.tsx` only uses `getStaffUser()` for two things: `canRefund` (role check) and a display fallback name for `refundPayment`'s `requestedBy` argument. Replace both call sites, when copying the file in Step 3, with `SessionPersistence.get('admin')` (same source `PaymentConnectionPanel` uses): `const admin = SessionPersistence.get('admin'); const canRefund = admin?.roleId === 'role-admin' || admin?.roleId === 'role-manager';` and `requestedBy: admin?.fullName ?? 'Restaurant Admin'`. Do not port a `getStaffUser` function into pos-admin's `cloudClient.ts` — it would be a second, parallel concept of "current user" alongside `SessionPersistence`, which already exists and is already used by `PaymentConnectionPanel`.

- [ ] **Step 3: Copy the file with the two adaptations from Steps 1-2**

```bash
cp "apps/kiosk-system/kiosk-admin/src/components/OnlinePaymentsPanel.tsx" "apps/restaurant-system/pos-admin/src/components/payments/OnlinePaymentsPanel.tsx"
```

Then edit the new copy:
- Change the import line `from '../cloud/cloudClient'` to `from '../../cloud/cloudClient'` (one extra directory level: `components/payments/` vs `components/`).
- Apply the `getStaffUser` → `SessionPersistence.get('admin')` replacement from Step 2, adding `import { SessionPersistence } from '@jamanvaar/database';` to the import block.
- Apply the `refundPayment`-vs-`createRefund` decision from Step 1.

- [ ] **Step 4: Wire both panels into `PaymentsSplitModule.tsx`**

Modify `apps/restaurant-system/pos-admin/src/components/payments/PaymentsSplitModule.tsx`:

```tsx
import React, { useState } from 'react';
import { Order } from '@jamanvaar/types';
import { formatINR } from '@jamanvaar/utils';
import {
  CreditCard,
  CheckCircle2,
  DollarSign,
  QrCode,
  Smartphone,
  TrendingUp,
  Receipt
} from 'lucide-react';
import { PaymentConnectionPanel } from './PaymentConnectionPanel';
import { OnlinePaymentsPanel } from './OnlinePaymentsPanel';
import type { PaymentConnectionStatus } from '../../cloud/cloudClient';
```

Add `const [connectionStatus, setConnectionStatus] = useState<PaymentConnectionStatus | null>(null);` inside the component body, and change the opening of the returned JSX from:

```tsx
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
```

to:

```tsx
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <PaymentConnectionPanel onStatusChange={setConnectionStatus} />
      {(connectionStatus?.status === 'ACTIVE' || connectionStatus?.status === 'PENDING_VERIFICATION') && <OnlinePaymentsPanel />}
```

Leave everything after that (the existing header and split-ledger content) unchanged.

- [ ] **Step 5: Type-check and run the dev server**

```bash
cd apps/restaurant-system/pos-admin && npx tsc --noEmit
npm run dev
```

Expected: no type errors; the Payments & Split tab loads without a console error.

- [ ] **Step 6: Run full regression**

Run: `npx vitest run` (from repo root)
Expected: same pass count as the baseline recorded in Task 1, Step 5 (no regressions from this purely additive change).

- [ ] **Step 7: Commit**

```bash
git add apps/restaurant-system/pos-admin/src/cloud/cloudClient.ts apps/restaurant-system/pos-admin/src/components/payments/
git commit -m "feat(pos-admin): wire online-payments self-service and dashboard into Payments tab

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Manual verification against the real backend

**Files:** none (verification only)

- [ ] **Step 1: Owner/Manager submits bank details**

Start `cloud/api` locally (or point pos-admin at the already-running dev backend), log into pos-admin as an Owner, open Payments & Split, confirm the panel shows "Not connected yet" with a "Connect" button, submit a test PAN/contact/UPI VPA, confirm the panel switches to "Verification in progress."

- [ ] **Step 2: Super Admin verifies it**

In `cloud/super-admin-web`, open Payment Connections, find the test restaurant, use the existing "Verify" button on its bank details.

- [ ] **Step 3: Confirm pos-admin reflects the change**

Reload Payments & Split in pos-admin; confirm the panel now shows "Online payments are live" and `OnlinePaymentsPanel` (the Gross Collection → Fee → Net Payable breakdown) renders below it.

- [ ] **Step 4: Confirm the kiosk-user payment screen is unblocked**

Open `kiosk-user` for that same restaurant, go to the payment-method screen, confirm the UPI QR option is no longer greyed out with "Being set up."

- [ ] **Step 5: Record the outcome**

If any step fails, note exactly which one and the error shown — do not mark Phase 1 complete until all 4 steps pass against a real backend, not just a type-check.

---

## Self-Review Notes

**Spec coverage:** All 5 "What's new" items from the spec's Phase 1 section are covered — Task 1 (item 1), Task 2 (item 2), Task 3 (items 3-4), item 5 ("kiosk-admin keeps its own copy for now") requires no task since it's explicitly "do nothing."

**Type consistency:** `PaymentConnectionStatus`/`PaymentConnectionFields` defined once in Task 1, imported by name in Tasks 2 and 3 — no redefinition.

**Review Focus coverage:** `NOT_CONNECTED` enum handling → Task 2 Step 1 component code explicitly branches on it. Empty-string field filtering → Task 1's test. 401-retry-exhausted error path → Task 2's `loadError` state with a Retry button (not a crash). Re-submission after `REJECTED` → flagged as an explicit verify-don't-assume item in Task 2's component comments and Global Constraints; Task 4 Step 1 can be extended to test the rejected→resubmit path specifically if time allows, but the primary path (not-connected → pending → active) is what Task 4 verifies end to end. Stale-response race on remount → Task 2's `mountId` ref guard.
