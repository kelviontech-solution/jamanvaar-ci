# JAMANVAAR Phase 8: Kiosk Activation Flow Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (native, in-session).
> Subagents disallowed. Steps use checkbox (`- [ ]`) syntax for tracking. No automated frontend
> test infrastructure exists in `apps/kiosk-system/kiosk-user` — every task is verified by
> actually running the app (`npm run dev`) and exercising the flow, the same pattern Phases 4 and
> 7 used for their frontends.

**Goal:** Replace `kiosk-user`'s single-field "type an activation key and hope" first-launch
screen with a flow that confirms the restaurant by its customer-facing `restaurantCode` before
redeeming the key, shows real progress through verifying/registering/syncing instead of one bare
"Connecting kiosk…" state, and ends on a screen naming the restaurant and terminal that was just
connected instead of silently dropping into the main ordering UI.

**Architecture:** No backend changes. `cloud/api`'s `activation/redeem` endpoint already resolves
a restaurant from the activation key alone (confirmed by reading
`activation-keys.service.ts:349` — `restaurantId` comes from the claimed key row, never from the
request body), so `restaurantCode` is not a redeem *parameter* — it's a pre-flight confirmation
step using Phase 1's existing `POST /api/v1/restaurant-lookup/resolve` (unguarded, read-only,
already built for exactly this). The flow becomes: resolve the typed `restaurantCode` to a name
(catches a typo before anything is submitted) → redeem the activation key (existing, unchanged
call) → pull the freshly-activated restaurant's identity via `cloudClient.ts`'s already-exported
but currently-uncalled `syncRestaurantIdentity()` → show a success screen. `App.tsx`'s activation
gate becomes a 5-state machine (`form → verifying → registering → syncing → success`) instead of
one boolean plus a spinner label.

**Tech Stack:** React 18 + Vite + Tauri, TypeScript — no test runner in this app.

**Spec:** `docs/superpowers/plans/2026-09-24-jamanvaar-commercial-platform-redesign-MASTER.md`
(§ "Phase 8").

## Findings from reading the actual kiosk-user code (corrects the master plan's Phase 8 scope)

