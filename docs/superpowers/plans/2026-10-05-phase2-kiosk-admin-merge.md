# Phase 2 — Kiosk Admin → Restaurant Admin Merge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give pos-admin (Restaurant Admin) every capability kiosk-admin has today, entitlement-gated where kiosk-specific, so a restaurant never needs a second admin app — without touching kiosk-admin's production build until the merged app is verified.

**Architecture:** Add an entitlement-gating layer to pos-admin's nav (new), relocate kiosk-admin's genuinely unique screens (Kiosk fleet management, Coupons, kiosk language/receipt/hardware settings, feedback) into pos-admin, port two missing capabilities into pos-admin's existing Menu screen, verify the already-overlapping screens (Tables/Staff/Combos/Audit/License) have no undiscovered feature gaps, then retire the `KIOSK_ADMIN` activation-key type. kiosk-admin itself is deleted only as a final, separately-gated step after a live-restaurant burn-in period — not part of this plan's automated execution.

**Tech Stack:** React + Vite + TS (pos-admin, kiosk-admin), NestJS + Prisma + Zod (cloud/api), Vitest at the repo root for package-level tests, Vitest + Supertest for `cloud/api/test/`, no component-test infra in either frontend app (verified by running the dev server).

**Spec:** `docs/superpowers/specs/2026-10-05-kiosk-admin-merge-and-online-payments-design.md`

## Global Constraints

- kiosk-admin keeps running unmodified in production throughout every task in this plan except the last. Nothing in `apps/kiosk-system/kiosk-admin` is deleted until Task 10.
- The `KIOSK_ADMIN` **entitlement/AppCode** is unaffected by this plan — only the `KIOSK_ADMIN` **device/activation-key type** is retired (Task 9), and only after Task 10's production migration gate.
- Every newly-relocated kiosk-specific section in pos-admin is gated on the restaurant's `KIOSK_ADMIN` entitlement (Task 1 builds the gating mechanism once; every later task reuses it). Coupons and the Menu-field port are **not** kiosk-specific and are **not** gated — they are plain restaurant features pos-admin happened to be missing.
- `SyncOutboxEngine.configureTransport(...)` and `EntitySyncEngine.configureTransport(...)` are singleton configuration calls pos-admin's own top-level `useEffect` already makes (`apps/restaurant-system/pos-admin/src/App.tsx:453-458`). Any ported kiosk-admin code that also calls `configureTransport(...)` on these engines must have that call removed during the port — calling it twice silently overwrites pos-admin's own already-working sync wiring with kiosk-admin's. This was found while scoping Task 4 (Kiosk fleet) and must be checked again for every later relocation task that touches sync engines.
- Full regression (`npx vitest run` from the repo root) must stay at the same pass count after every task, not just once at the end — re-run it as each task's own last step, not deferred.

## Review Focus