- `cloudClient.ts`'s `activateKioskDevice(code)` already sends `{ code, deviceType: 'KIOSK',
  appVersion }` with no `restaurantId`/`restaurantCode` field — the redeem endpoint has never
  needed one, and this phase does not add one to the request. `restaurantCode` is purely a
  human-facing confirmation step layered in front of the existing call.
- `syncRestaurantIdentity()` (`cloudClient.ts:198`) already exists, already wraps the real
  `pullRestaurantIdentity` sync call, and is already exported — but is never called anywhere in
  `App.tsx` today (confirmed by grep: zero call sites). The "syncing" progress state this phase
  adds is this function, called for real, not a synthetic delay.
- `activateKioskDevice` today discards the redeem response's `restaurantId`, returning only
  `ActivationRestaurantBranding | null` (`{ name, gstin, address }`). It's extended to also
  return `restaurantId`, so the flow can compare it against the `restaurantCode` lookup's own
  `restaurantId` and flag the rare case where they don't match (the activation key belongs to a
  different restaurant than the ID that was typed) — the device is still correctly activated
  either way (redeem is the source of truth), this is a heads-up, not a new failure mode.
- The activation screen already has an `ActivationNoticeBanner` (shows any platform-wide
  maintenance notice) and an `ActivationHelpNote` — both are reused unchanged; this phase only
  adds the restaurant-ID field, the step machine, and the success screen around them.

## Global Constraints

- No backend files change — this phase is 100% `apps/kiosk-system/kiosk-user`.
- A failure at any step (`verifying`, `registering`, `syncing`) must return the installer to the
  editable form with a clear message, never strand them on a spinner with no way back — matching
  the existing `activationError` pattern this screen already has for redeem failures.
- The success screen is genuinely informational, not a blocking gate — it auto-advances into the
  main kiosk UI after a short pause, with a manual "Continue" button for anyone who doesn't want
  to wait, since a kiosk terminal has no one around to read a screen that requires interaction to
  dismiss on every single first boot.
- `restaurantCode` input is validated client-side against the same shape the backend enforces
  (`JM` + a mobile starting `6`-`9` + 9 more digits — `RESTAURANT_CODE_RE` in
  `cloud/api/src/modules/restaurants/restaurant-code.util.ts`) before ever calling the network,
  so a malformed entry never reaches the lookup endpoint as a wasted round trip.

## Review Focus

- Typing a `restaurantCode` that doesn't resolve to any restaurant (a typo, or one that was
  never assigned one) must show a clear, specific error and let the installer correct just that
  field — not a generic "Activation failed." Covered by Task 1's test.
- A redeem that succeeds for a *different* restaurant than the typed `restaurantCode` resolved to
  must still complete (the key is the source of truth) but the success screen must say so
  plainly, not silently show the restaurant the installer *expected*. Covered by Task 3's test.
- Losing network partway through (e.g. the `syncRestaurantIdentity` pull fails after a
  successful redeem) must not strand the installer on the "syncing" spinner forever or fail the
  whole activation — the device is already correctly activated at that point; a sync failure
  here is logged/ignored and the flow still reaches success. Covered by Task 2's test.
- Re-running the exact same activation key a second time (e.g. the installer double-taps
  "Activate") must show the existing "already redeemed" server error cleanly through the new
  step machine, not get stuck in `registering`. Covered by Task 2's test.

---

### Task 1: `resolveRestaurantByCode` + client-side format validation

**Files:**
- Modify: `apps/kiosk-system/kiosk-user/src/cloud/cloudClient.ts`

**Interfaces:**
- Consumes: `POST /api/v1/restaurant-lookup/resolve` (existing, Phase 1) → `{ restaurantId:
  string; name: string }` on success, 404 on an unknown code.
- Produces: `export const RESTAURANT_CODE_RE: RegExp`, `export async function
  resolveRestaurantByCode(code: string): Promise<{ restaurantId: string; name: string }>` (throws
  `CloudApiError` on any non-2xx) — both consumed by Task 2.

- [ ] **Step 1: Add the regex and resolver function**

In `apps/kiosk-system/kiosk-user/src/cloud/cloudClient.ts`, add near the top (after the
`API_BASE`/key constants, before `CloudApiError`'s first use):

```typescript
/** Mirrors cloud/api's restaurant-code.util.ts RESTAURANT_CODE_RE exactly — "JM" + a mobile
 * number starting 6-9 + 9 more digits. Checked client-side so a malformed entry never reaches
 * the network as a wasted round trip. */
export const RESTAURANT_CODE_RE = /^JM[6-9][0-9]{9}$/;
```

Add the resolver function after `activateKioskDevice` (it has no side effects on
localStorage/repositories — a pure lookup):

```typescript
export interface ResolvedRestaurant {
  restaurantId: string;
  name: string;
}

export async function resolveRestaurantByCode(code: string): Promise<ResolvedRestaurant> {
  const res = await fetch(`${API_BASE}/api/v1/restaurant-lookup/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ restaurantCode: code.trim().toUpperCase() })
  });
  const data = await parseJsonResponse(res);
  if (!res.ok) {
    throw new CloudApiError(
      res.status === 404
        ? "We couldn't find a restaurant with that ID. Double-check it with your Super Admin."
        : data?.message ?? `Lookup failed (${res.status})`,
      res.status
    );
  }
  return data;
}
```

- [ ] **Step 2: Extend `activateKioskDevice` to also return `restaurantId`**

Find the existing function:

```typescript
export async function activateKioskDevice(code: string): Promise<ActivationRestaurantBranding | null> {
```

Change its return type and final return statement. Replace:

```typescript
export interface ActivationRestaurantBranding {
  name: string;
  gstin: string | null;
  address: string | null;
}

export async function activateKioskDevice(code: string): Promise<ActivationRestaurantBranding | null> {
```

with:

```typescript
export interface ActivationRestaurantBranding {
  name: string;
  gstin: string | null;
  address: string | null;
}

export interface ActivationResult {
  restaurantId: string;
  deviceId: string;
  branding: ActivationRestaurantBranding | null;
}

export async function activateKioskDevice(code: string): Promise<ActivationResult> {
```

Find the function's final line:

```typescript
  // Real branding, so the welcome screen stops showing db.ts's local seed
  // placeholder ("My Restaurant") the moment this terminal is activated.
  return data.restaurant ?? null;
}
```

Replace with:

```typescript
  // Real branding, so the welcome screen stops showing db.ts's local seed
  // placeholder ("My Restaurant") the moment this terminal is activated.
  return { restaurantId: data.restaurantId, deviceId: data.device.id, branding: data.restaurant ?? null };
}
```

(`activateKioskDevice`'s only existing caller is `App.tsx`'s `handleActivate`, updated in Task 2
— this is not a breaking change to any other file.)

- [ ] **Step 3: Verify the typecheck**

Run: `cd apps/kiosk-system/kiosk-user && npx tsc --noEmit`
Expected: an error in `App.tsx` at the `activateKioskDevice` call site (`branding` used where the
whole result now returns) — this confirms the type change took effect; Task 2 fixes the call
site.

- [ ] **Step 4: Commit**

```bash
git add apps/kiosk-system/kiosk-user/src/cloud/cloudClient.ts
git commit -m "feat(kiosk-user): add restaurant-code lookup and return restaurantId from activation"
```

---

### Task 2: Two-field form + verifying/registering/syncing step machine

**Files:**
- Modify: `apps/kiosk-system/kiosk-user/src/App.tsx`

**Interfaces:**
- Consumes: `RESTAURANT_CODE_RE`, `resolveRestaurantByCode`, `ActivationResult`,
  `syncRestaurantIdentity` (Task 1 + existing).
- Produces: an `activationStep: 'form' | 'verifying' | 'registering' | 'syncing' | 'success'`
  state and an `activationResult: { restaurantName: string; deviceId: string; mismatchNote:
  string | null } | null` state — consumed by Task 3's success screen.

- [ ] **Step 1: Update imports**

Find:

```typescript
  activateKioskDevice,
```

Add alongside it (same import block from `./cloud/cloudClient`):

```typescript
  activateKioskDevice,
  resolveRestaurantByCode,
  syncRestaurantIdentity,
  RESTAURANT_CODE_RE,
```

- [ ] **Step 2: Replace the activation state and `handleActivate`**

Find:

```typescript
  const [isDeviceActivated, setIsDeviceActivated] = useState<boolean>(() => isKioskDeviceConnected());
  const [activationCode, setActivationCode] = useState('');
  const [activationError, setActivationError] = useState('');
  const [isActivating, setIsActivating] = useState(false);
  const [showKeyHint, setShowKeyHint] = useState(false);
  const kioskId = getKioskDeviceId() ?? 'KIOSK-01';

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsActivating(true);
    setActivationError('');
    try {
      const branding = await activateKioskDevice(activationCode);
      if (branding) {
        RestaurantIdentityRepository.adopt(getKioskRestaurantId() || db.restaurant.id, branding);
        db.notify();
      }
      setIsDeviceActivated(true);
    } catch (err) {
      setActivationError(err instanceof CloudApiError ? err.message : 'Activation failed');
    } finally {
      setIsActivating(false);
    }
  };
```

Replace with:

```typescript
  const [isDeviceActivated, setIsDeviceActivated] = useState<boolean>(() => isKioskDeviceConnected());
  const [restaurantCodeInput, setRestaurantCodeInput] = useState('');
  const [activationCode, setActivationCode] = useState('');
  const [activationError, setActivationError] = useState('');
  const [showKeyHint, setShowKeyHint] = useState(false);
  const kioskId = getKioskDeviceId() ?? 'KIOSK-01';

  type ActivationStep = 'form' | 'verifying' | 'registering' | 'syncing' | 'success';
  const [activationStep, setActivationStep] = useState<ActivationStep>('form');
  const [activationSuccess, setActivationSuccess] = useState<{
    restaurantName: string;
    deviceId: string;
    mismatchNote: string | null;
  } | null>(null);

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    setActivationError('');

    const typedCode = restaurantCodeInput.trim().toUpperCase();
    if (!RESTAURANT_CODE_RE.test(typedCode)) {
      setActivationError('Restaurant ID must look like JM9876543210.');
      return;
    }

    setActivationStep('verifying');
    let resolved: { restaurantId: string; name: string };
    try {
      resolved = await resolveRestaurantByCode(typedCode);
    } catch (err) {
      setActivationError(err instanceof CloudApiError ? err.message : 'Could not verify that Restaurant ID');
      setActivationStep('form');
      return;
    }

    setActivationStep('registering');
    let result: Awaited<ReturnType<typeof activateKioskDevice>>;
    try {
      result = await activateKioskDevice(activationCode);
    } catch (err) {
      setActivationError(err instanceof CloudApiError ? err.message : 'Activation failed');
      setActivationStep('form');
      return;
    }

    if (result.branding) {
      RestaurantIdentityRepository.adopt(getKioskRestaurantId() || db.restaurant.id, result.branding);
      db.notify();
    }

    setActivationStep('syncing');
    try {
      await syncRestaurantIdentity();
    } catch {
      // The device is already correctly activated at this point (redeem already succeeded) — a
      // failed identity pull just means the very latest edits sync on the next heartbeat instead
      // of immediately. Never strand the installer here or fail an otherwise-successful activation.
    }

    setActivationSuccess({
      restaurantName: result.branding?.name ?? resolved.name,
      deviceId: result.deviceId,
      mismatchNote:
        result.restaurantId !== resolved.restaurantId
          ? `This activation key belongs to a different restaurant (${result.branding?.name ?? 'unknown'}) than the ID you entered (${resolved.name}). The kiosk is connected to ${result.branding?.name ?? 'the key\'s restaurant'}.`
          : null
    });
    setActivationStep('success');
    setIsDeviceActivated(true);
  };
```

- [ ] **Step 3: Verify the typecheck**

Run: `cd apps/kiosk-system/kiosk-user && npx tsc --noEmit`
Expected: no errors (the `isActivating` state this replaces is fixed up in Step 4 below, where
its remaining UI references are updated).

- [ ] **Step 4: Update the form UI — restaurant-ID field, step-aware button, and error placement**

Find the activation `<form>` (inside the `if (!isDeviceActivated)` block):

```typescript
          <form onSubmit={handleActivate} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="kiosk-activation-key" className="text-xs font-extrabold text-jaman-navy flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-jaman-saffron" />
                  Activation Key *
                </label>
                <button
                  type="button"
                  onClick={() => setShowKeyHint((v) => !v)}
                  className="text-xs font-bold text-jaman-navy/70 hover:text-jaman-saffron flex items-center gap-1 cursor-pointer"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  Where can I find this?
                </button>
              </div>
              {showKeyHint && (
                <p className="text-[11px] text-[#52677A] font-medium bg-[#FFF8EE] border border-[#F0E2D0] rounded-xl px-3 py-2 mb-2">
                  Your restaurant owner gets it from Restaurant Admin under Subscription Plans, Device &amp; Staff Logins, once JAMANVAAR has activated your plan.
                </p>
              )}
              <input
                id="kiosk-activation-key"
                type="text"
                value={activationCode}
                onChange={(e) => setActivationCode(formatActivationKeyInput(e.target.value))}
                placeholder="JMV-XXXX-XXXX-XXXX"
                required
                autoFocus
                inputMode="text"
                aria-describedby={activationError ? 'kiosk-activation-error' : undefined}
                className="w-full bg-[#FFFCF8] border-[1.5px] border-[#E5D7C8] focus:border-[#F97316] focus:shadow-[0_0_0_4px_rgba(249,115,22,0.10)] rounded-2xl px-5 py-4 text-lg text-center font-mono text-jaman-navy font-bold focus:outline-hidden transition-all uppercase tracking-wider placeholder:text-slate-400"
              />
            </div>
            {activationError && (
              <div id="kiosk-activation-error" role="alert" className="text-sm font-bold text-rose-700 bg-rose-50 border border-rose-200 px-4 py-3 rounded-2xl text-center flex items-center justify-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{activationError}</span>
              </div>
            )}
            <button
              type="submit"
              disabled={isActivating || !activationCode.trim()}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#FF8A00] to-[#F97316] hover:brightness-105 disabled:opacity-50 disabled:grayscale text-white font-extrabold text-base shadow-[0_10px_24px_rgba(249,115,22,0.28)] transition-all active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2"
            >
              <span>{isActivating ? 'Connecting kiosk…' : 'Activate Kiosk'}</span>
              {!isActivating && <ArrowRight className="w-5 h-5" />}
            </button>
          </form>
```

Replace the whole block with (adds the Restaurant ID field above the key field, and drives the
button label/disabled state off `activationStep` instead of the removed `isActivating`):

```typescript
          <form onSubmit={handleActivate} className="space-y-4">
            <div>
              <label htmlFor="kiosk-restaurant-code" className="text-xs font-extrabold text-jaman-navy flex items-center gap-1.5 mb-1.5">
                <Store className="w-3.5 h-3.5 text-jaman-saffron" />
                Restaurant ID *
              </label>
              <input
                id="kiosk-restaurant-code"
                type="text"
                value={restaurantCodeInput}
                onChange={(e) => setRestaurantCodeInput(e.target.value.toUpperCase())}
                placeholder="JM9876543210"
                required
                autoFocus
                inputMode="text"
                className="w-full bg-[#FFFCF8] border-[1.5px] border-[#E5D7C8] focus:border-[#F97316] focus:shadow-[0_0_0_4px_rgba(249,115,22,0.10)] rounded-2xl px-5 py-4 text-lg text-center font-mono text-jaman-navy font-bold focus:outline-hidden transition-all uppercase tracking-wider placeholder:text-slate-400"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="kiosk-activation-key" className="text-xs font-extrabold text-jaman-navy flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-jaman-saffron" />
                  Activation Key *
                </label>
                <button
                  type="button"
                  onClick={() => setShowKeyHint((v) => !v)}
                  className="text-xs font-bold text-jaman-navy/70 hover:text-jaman-saffron flex items-center gap-1 cursor-pointer"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  Where can I find this?
                </button>
              </div>
              {showKeyHint && (
                <p className="text-[11px] text-[#52677A] font-medium bg-[#FFF8EE] border border-[#F0E2D0] rounded-xl px-3 py-2 mb-2">
                  Your restaurant owner gets both of these from Restaurant Admin under Subscription Plans, Device &amp; Staff Logins, once JAMANVAAR has activated your plan.
                </p>
              )}
              <input
                id="kiosk-activation-key"
                type="text"
                value={activationCode}
                onChange={(e) => setActivationCode(formatActivationKeyInput(e.target.value))}
                placeholder="JMV-XXXX-XXXX-XXXX"
                required
                inputMode="text"
                aria-describedby={activationError ? 'kiosk-activation-error' : undefined}
                className="w-full bg-[#FFFCF8] border-[1.5px] border-[#E5D7C8] focus:border-[#F97316] focus:shadow-[0_0_0_4px_rgba(249,115,22,0.10)] rounded-2xl px-5 py-4 text-lg text-center font-mono text-jaman-navy font-bold focus:outline-hidden transition-all uppercase tracking-wider placeholder:text-slate-400"
              />
            </div>
            {activationError && (
              <div id="kiosk-activation-error" role="alert" className="text-sm font-bold text-rose-700 bg-rose-50 border border-rose-200 px-4 py-3 rounded-2xl text-center flex items-center justify-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{activationError}</span>
              </div>
            )}
            <button
              type="submit"
              disabled={activationStep !== 'form' || !activationCode.trim() || !restaurantCodeInput.trim()}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#FF8A00] to-[#F97316] hover:brightness-105 disabled:opacity-50 disabled:grayscale text-white font-extrabold text-base shadow-[0_10px_24px_rgba(249,115,22,0.28)] transition-all active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2"
            >
              <span>
                {activationStep === 'verifying' && 'Verifying restaurant…'}
                {activationStep === 'registering' && 'Connecting kiosk…'}
                {activationStep === 'syncing' && 'Syncing restaurant details…'}
                {activationStep === 'form' && 'Activate Kiosk'}
              </span>
              {activationStep === 'form' && <ArrowRight className="w-5 h-5" />}
            </button>
          </form>
```

Add `Store` to the existing `lucide-react` import list at the top of the file if it isn't already
imported (check first — several icons are already imported from `lucide-react` in this file; add
`Store` to that same import statement only if missing).

- [ ] **Step 5: Run the typecheck**

Run: `cd apps/kiosk-system/kiosk-user && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Verify by running the app**

Run `cd cloud/api && npm run start:dev` and `cd apps/kiosk-system/kiosk-user && npm run dev`
(port 5174). Using a real restaurant + activation key from the dev database (mint one from
Super Admin's Restaurants page, same as Phase 7's verification did):
1. Enter a malformed Restaurant ID (e.g. `ABC123`) — confirm the client-side format error appears
   with no network call (check via the browser's network tab or Playwright's
   `browser_network_requests`).
2. Enter a well-formed but non-existent Restaurant ID with a valid key — confirm the "couldn't
   find a restaurant" error appears and the form is editable again (not stuck on "Verifying…").
3. Enter the real Restaurant ID with an already-redeemed or invalid key — confirm the existing
   redeem error surfaces cleanly and the form is editable again (not stuck on "Connecting…").
4. Enter a correct, unredeemed pair — confirm the button label progresses "Verifying
   restaurant…" → "Connecting kiosk…" → "Syncing restaurant details…" and the device ends up
   activated (Task 3 covers the resulting success screen).

- [ ] **Step 7: Commit**

```bash
git add apps/kiosk-system/kiosk-user/src/App.tsx
git commit -m "feat(kiosk-user): confirm restaurant by ID before redeeming the activation key, with real progress states"
```

---

### Task 3: Success screen naming the restaurant and device

**Files:**
- Modify: `apps/kiosk-system/kiosk-user/src/App.tsx`

**Interfaces:**
- Consumes: `activationStep`, `activationSuccess` (Task 2).
- Produces: nothing consumed elsewhere — this is the terminal UI state of the activation flow.

- [ ] **Step 1: Add the success screen as a new early-return, before the existing activation-gate return**

Find the existing activation gate:

```typescript
  if (!isDeviceActivated) {
    return (
      <JAMANVAARStartup appName="Self-Order Kiosk" appType="KIOSK" subtitle="Customer Self-Ordering Terminal">
```

Immediately before this `if`, add a new one for the success screen (it must come first, since
`isDeviceActivated` is already `true` by the time `activationStep === 'success'`, which would
otherwise fall through past the gate straight into the main app before the installer sees it):

```typescript
  if (activationStep === 'success' && activationSuccess) {
    return (
      <div className="min-h-screen bg-jaman-ivory flex flex-col items-center justify-center p-8 text-center select-none">
        <div className="flex justify-center">
          <JamanvaarLogo variant="horizontal" size="xl" imgStyle={{ height: '80px', width: 'auto' }} />
        </div>
        <div className="mt-8 p-8 max-w-md bg-white rounded-3xl border border-jaman-border shadow-xl">
          <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto text-emerald-600 mb-4">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black text-jaman-navy">Kiosk Connected!</h2>
          <p className="text-sm text-[#4A5568] mt-3 leading-relaxed">
            This terminal is now activated for <strong>{activationSuccess.restaurantName}</strong>.
          </p>
          {activationSuccess.mismatchNote && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-4 text-left">
              {activationSuccess.mismatchNote}
            </p>
          )}
          <div className="mt-6 pt-4 border-t border-[#F3EFE6] text-xs text-[#8C9BAE] font-medium">
            Terminal ID: {activationSuccess.deviceId.slice(0, 8)}
          </div>
          <button
            type="button"
            onClick={() => setActivationStep('form')}
            className="mt-6 w-full py-3 rounded-2xl bg-gradient-to-r from-[#FF8A00] to-[#F97316] hover:brightness-105 text-white font-extrabold text-sm shadow-[0_10px_24px_rgba(249,115,22,0.28)] transition-all active:scale-[0.99] cursor-pointer"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }
```

(Setting `activationStep` back to `'form'` on "Continue" is enough to leave this screen — with
`isDeviceActivated` now `true`, the component falls straight through both the success check and
the `!isDeviceActivated` gate into the real main-app render below.)

- [ ] **Step 2: Auto-advance after a short pause**

Add a new `useEffect` near the other activation-related effects (after the existing
`useEffect(() => { if (!isDeviceActivated) { ... } ... }, [...])` sync-transport effect):

```typescript
  useEffect(() => {
    if (activationStep !== 'success') return;
    const timer = setTimeout(() => setActivationStep('form'), 4000);
    return () => clearTimeout(timer);
  }, [activationStep]);
```

- [ ] **Step 3: Run the typecheck**

Run: `cd apps/kiosk-system/kiosk-user && npx tsc --noEmit`
Expected: no errors. If `CheckCircle2` isn't already imported from `lucide-react` in this file,
add it to the existing import list (several icons are already imported there).

- [ ] **Step 4: Verify by running the app**

Repeat Task 2 Step 6's scenario 4 (a correct, unredeemed restaurant ID + key pair) through to
completion. Confirm: the success screen appears naming the real restaurant and showing a
non-empty Terminal ID, it auto-advances into the main kiosk ordering screen within ~4 seconds
without any click, and clicking "Continue" immediately also works. Then, to exercise the
mismatch note: generate two activation keys for two *different* restaurants, type the first
restaurant's ID but the second restaurant's key — confirm the success screen still completes
(the key's real restaurant, the second one, is what the device is actually connected to) and
shows the mismatch note naming both restaurants correctly.

- [ ] **Step 5: Commit**

```bash
git add apps/kiosk-system/kiosk-user/src/App.tsx
git commit -m "feat(kiosk-user): add a success screen naming the restaurant and terminal after activation"
```

---

### Task 4: Full verification, typecheck, and final review

**Files:** none (verification only).

- [ ] **Step 1: Run the typecheck once more across the whole app**

Run: `cd apps/kiosk-system/kiosk-user && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Run the production build**

Run: `cd apps/kiosk-system/kiosk-user && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 3: Re-run the full live scenario list from Tasks 2 and 3 once, end to end, against the built/dev app**

Covers: malformed restaurant ID (client-side, no network call), unknown restaurant ID, invalid/
already-redeemed key, a clean successful activation with auto-advance, and the cross-restaurant
mismatch note. This is the Review Focus list in full.

- [ ] **Step 4: Self-review the full diff**

Run: `git diff main -- apps/kiosk-system/kiosk-user/src` and read every changed line. Confirm:
every step transition (`verifying`/`registering`/`syncing`) has a corresponding failure path that
returns to `'form'` with a message in `activationError` (no state where a thrown error leaves
`activationStep` stuck on a non-`'form'` value with nothing rendered to recover from), and the
`syncRestaurantIdentity()` failure is genuinely swallowed (never surfaces as a blocking error for
an activation that already succeeded).

- [ ] **Step 5: Commit this plan document**

```bash
git add docs/superpowers/plans/2026-09-25-jamanvaar-phase8-kiosk-activation-flow.md
git commit -m "docs: add Phase 8 (kiosk activation flow polish) plan"
```

- [ ] **Step 6: Push**

```bash
git push origin main
```