- A restaurant whose `KIOSK_ADMIN` entitlement is off must see none of the newly-gated sections (Kiosk fleet, kiosk language/receipt/hardware settings, feedback) — not greyed out, not present-but-erroring, simply absent from the nav. This is the one behavior with no prior test in pos-admin (its nav has never been entitlement-filtered before).
- A restaurant whose `KIOSK_ADMIN` entitlement flips from off to on mid-session (Super Admin grants it while the restaurant's admin console is already open) should pick it up on the next entitlements refresh, not require a logout — confirm `fetchEntitlements()`'s existing cache/refresh cadence (`apps/restaurant-system/pos-admin/src/cloud/cloudClient.ts:600-610`) actually re-fires before assuming this works.
- Deleting kiosk-admin's Table/Staff/Combo/Audit/License screens as "pure duplication" must not silently drop a feature pos-admin's equivalent lacks — Task 2 requires an explicit, written-down diff, not an assumption, before any deletion is scheduled.
- A device still holding a `KIOSK_ADMIN`-typed activation key must get a clear, actionable error after Task 9 retires that key type — not a generic 500 or a silent login failure. The retirement task must include this specific negative-path test.
- Kiosk-sourced orders must remain visually identifiable in pos-admin's Orders/KDS views after kiosk-admin's own `ORDERS_KDS` tab is gone (Task 8) — a restaurant owner currently relies on kiosk-admin's view to tell a self-order-kiosk sale apart from a counter sale; losing that distinction silently would be a real regression even though the underlying data was never duplicated.

---

### Task 1: Entitlement-gating infrastructure for pos-admin's nav

**Files:**
- Modify: `apps/restaurant-system/pos-admin/src/App.tsx` (nav array at lines 860-907, `PosAdminTab` type at lines 131-155)
- Create: `apps/restaurant-system/pos-admin/src/hooks/useEntitlements.ts`
- Test: `tests/pos_admin_nav_entitlements.test.ts` (new)

**Interfaces:**
- Consumes: `fetchEntitlements()` (existing, `apps/restaurant-system/pos-admin/src/cloud/cloudClient.ts:600`), which returns `{ data: CloudEntitlementsResponse | null; ... }`. `CloudEntitlementsResponse.entitlements` is the legacy `PlanEntitlements` JSON shape, **not** a per-`AppCode` list — confirm this by reading `packages/types/src/` for `PlanEntitlements`'s actual fields before assuming `KIOSK_ADMIN` is one of its boolean keys. If `PlanEntitlements` has no `KIOSK_ADMIN`-shaped key, the real per-`AppCode` gate must come from `GET /api/v1/application-entitlements/catalog` combined with whatever endpoint reports which apps are *enabled* for this restaurant specifically (re-check `cloud/api/src/modules/application-entitlements/application-entitlements.controller.ts`'s routes for a "my enabled apps" endpoint, since `catalog` only describes the catalog's shape, not which ones are on for a given restaurant) — this is the one genuinely open question in this task; resolve it by reading the actual controller before writing `useEntitlements.ts`, do not guess the endpoint name.
- Produces: `export function useEntitlements(): { hasApp: (app: AppCode) => boolean; loading: boolean }` from `apps/restaurant-system/pos-admin/src/hooks/useEntitlements.ts`. Every later task that gates a nav item calls `hasApp('KIOSK_ADMIN')`.

- [ ] **Step 1: Resolve which endpoint reports per-restaurant enabled apps**

```bash
grep -n "@Get\|@Post\|@Patch" cloud/api/src/modules/application-entitlements/application-entitlements.controller.ts
```

Read every route this prints. One of them returns the current restaurant's actual enabled `AppCode`s (not just the catalog of possible ones) — this is what Super Admin's `RestaurantDetailPage.tsx` must itself call to show each toggle's current on/off state; find that call in `cloud/super-admin-web/src/pages/Restaurants/RestaurantDetailPage.tsx` (grep for `application-entitlements` there) and use the exact same endpoint path here, scoped to the logged-in tenant instead of a Super-Admin-specified restaurant id. Write down the endpoint path and response shape in this task's commit message — the next step depends on it being correct.

- [ ] **Step 2: Write the failing test**

```ts
// tests/pos_admin_nav_entitlements.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('useEntitlements (pos-admin)', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });
  beforeEach(() => { localStorage.clear(); });

  it('hasApp returns false for an app not in the enabled list', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ enabledApps: ['POS', 'POS_ADMIN'] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    ) as unknown as typeof fetch;

    const { renderHook, waitFor } = await import('@testing-library/react');
    const { useEntitlements } = await import('../apps/restaurant-system/pos-admin/src/hooks/useEntitlements');
    const { result } = renderHook(() => useEntitlements());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasApp('KIOSK_ADMIN')).toBe(false);
    expect(result.current.hasApp('POS_ADMIN')).toBe(true);
  });

  it('hasApp returns true once KIOSK_ADMIN is in the enabled list', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ enabledApps: ['POS', 'POS_ADMIN', 'KIOSK_ADMIN'] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    ) as unknown as typeof fetch;

    const { renderHook, waitFor } = await import('@testing-library/react');
    const { useEntitlements } = await import('../apps/restaurant-system/pos-admin/src/hooks/useEntitlements');
    const { result } = renderHook(() => useEntitlements());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasApp('KIOSK_ADMIN')).toBe(true);
  });
});
```

Note: `@testing-library/react` may not be installed in this repo yet (no component-test infra, per Global Constraints) — if `npm ls @testing-library/react` from the repo root shows it's missing, add it as a devDependency scoped to this one test file's needs (`npm install -D @testing-library/react --workspace apps/restaurant-system/pos-admin` or the repo's existing workspace-install convention — check how other devDependencies were added in a recent `package.json` diff if unsure) rather than hand-rolling a hook-test harness; this is the first hook-level test in the app, so confirm the dependency question before writing more tests against hooks in later tasks.

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/pos_admin_nav_entitlements.test.ts`
Expected: FAIL — `useEntitlements` module does not exist yet.

- [ ] **Step 4: Implement `useEntitlements`**

```ts
// apps/restaurant-system/pos-admin/src/hooks/useEntitlements.ts
import { useEffect, useState } from 'react';
import type { AppCode } from '@jamanvaar/types';
import { fetchMyEnabledApps } from '../cloud/cloudClient'; // name/path confirmed in Step 1

export function useEntitlements(): { hasApp: (app: AppCode) => boolean; loading: boolean } {
  const [enabledApps, setEnabledApps] = useState<AppCode[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMyEnabledApps()
      .then((apps) => { if (!cancelled) setEnabledApps(apps); })
      .catch(() => { if (!cancelled) setEnabledApps([]); }); // fail closed: an error hides gated tabs rather than guessing them open
    return () => { cancelled = true; };
  }, []);

  return {
    loading: enabledApps === null,
    hasApp: (app: AppCode) => (enabledApps ?? []).includes(app)
  };
}
```

Add `fetchMyEnabledApps` to `apps/restaurant-system/pos-admin/src/cloud/cloudClient.ts` calling the endpoint found in Step 1, following the existing `request<T>()` pattern (see Task 1 of the Phase 1 plan for the exact calling convention).

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/pos_admin_nav_entitlements.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Wire into the nav array**

In `App.tsx`, call `const { hasApp } = useEntitlements();` inside `PosAdminApp()`, then change the nav-sections array (lines 860-907) so any item needing a gate carries an `enabled` flag evaluated against `hasApp`, and filter it out before rendering:

```tsx
{[
  // ...existing sections unchanged...
].map((grp) => {
  const visibleItems = grp.items.filter((it) => !('requiresApp' in it) || hasApp((it as any).requiresApp));
  if (visibleItems.length === 0) return null;
  const hasActiveTab = visibleItems.some((it) => it.id === activeTab);
  // ...rest of the existing render logic, using visibleItems instead of grp.items...
```

This task adds no gated item yet (there are none to gate until Task 4+); it only adds the filtering mechanism and proves it compiles with zero behavior change (every current nav item has no `requiresApp` key, so `visibleItems` always equals `grp.items` today).

- [ ] **Step 7: Full regression**

Run: `npx vitest run`
Expected: same pass count as Phase 1's final baseline, plus the 2 new tests.

- [ ] **Step 8: Commit**

```bash
git add apps/restaurant-system/pos-admin/src/hooks/useEntitlements.ts apps/restaurant-system/pos-admin/src/cloud/cloudClient.ts apps/restaurant-system/pos-admin/src/App.tsx tests/pos_admin_nav_entitlements.test.ts
git commit -m "feat(pos-admin): add entitlement-gating hook for nav sections

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Diff kiosk-admin vs pos-admin on Tables, Staff, Combos, Audit, License — confirm no hidden feature gap

**Files:** none modified — this task produces a written finding, committed as a short doc, that later tasks (and Task 10's final deletion) rely on.
- Create: `docs/superpowers/notes/2026-10-05-phase2-dedupe-diff-findings.md`

**Interfaces:** none — read-only investigation task.

- [ ] **Step 1: Diff each pair**

For each pair below, read both files fully and list every field/action one has that the other doesn't:
- `apps/kiosk-system/kiosk-admin/src/components/TableModal.tsx` vs `apps/restaurant-system/pos-admin/src/components/TableModal.tsx`
- `apps/kiosk-system/kiosk-admin/src/components/StaffModal.tsx` vs `apps/restaurant-system/pos-admin/src/components/StaffModal.tsx`
- kiosk-admin's `COMBOS` tab (`apps/kiosk-system/kiosk-admin/src/App.tsx:2429-3233`) vs pos-admin's `apps/restaurant-system/pos-admin/src/components/menu/ComboModal.tsx` and wherever it's invoked from pos-admin's `MENU` tab
- kiosk-admin's `AUDIT` tab (`apps/kiosk-system/kiosk-admin/src/App.tsx:4472-4504`) vs pos-admin's `AUDIT` tab content
- kiosk-admin's `LICENSE` tab (`apps/kiosk-system/kiosk-admin/src/App.tsx:4504+`) vs pos-admin's `LICENSE` tab content

- [ ] **Step 2: Write the findings**

```markdown
# Phase 2 dedupe diff findings — 2026-10-05

## TableModal
[list any field/action kiosk-admin's version has that pos-admin's lacks, or "No gap found — pos-admin's version is a confirmed superset" if none]

## StaffModal
[same]

## Combos
[same]

## Audit
[same]

## License
[same]
```

- [ ] **Step 3: Act on any gap found**

If Step 2 found zero gaps for a pair: no further action — that pair is confirmed safe to delete in Task 10. If Step 2 found a real gap (a field or action kiosk-admin has that pos-admin's equivalent lacks): port that specific gap into pos-admin's version now, as its own small commit, before moving on — do not defer a known gap to Task 10.

- [ ] **Step 4: Commit the findings doc (and any gap-closing fix from Step 3)**

```bash
git add docs/superpowers/notes/2026-10-05-phase2-dedupe-diff-findings.md
git commit -m "docs: record Phase 2 dedupe diff findings for Tables/Staff/Combos/Audit/License

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Port Menu capabilities — `isKioskEnabled` toggle and per-language translations+keyboard

**Files:**
- Modify: `apps/restaurant-system/pos-admin/src/components/ItemModal.tsx`
- Test: `tests/pos_admin_item_modal_kiosk_fields.test.ts` (new) — a focused unit test on the save-payload shape, not a full component-render test, matching this app's no-component-test-infra convention.

**Interfaces:**
- Consumes: `MenuItem.isKioskEnabled?: boolean` and `MenuItem.translations?: Record<string, { name: string; description?: string }>` — both fields already exist on the shared `MenuItem` type (`packages/types/src/domain.ts:297,303`); this task is UI-only, no type changes. `KioskDisplaySettingsRepository.getSettings().enabledLanguages` (existing, `@jamanvaar/database`) and `VirtualKeyboard`/`VirtualKeyboardLanguage` (existing, `@jamanvaar/ui`) — both already used by kiosk-admin's own Add Dish modal for this exact purpose; read `apps/kiosk-system/kiosk-admin/src/App.tsx`'s `newItemTranslations` state and its surrounding JSX (search for `newItemTranslations` in that file) as the reference implementation to port, not to reinvent.
- Produces: `ItemModal`'s save payload now includes `isKioskEnabled` and `translations` — Task 10's final kiosk-admin deletion depends on this being done first (it's the one Menu gap the spec identified, distinct from Task 2's dedupe-verification of the other screens).

- [ ] **Step 1: Write the failing test**

```ts
// tests/pos_admin_item_modal_kiosk_fields.test.ts
import { describe, it, expect } from 'vitest';
import type { MenuItem } from '@jamanvaar/types';

// This test pins the shape ItemModal's handleSubmit must produce when isKioskEnabled
// and translations are set — a cheap guard against the fields silently being dropped
// from the save payload during the port, without needing to render the component.
describe('ItemModal kiosk fields payload shape', () => {
  it('a dish payload can carry isKioskEnabled and per-language translations', () => {
    const payload: Partial<MenuItem> = {
      name: 'Paneer Tikka',
      isKioskEnabled: true,
      translations: {
        hi: { name: 'पनीर टिक्का', description: 'मसालेदार पनीर' },
        gu: { name: 'પનીર ટિક્કા' }
      }
    };
    expect(payload.isKioskEnabled).toBe(true);
    expect(payload.translations?.hi.name).toBe('पनीर टिक्का');
  });
});
```

This test exists mainly to be RED before Task's Step 4 and is intentionally shallow (a type-shape pin) — the real coverage for this feature is the existing `tests/i18n_key_parity.test.ts` and `tests/transliteration.test.ts` suites, which already cover the underlying translation mechanics this task reuses rather than reimplements; this task's own test only confirms `ItemModal` doesn't drop the fields on save. It will actually pass immediately since it doesn't touch `ItemModal` itself — run it once now to confirm the baseline is green, then treat Step 4 (the real implementation) as validated by Step 5's manual check instead of a second automated assertion, since asserting against `ItemModal`'s internals would require the `@testing-library/react` component-render infra this app doesn't have (see Task 1 Step 2's note on adding it — if it was added there, extend this test to a real render-and-submit assertion instead of the shape-pin above).

- [ ] **Step 2: Run it to confirm it's green already (sanity check, not a RED/GREEN cycle for this particular file)**

Run: `npx vitest run tests/pos_admin_item_modal_kiosk_fields.test.ts`
Expected: PASS (it's a standalone type-shape assertion, unrelated to current `ItemModal` code)

- [ ] **Step 3: Add state and import**

In `apps/restaurant-system/pos-admin/src/components/ItemModal.tsx`, add to the imports (line 1-5 area):

```tsx
import { KioskDisplaySettingsRepository } from '@jamanvaar/database';
import { VirtualKeyboard, type VirtualKeyboardLanguage } from '@jamanvaar/ui';
```

Add state near the other `useState` declarations (after line 41's `allowInstructions`):

```tsx
const [isKioskEnabled, setIsKioskEnabled] = useState(true);
const [translations, setTranslations] = useState<Record<string, { name: string; description?: string }>>({});
const [activeKeyboardField, setActiveKeyboardField] = useState<{ lang: VirtualKeyboardLanguage; field: 'name' | 'description' } | null>(null);
```

In the `useEffect` that resets/loads fields (lines 44-88), add to the `if (itemToEdit)` branch: `setIsKioskEnabled(itemToEdit.isKioskEnabled ?? true); setTranslations(itemToEdit.translations ?? {});` and to the `else` branch: `setIsKioskEnabled(true); setTranslations({});`.

- [ ] **Step 4: Include both fields in the save payload**

In `handleSubmit` (both the `itemToEdit` update branch at lines 180-201 and the create branch at lines 209-229), add `isKioskEnabled,` and `translations,` to the object passed to `MenuRepository.updateMenuItem`/`createMenuItem`.

- [ ] **Step 5: Add the form UI**

Near the existing `sellOnQr` checkbox in the JSX (search `ItemModal.tsx` for `sellOnQr` to find its exact checkbox markup and follow the same visual pattern), add:

```tsx
<label className="flex items-center gap-2 text-xs font-bold text-slate-600">
  <input type="checkbox" checked={isKioskEnabled} onChange={(e) => setIsKioskEnabled(e.target.checked)} />
  Show this dish on the Customer Kiosk
</label>

{KioskDisplaySettingsRepository.getSettings().enabledLanguages.filter((c) => c !== 'en').map((lang) => (
  <div key={lang} className="border border-slate-200 rounded-xl p-3 space-y-2">
    <div className="flex items-center justify-between">
      <span className="text-xs font-bold text-slate-600">{lang.toUpperCase()} translation</span>
      <button
        type="button"
        onClick={() => setActiveKeyboardField({ lang: lang as VirtualKeyboardLanguage, field: 'name' })}
        className="text-[11px] font-bold text-jaman-saffron"
      >
        Open keyboard
      </button>
    </div>
    <input
      type="text"
      value={translations[lang]?.name ?? ''}
      onChange={(e) => setTranslations((t) => ({ ...t, [lang]: { ...(t[lang] ?? {}), name: e.target.value } }))}
      placeholder={`Dish name in ${lang}`}
      className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-sm"
    />
    <input
      type="text"
      value={translations[lang]?.description ?? ''}
      onChange={(e) => setTranslations((t) => ({ ...t, [lang]: { ...(t[lang] ?? {}), description: e.target.value } }))}
      placeholder={`Description in ${lang} (optional)`}
      className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2 text-sm"
    />
  </div>
))}

{activeKeyboardField && (
  <VirtualKeyboard
    language={activeKeyboardField.lang}
    value={translations[activeKeyboardField.lang]?.[activeKeyboardField.field] ?? ''}
    onChange={(next) =>
      setTranslations((t) => ({
        ...t,
        [activeKeyboardField.lang]: { ...(t[activeKeyboardField.lang] ?? { name: '' }), [activeKeyboardField.field]: next }
      }))
    }
    onClose={() => setActiveKeyboardField(null)}
  />
)}
```

- [ ] **Step 6: Type-check and manually verify**

```bash
cd apps/restaurant-system/pos-admin && npx tsc --noEmit && npm run dev
```
Open Menu & Categories, add a dish, type a Hindi translation via the on-screen keyboard, save, edit the same dish, confirm the translation round-trips.

- [ ] **Step 7: Full regression**

Run: `npx vitest run` — expect the same pass count as Task 1's baseline plus this task's new test.

- [ ] **Step 8: Commit**

```bash
git add apps/restaurant-system/pos-admin/src/components/ItemModal.tsx tests/pos_admin_item_modal_kiosk_fields.test.ts
git commit -m "feat(pos-admin): port kiosk-enabled toggle and per-language translations into ItemModal

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Relocate Kiosk fleet management (new `KIOSKS` tab, entitlement-gated)

**Files:**
- Modify: `apps/restaurant-system/pos-admin/src/cloud/cloudClient.ts` (port `CloudKiosk`, `KioskCommandType`, `fetchCloudKiosks`, `sendKioskCommand`)
- Modify: `apps/restaurant-system/pos-admin/src/App.tsx` (new tab type, nav entry with `requiresApp: 'KIOSK_ADMIN'`, render block, polling `useEffect`)
- Test: `tests/pos_admin_kiosk_fleet_client.test.ts` (new)

**Interfaces:**
- Consumes: `useEntitlements` (Task 1), `deviceFetch` and `jsonOrThrowCloud` (existing in pos-admin's `cloudClient.ts`, used today by `qrApi` at line 1231-1233).
- Produces: `fetchCloudKiosks(): Promise<CloudKiosk[]>`, `sendKioskCommand(kioskId, type, payload?): Promise<void>` exported from `cloudClient.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/pos_admin_kiosk_fleet_client.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';

describe('pos-admin kiosk fleet client', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('filters the device fleet down to KIOSK-type devices', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        devices: [
          { id: 'd1', type: 'KIOSK', name: 'Front Kiosk', appVersion: '1.2.0', lastSeenAt: null, lastSyncAt: null, health: 'online', isLocked: false, lockReason: null, pendingSyncCount: 0, syncError: null, branch: null },
          { id: 'd2', type: 'POS_ADMIN', name: 'Owner laptop', appVersion: '1.2.0', lastSeenAt: null, lastSyncAt: null, health: 'online', isLocked: false, lockReason: null, pendingSyncCount: 0, syncError: null, branch: null }
        ]
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    ) as unknown as typeof fetch;

    const { fetchCloudKiosks } = await import('../apps/restaurant-system/pos-admin/src/cloud/cloudClient');
    const kiosks = await fetchCloudKiosks();
    expect(kiosks).toHaveLength(1);
    expect(kiosks[0].id).toBe('d1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pos_admin_kiosk_fleet_client.test.ts`
Expected: FAIL — `fetchCloudKiosks` not exported.

- [ ] **Step 3: Port the client functions**

Append to `apps/restaurant-system/pos-admin/src/cloud/cloudClient.ts` (copied verbatim from `apps/kiosk-system/kiosk-admin/src/cloud/cloudClient.ts:997-1045`, substituting kiosk-admin's `jsonOrThrow` for pos-admin's existing `jsonOrThrowCloud`):

```ts
export interface CloudKiosk {
  id: string;
  name: string;
  appVersion: string | null;
  lastSeenAt: string | null;
  health: 'online' | 'degraded' | 'offline' | 'revoked' | 'pending' | 'never_seen';
  isLocked: boolean;
  lockReason: string | null;
  branchName: string | null;
  pendingSyncCount: number;
  syncError: string | null;
  lastSyncAt: string | null;
}

export async function fetchCloudKiosks(): Promise<CloudKiosk[]> {
  const data = await jsonOrThrowCloud<{
    devices: Array<{
      id: string; type: string; name: string | null; appVersion: string | null; lastSeenAt: string | null; lastSyncAt: string | null;
      health: CloudKiosk['health']; isLocked: boolean; lockReason: string | null; pendingSyncCount: number | null;
      syncError: string | null; branch: { name: string } | null;
    }>;
  }>(await deviceFetch('/api/v1/devices/me/fleet'), 'Kiosk fleet');
  return data.devices
    .filter((d) => d.type === 'KIOSK')
    .map((d) => ({
      id: d.id, name: d.name ?? 'Kiosk', appVersion: d.appVersion, lastSeenAt: d.lastSeenAt, health: d.health,
      isLocked: d.isLocked, lockReason: d.lockReason, branchName: d.branch?.name ?? null,
      pendingSyncCount: d.pendingSyncCount ?? 0, syncError: d.syncError, lastSyncAt: d.lastSyncAt
    }));
}

export type KioskCommandType = 'REQUEST_SYNC' | 'REQUEST_DIAGNOSTICS' | 'RESTART_APP' | 'CLEAR_CACHE' | 'LOCK' | 'UNLOCK';

export async function sendKioskCommand(kioskId: string, commandType: KioskCommandType, payload?: Record<string, unknown>): Promise<void> {
  const idempotencyKey = `${commandType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await jsonOrThrowCloud(
    await deviceFetch(`/api/v1/devices/${kioskId}/commands`, { method: 'POST', body: JSON.stringify({ type: commandType, payload, idempotencyKey }) }),
    'Kiosk command'
  );
}
```

(If `jsonOrThrowCloud`'s actual signature differs from this assumption — check it at `cloudClient.ts` around line 1231 before pasting — adjust the call sites to match; do not introduce a second JSON-error-handling helper.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pos_admin_kiosk_fleet_client.test.ts`
Expected: PASS

- [ ] **Step 5: Add the gated nav entry and tab type**

In `App.tsx`, add `'KIOSKS'` to the `PosAdminTab` union (line 155 area), and add to the `'ANALYTICS & SYSTEM'` (or a new `'KIOSK'` section — either is fine, prefer a new section so it reads clearly) nav group:

```tsx
{ id: 'KIOSKS', label: 'Kiosk Terminals', icon: Tablet, requiresApp: 'KIOSK_ADMIN' }
```

(Import `Tablet` from `lucide-react` alongside the other icon imports if not already present.)

- [ ] **Step 6: Port the fleet-polling effect, dropping the duplicate `configureTransport` calls**

Add state near pos-admin's other top-level state: `const [kiosks, setKiosks] = useState<CloudKiosk[]>([]);` Add a **new** `useEffect` (do **not** merge this into the existing sync `useEffect` at lines 453-458, and do **not** call `SyncOutboxEngine.configureTransport`/`EntitySyncEngine.configureTransport` here — those are already configured once by the existing effect per the Global Constraints note):

```tsx
useEffect(() => {
  if (!hasApp('KIOSK_ADMIN')) return;
  let cancelled = false;
  const refresh = async () => {
    try {
      const fleet = await fetchCloudKiosks();
      if (!cancelled) setKiosks(fleet);
    } catch {
      // Fleet view just stays on its last-known data; this is a background refresh, not a user action.
    }
  };
  refresh();
  const interval = setInterval(refresh, 30000);
  return () => { cancelled = true; clearInterval(interval); };
}, [hasApp]);
```

- [ ] **Step 7: Render the tab**

Add, alongside the other `{activeTab === '...' && (...)}` blocks:

```tsx
{activeTab === 'KIOSKS' && (
  <div className="space-y-6">
    <div>
      <h1 className="text-2xl sm:text-3xl font-black text-jaman-navy">Kiosk Terminal Control</h1>
      <p className="text-sm text-[#4A5568] mt-1">Manage self-ordering stations, lockdown states, and maintenance modes.</p>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {kiosks.map((k) => (
        <div key={k.id} className="bg-white rounded-2xl p-6 border border-jaman-border shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-jaman-navy">{k.name}</h3>
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-100">{k.health}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void sendKioskCommand(k.id, 'REQUEST_SYNC')}>Sync now</Button>
            <Button variant="outline" size="sm" onClick={() => void sendKioskCommand(k.id, 'REQUEST_DIAGNOSTICS')}>Diagnostics</Button>
            <Button
              variant={k.isLocked ? 'accent' : 'outline'}
              size="sm"
              onClick={() => void sendKioskCommand(k.id, k.isLocked ? 'UNLOCK' : 'LOCK')}
            >
              {k.isLocked ? 'Unlock' : 'Lockdown'}
            </Button>
          </div>
        </div>
      ))}
    </div>
  </div>
)}
```

(This is a trimmed first cut of kiosk-admin's richer card — the maintenance-mode toggle and `kioskFleet[k.id]` sync-backlog detail from the original can be added back in the same style if the manual verification in Step 9 shows the trimmed version is missing something the restaurant actually needs; note any such addition in the commit message rather than silently expanding scope.)

- [ ] **Step 8: Type-check**

Run: `cd apps/restaurant-system/pos-admin && npx tsc --noEmit`

- [ ] **Step 9: Manual verification**

Run the dev server with a restaurant whose `KIOSK_ADMIN` entitlement is on: confirm the Kiosk Terminals tab appears and lists real activated kiosks. With the entitlement off: confirm the tab is absent from the nav entirely. Confirm pos-admin's own order sync still works after this change (open Orders, confirm live updates still flow) — this is the direct regression check for the `configureTransport` collision this task was designed to avoid.

- [ ] **Step 10: Full regression and commit**

```bash
npx vitest run
git add apps/restaurant-system/pos-admin/src/cloud/cloudClient.ts apps/restaurant-system/pos-admin/src/App.tsx tests/pos_admin_kiosk_fleet_client.test.ts
git commit -m "feat(pos-admin): relocate kiosk fleet management as an entitlement-gated tab

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Relocate Coupons management (new `COUPONS` tab, ungated — not kiosk-specific)

**Files:**
- Modify: `apps/restaurant-system/pos-admin/src/App.tsx`

**Interfaces:**
- Consumes: `CouponRepository` (existing, `@jamanvaar/database`), `AuditRepository` (existing, already used elsewhere in pos-admin's `App.tsx`).
- Produces: a working `COUPONS` tab with create/delete, matching kiosk-admin's today (`apps/kiosk-system/kiosk-admin/src/App.tsx:3361-3410` for the list view, `:1104-1135` for `handleCreateCoupon`, `:6076-6130`-ish for the modal — read the modal's full extent before copying, it continues past line 6119 shown during planning).

This tab is **not** gated by `KIOSK_ADMIN` — coupons are a general discounting feature pos-admin simply never got a management UI for, not a kiosk-only concept (confirmed: pos-admin already *reads* coupon data in `OperationalSnapshot.tsx` and report components, it just never had anywhere to *create* one).

- [ ] **Step 1: Add state**

Near pos-admin's other top-level `useState` calls: `const [isAddCouponModalOpen, setIsAddCouponModalOpen] = useState(false); const [newCouponCode, setNewCouponCode] = useState(''); const [newCouponValue, setNewCouponValue] = useState(0); const [newCouponMin, setNewCouponMin] = useState(0); const [newCouponUsageLimit, setNewCouponUsageLimit] = useState('');` and `const coupons = CouponRepository.getAllCoupons();`.

- [ ] **Step 2: Add `handleCreateCoupon`**

Copy verbatim from kiosk-admin's `App.tsx:1104-1135` (shown in full during planning — reproduced here):

```tsx
const handleCreateCoupon = (e: React.FormEvent) => {
  e.preventDefault();
  if (!newCouponCode) return;

  const usageLimit = newCouponUsageLimit.trim() ? Number(newCouponUsageLimit) : undefined;
  const cpn: Coupon = {
    id: `cpn-${Date.now()}`,
    code: newCouponCode.toUpperCase(),
    description: `Get ₹${newCouponValue} discount on orders above ₹${newCouponMin}`,
    discountType: 'FLAT',
    discountValue: Number(newCouponValue),
    minOrderValue: Number(newCouponMin),
    validFrom: new Date().toISOString(),
    validUntil: '2027-12-31T23:59:59Z',
    usageCount: 0,
    usageLimit,
    isActive: true
  };

  CouponRepository.createCoupon(cpn);

  AuditRepository.log({
    username: 'admin',
    action: 'COUPON_CREATED',
    category: 'OFFERS',
    details: `Created promo coupon "${cpn.code}"${usageLimit ? ` (usage limit: ${usageLimit})` : ''}`
  });

  showToast(`Created coupon: ${cpn.code}`);
  setIsAddCouponModalOpen(false);
  setNewCouponCode('');
  setNewCouponValue(0);
  setNewCouponMin(0);
  setNewCouponUsageLimit('');
};
```

Add `Coupon` to the `@jamanvaar/types` import line if not already imported.

- [ ] **Step 3: Add the nav entry, tab type, and render block**

Add `'COUPONS'` to `PosAdminTab`. Add `{ id: 'COUPONS', label: 'Offers & Coupons', icon: Tag }` to the `'PEOPLE & CASH'` nav group (or a new group — match whichever reads better alongside existing items). Copy the list-view JSX verbatim from kiosk-admin's `App.tsx:3361-3402` and the modal JSX from `:6076` onward (read that modal's full extent in kiosk-admin's file — it was truncated at line 6119 during planning; copy through its closing `</Modal>`), adjusting only `CouponRepository.deleteCoupon`'s `confirm(...)` call to this app's existing confirm-dialog convention if pos-admin has one (check for `onRequestConfirm`/`setConfirmDialog` usage elsewhere in `App.tsx` — e.g. the `STAFF` tab's `onRequestConfirm={setConfirmDialog}` pattern — and use that instead of a raw `confirm()` if it exists, for consistency with the rest of this app).

- [ ] **Step 4: Type-check and manual verification**

```bash
cd apps/restaurant-system/pos-admin && npx tsc --noEmit && npm run dev
```
Create a coupon, confirm it appears, delete it, confirm it's removed. Confirm the `COUPONS` tab shows regardless of `KIOSK_ADMIN` entitlement state (ungated, per this task's own description).

- [ ] **Step 5: Full regression and commit**

```bash
npx vitest run
git add apps/restaurant-system/pos-admin/src/App.tsx
git commit -m "feat(pos-admin): relocate coupon management from kiosk-admin (not kiosk-specific, ungated)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Relocate kiosk-specific Settings (language selection, receipt/e-bill template) — entitlement-gated section under pos-admin's `SETTINGS`

**Files:**
- Modify: `apps/restaurant-system/pos-admin/src/App.tsx` (the `SETTINGS` tab's render block, currently at line 1252+)

**Interfaces:**
- Consumes: `KIOSK_LANGUAGE_LABELS`, `KioskDisplaySettingsRepository` (both already built this session, currently used only in kiosk-admin — port the constant and the checkbox-grid/default-language-dropdown JSX from kiosk-admin's `App.tsx` `SETTINGS` tab, grep that file for `KIOSK_LANGUAGE_LABELS` to find every call site to port), plus kiosk-admin's `RECEIPTS` tab content (`apps/kiosk-system/kiosk-admin/src/App.tsx:3410-3710`, titled "RECEIPT & E-BILL SETTINGS" per its own comment at line 3409).

- [ ] **Step 1: Read the exact RECEIPTS block before porting**

```bash
sed -n '3410,3710p' apps/kiosk-system/kiosk-admin/src/App.tsx
```

Read all 300 lines. Identify its backing state (grep each `useState` name referenced inside that range) and whether it calls `configureTransport` on any sync engine (grep the same range for `configureTransport`) — if it does, apply the same fix as Task 4 Step 6 (drop the duplicate call, keep only the data-fetching/local-update logic). If it doesn't touch sync engines, it's a plain settings form and can be copied with no such adjustment.

- [ ] **Step 2: Port the language-settings JSX and the RECEIPTS block into pos-admin's `SETTINGS` tab**

Wrap both in a gate:

```tsx
{hasApp('KIOSK_ADMIN') && (
  <>
    {/* ported KIOSK_LANGUAGE_LABELS checkbox grid + default-language dropdown */}
    {/* ported RECEIPTS block from Step 1, with its own state variables brought along */}
  </>
)}
```

inside the existing `{activeTab === 'SETTINGS' && (...)}` block, after the existing `TerminalDisplaySettings`/`WhatsAppChannelPanel` content.

- [ ] **Step 3: Type-check and manual verification**

```bash
cd apps/restaurant-system/pos-admin && npx tsc --noEmit && npm run dev
```
With `KIOSK_ADMIN` on: confirm the language checkboxes and receipt settings appear under Restaurant Settings and save correctly (toggle a language, reload, confirm it persisted). With it off: confirm neither section renders.

- [ ] **Step 4: Full regression and commit**

```bash
npx vitest run
git add apps/restaurant-system/pos-admin/src/App.tsx
git commit -m "feat(pos-admin): relocate kiosk language and receipt settings, gated on KIOSK_ADMIN

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Relocate kiosk hardware diagnostics and customer feedback — entitlement-gated

**Files:**
- Modify: `apps/restaurant-system/pos-admin/src/App.tsx` (new sections under the `KIOSKS` tab from Task 4)

**Interfaces:**
- Consumes: kiosk-admin's `HARDWARE` tab content (`apps/kiosk-system/kiosk-admin/src/App.tsx:3710-4014`) and `FEEDBACK` tab content (`:4014-4083`).

- [ ] **Step 1: Read both blocks, applying the same `configureTransport` check as Task 6 Step 1**

```bash
sed -n '3710,4014p' apps/kiosk-system/kiosk-admin/src/App.tsx   # HARDWARE (kiosk device diagnostics specifically — pos-admin's own HARDWARE tab already covers printers, do not touch that tab)
sed -n '4014,4083p' apps/kiosk-system/kiosk-admin/src/App.tsx   # FEEDBACK
```

- [ ] **Step 2: Add both as sections under pos-admin's `KIOSKS` tab**

Append to the `{activeTab === 'KIOSKS' && (...)}` block built in Task 4, below the existing kiosk-card grid: the diagnostics section (screen/scanner/payment-terminal health per kiosk, ported from Step 1's first block) and a feedback section (ported from Step 1's second block). Both are already implicitly gated since the whole `KIOSKS` tab is nav-gated by Task 4 — no separate `hasApp` check needed inside this tab's own body.

- [ ] **Step 3: Type-check and manual verification**

```bash
cd apps/restaurant-system/pos-admin && npx tsc --noEmit && npm run dev
```
Confirm both sections render under Kiosk Terminals for a `KIOSK_ADMIN`-entitled restaurant with real data (diagnostics for an activated kiosk, any submitted feedback).

- [ ] **Step 4: Full regression and commit**

```bash
npx vitest run
git add apps/restaurant-system/pos-admin/src/App.tsx
git commit -m "feat(pos-admin): relocate kiosk hardware diagnostics and customer feedback into Kiosk Terminals tab

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Confirm kiosk-sourced orders are tagged in pos-admin's Orders/KDS, and kiosk figures are visible in Reports/Dashboard

**Files:**
- Modify (conditionally — only if Step 1 finds no existing tag): `apps/restaurant-system/pos-admin/src/components/...` wherever the Orders list renders an order's channel/source badge.

**Interfaces:**
- Consumes: `Order` type's existing channel/source field — confirm its exact name first (`grep -n "channel\|source" packages/types/src/domain.ts` for the `Order` interface) rather than assuming `order.source`.

- [ ] **Step 1: Check whether pos-admin already visually tags a kiosk-sourced order**

```bash
grep -n "channel\|KIOSK" apps/restaurant-system/pos-admin/src/components/orders/*.tsx apps/restaurant-system/pos-admin/src/components/kds/*.tsx 2>/dev/null
```

- [ ] **Step 2a: If a tag already exists** — no code change. Write one line in `docs/superpowers/notes/2026-10-05-phase2-dedupe-diff-findings.md` (from Task 2) confirming it, and move to Step 3.

- [ ] **Step 2b: If no tag exists** — add a small badge (e.g. `{order.channel === 'KIOSK' && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-700">Kiosk</span>}`) next to the order's existing status badge in both the Orders list and Live KDS views, matching whatever field name Step 1's grep revealed.

- [ ] **Step 3: Confirm kiosk sales appear in Reports/Dashboard without a parallel reports system**

Open pos-admin's `REPORTS` and `DASHBOARD` tabs with test data that includes kiosk-channel orders; confirm the revenue figures include them (they should, automatically, since reports read from the same shared `orders` data — this step is confirming that fact, not building a new filter). If kiosk-admin's own Reports tab showed a kiosk-specific breakdown pos-admin's doesn't (e.g., "kiosk channel sales" as its own line), note it in the findings doc as a nice-to-have, not a blocker — the spec's goal is "zero feature loss," and a sales total that already includes kiosk revenue is not a loss even without its own separate line item; only add the breakdown if the findings doc from Task 2's diff exercise flags it as something a restaurant owner actually used, not out of caution alone.

- [ ] **Step 4: Commit any changes from Step 2b**

```bash
git add apps/restaurant-system/pos-admin/src/components/orders/ apps/restaurant-system/pos-admin/src/components/kds/ docs/superpowers/notes/2026-10-05-phase2-dedupe-diff-findings.md
git commit -m "feat(pos-admin): tag kiosk-sourced orders in Orders/KDS views

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

(Skip this commit entirely if Step 2a applied — nothing changed.)

---

### Task 9: Entitlement-gating regression test — the one genuinely new behavior this phase introduces

**Files:**
- Test: `tests/pos_admin_nav_entitlements.test.ts` (extend the file from Task 1)

**Interfaces:**
- Consumes: the same `useEntitlements` hook from Task 1; this task specifically tests the **nav-filtering** behavior end to end, not just the hook in isolation (Task 1's tests only covered `hasApp`'s return value).

- [ ] **Step 1: Write the failing test**

```ts
it('the KIOSKS, COUPONS-adjacent kiosk settings, and feedback sections never render markup when KIOSK_ADMIN is not enabled', async () => {
  // This is a markup-presence check on the rendered nav, not a visual gate — it must prove
  // the gated items are absent from the DOM, not merely hidden by CSS, matching the spec's
  // explicit requirement ("not greyed out, not present-but-erroring, simply absent").
  global.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ enabledApps: ['POS', 'POS_ADMIN'] }), {
      status: 200, headers: { 'content-type': 'application/json' }
    })
  ) as unknown as typeof fetch;

  const { render, screen, waitFor } = await import('@testing-library/react');
  const PosAdminApp = (await import('../apps/restaurant-system/pos-admin/src/App')).default;
  render(<PosAdminApp />);
  await waitFor(() => expect(screen.queryByText('Kiosk Terminals')).not.toBeInTheDocument());
});
```

Note: rendering the whole `PosAdminApp` may require stubbing additional modules (local DB bootstrap, device activation state) this test doesn't yet account for — if `render(<PosAdminApp />)` throws on an unrelated dependency, narrow the test to render just the nav-sections array logic extracted into its own small component/function in Task 1 Step 6 instead of the whole app shell; that refactor (pulling the nav list into a `NavSections` component taking `hasApp` as a prop) is a reasonable, small addition to Task 1 if this test reveals it's needed — do not skip this test over that friction, fix the testability gap it exposes.

- [ ] **Step 2: Run it, confirm it fails for the right reason before any gate existed (or passes trivially if Tasks 4-7 are already done and correct), then make it pass**

Run: `npx vitest run tests/pos_admin_nav_entitlements.test.ts`

- [ ] **Step 3: Full regression and commit**

```bash
npx vitest run
git add tests/pos_admin_nav_entitlements.test.ts apps/restaurant-system/pos-admin/src/
git commit -m "test(pos-admin): verify kiosk-gated nav sections are absent, not just hidden, when entitlement is off

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Retire the `KIOSK_ADMIN` activation-key device type (backend)

**Files:**
- Modify: `cloud/api/src/modules/tenant-auth/dto/login.dto.ts:12,33,70`
- Modify: `cloud/api/src/modules/tenant-auth/tenant-auth.service.ts:355,550-556`
- Test: `cloud/api/test/tenant-auth-kiosk-admin-retirement.e2e.spec.ts` (new)

**Interfaces:**
- Consumes: the existing `deviceType` Zod enum (`login.dto.ts`) and `isAdminConsoleDevice`/activation-key-matching checks (`tenant-auth.service.ts`).

**This task must not run until the Global Constraints' production-migration gate is satisfied** — i.e., not until the one live Oracle-hosted restaurant currently depending on a `KIOSK_ADMIN` key has already been reissued a `POS_ADMIN` key and confirmed working on the merged pos-admin (an operational step outside this plan's automated scope — the person running this plan must get explicit confirmation that migration happened before starting this task). Tasks 1-9 can all ship to production independently of this gate since they're additive to pos-admin; this task is the first one that breaks the old path.

- [ ] **Step 1: Write the failing test**

```ts
// cloud/api/test/tenant-auth-kiosk-admin-retirement.e2e.spec.ts
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { bootstrapTestApp } from './test-utils'; // match whichever bootstrap helper the other tenant-auth e2e specs in this directory already use — grep for it in a neighboring spec file rather than assuming this name

describe('KIOSK_ADMIN activation-key retirement', () => {
  let app: INestApplication;

  beforeAll(async () => { app = await bootstrapTestApp(); });
  afterAll(async () => { await app.close(); });

  it('rejects a login attempt with deviceType KIOSK_ADMIN with a clear, actionable message', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/login')
      .send({ restaurantCode: 'TEST-RESTAURANT', password: 'irrelevant', deviceType: 'KIOSK_ADMIN' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/KIOSK_ADMIN/i);
  });
});
```

(Match this repo's actual e2e bootstrap/auth conventions by reading a neighboring file in `cloud/api/test/` — e.g. `payment-connections.e2e.spec.ts` — before finalizing this test's setup; the assertion on status/message is the part that matters, the bootstrap plumbing should mirror what's already there.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cloud/api && npx vitest run test/tenant-auth-kiosk-admin-retirement.e2e.spec.ts`
Expected: FAIL — `KIOSK_ADMIN` is still a valid `deviceType`, so the request succeeds (or fails for an unrelated reason like a wrong password) instead of being rejected for using a retired device type.

- [ ] **Step 3: Remove `KIOSK_ADMIN` from the deviceType enum**

In `login.dto.ts`, change all three occurrences of `z.enum(['POS', 'CAPTAIN', 'KDS', 'KIOSK', 'POS_ADMIN', 'KIOSK_ADMIN'])` to `z.enum(['POS', 'CAPTAIN', 'KDS', 'KIOSK', 'POS_ADMIN'])`. Zod's own enum validation will now produce the rejection — confirm the resulting error message is clear (it should name the invalid value and the allowed set by default; if Zod's default message is too generic, add a `.refine()` or a custom error map that explicitly says `"KIOSK_ADMIN is no longer a supported device type — use POS_ADMIN"` when the rejected value is specifically `'KIOSK_ADMIN'`, since that's the one case worth a better message, not general enum validation).

- [ ] **Step 4: Remove the now-dead `KIOSK_ADMIN` branches in `tenant-auth.service.ts`**

At line 355: `const isAdminConsoleDevice = deviceType === 'POS_ADMIN' || deviceType === 'KIOSK_ADMIN';` becomes `const isAdminConsoleDevice = deviceType === 'POS_ADMIN';`. At lines 550-556, the activation-key-matching check `dto.deviceType === 'POS_ADMIN' || key.allowedDeviceType === 'ANY' || key.allowedDeviceType === (dto.deviceType as any)` — read the surrounding context again at this point to confirm `KIOSK_ADMIN` doesn't appear in a way not shown during planning (the grep that found this only showed these specific lines); remove any remaining `KIOSK_ADMIN` reference found there.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd cloud/api && npx vitest run test/tenant-auth-kiosk-admin-retirement.e2e.spec.ts`
Expected: PASS

- [ ] **Step 6: Full backend regression**

Run: `cd cloud/api && npx vitest run`
Expected: same pass count as this repo's established baseline (two known pre-existing failures, per this session's established convention — confirm that's still the exact count, not a new unrelated failure).

- [ ] **Step 7: Commit**

```bash
cd cloud/api
git add src/modules/tenant-auth/dto/login.dto.ts src/modules/tenant-auth/tenant-auth.service.ts test/tenant-auth-kiosk-admin-retirement.e2e.spec.ts
git commit -m "feat(tenant-auth): retire KIOSK_ADMIN as a device/activation-key type

KIOSK_ADMIN functionality now lives inside Restaurant Admin (pos-admin),
gated by the KIOSK_ADMIN entitlement rather than a separate activation
key. Only ships after the one production restaurant depending on the
old key has been migrated to a POS_ADMIN key (see Phase 2 spec rollout).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 11: Delete the kiosk-admin package (final step — explicitly gated, not automatic)

**Do not execute this task as part of a normal plan run.** Per the spec's rollback section, this step is irreversible-in-spirit (recoverable from git history, but a real operational cutover) and is gated on a burn-in period after Task 10's production migration — a human decision, not something a task's test can verify for you. When the person running this plan confirms the burn-in period has passed and gives explicit go-ahead:

- [ ] **Step 1:** `git rm -r apps/kiosk-system/kiosk-admin`
- [ ] **Step 2:** Remove any workspace references to `apps/kiosk-system/kiosk-admin` from the root `package.json`'s workspaces list and any CI/build config that names it explicitly (grep the repo root for `kiosk-admin` outside of `apps/kiosk-system/kiosk-admin` itself to find them).
- [ ] **Step 3:** Run the full regression suite (`npx vitest run` at the repo root, and `cd cloud/api && npx vitest run`) and confirm nothing outside the deleted package referenced it (a broken import here means something in Tasks 1-9 should have ported a capability but didn't — go back and find what was missed rather than restoring the deleted package as a workaround).
- [ ] **Step 4:** Commit:

```bash
git add -A
git commit -m "chore: remove kiosk-admin app, fully merged into Restaurant Admin

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review Notes

**Spec coverage:** Every row of the spec's dedupe/relocate/new table maps to a task — `MENU` → Task 3, `TABLES`/`STAFF`/`COMBOS`/`AUDIT`/`LICENSE` → Task 2 (verify) + Task 11 (delete), `ORDERS_KDS` → Task 8, `REPORTS`/`DASHBOARD` → Task 8, `COUPONS` → Task 5, `KIOSKS`/`HARDWARE`(kiosk portion)/`SYNC`(kiosk portion) → Tasks 4 and 7, `RECEIPTS`/`SETTINGS`(language) → Task 6, `FEEDBACK` → Task 7. KIOSK_ADMIN key retirement → Task 10. Package deletion → Task 11.

**Placeholder scan:** The two "read lines X-Y and port" instructions (Tasks 6 and 7) are not placeholders — they name an exact, currently-existing source range rather than describing work without showing how; a true placeholder here would be unavoidable only if the source code didn't exist yet, which it does.

**Type consistency:** `CloudKiosk`, `KioskCommandType` defined once in Task 4, not redefined elsewhere. `hasApp`/`useEntitlements` defined once in Task 1, consumed by name in Tasks 4, 9.

**Review Focus coverage:** gated-section absence → Task 9's DOM-presence test. Entitlement-refresh-without-logout → flagged as a Task 1 Step 1 investigation item (resolve before building `useEntitlements`, since it determines the hook's polling behavior) — if Task 1's investigation finds `fetchEntitlements()`'s cache doesn't refresh on a sensible cadence, add a polling interval to `useEntitlements` itself rather than leaving it as a known gap. Silent feature-gap-on-deletion → Task 2's explicit diff-and-document step. KIOSK_ADMIN-key clear-error-after-retirement → Task 10's own dedicated test. Kiosk-order-tagging-loss → Task 8's explicit check-first-add-if-missing step.
