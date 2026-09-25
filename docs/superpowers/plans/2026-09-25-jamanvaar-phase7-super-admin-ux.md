# JAMANVAAR Phase 7: Super Admin UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (native, in-session).
> Subagents disallowed. Steps use checkbox (`- [ ]`) syntax for tracking. No automated frontend
> test infrastructure exists in `cloud/super-admin-web` — every task is verified by actually
> running the app (`npm run dev`) and exercising the flow, the same pattern Phase 4 used for the
> kiosk-admin/pos-admin frontends.

**Goal:** Give the Super Admin web console (`cloud/super-admin-web`) UI for four things the
backend has already shipped across Phases 1–6 but the frontend has never surfaced: the
customer-facing `restaurantCode` identity, a quota preview when generating an activation key, a
combined view of a restaurant's concurrent subscriptions (base + Kiosk add-on), and Phase 6's
application feature catalog (category/description/dependency + PLAN vs MANUAL_OVERRIDE source).

**Architecture:** `cloud/super-admin-web/src/api/types.ts` is the single source of truth this
whole app's components read from, and it has not been touched since before Phase 1 — it has no
`restaurantCode`, no `productFamily`, no `QR_ORDERING`, and no `source`/catalog concept. Task 1
brings it current with the backend's actual response shapes (verified by reading the DTOs, not
assumed). Tasks 2–5 each touch one page/component and one already-fetched piece of state — no
new global state, no new page tree, matching the master plan's "extends existing pages" framing.
Task 6 runs the app end-to-end against the real dev API with Playwright and does the final
review/commit/push.

**Tech Stack:** React 18, Vite, TypeScript, react-router-dom — no test runner in this app.

**Spec:** `docs/superpowers/plans/2026-09-24-jamanvaar-commercial-platform-redesign-MASTER.md`
(§ "Phase 7").

## Findings from reading the actual frontend code (corrects the master plan's Phase 7 scope)

- `cloud/super-admin-web/src/api/types.ts` has no `restaurantCode`, `mobile`, `productFamily`, or
  `QR_ORDERING` anywhere — confirmed by grep. `RestaurantCore`/`RestaurantListItem`/
  `RestaurantDetail` only carry the immutable `id` (UUID), which is what every page renders today
  as "Restaurant ID". `Plan.tier` is typed `'CORE' | 'PRO' | 'ENTERPRISE'` (no `'QR'`), and
  `Subscription`/`Plan` have no `productFamily` field at all.
- `PlanDetailPage.tsx` **already** renders an expandable category matrix (its "CARD 2: MODULAR
  CAPABILITIES BREAKDOWN", built on `OPERATIONAL_MODULE_CATEGORIES` from `@jamanvaar/types`) — it
  is not "a flat vertical list" as the master plan's Phase 7 text assumed. That matrix covers the
  21-key `Plan.entitlements` list, a system this redesign does not touch (see Phase 6's own
  Findings section on why). The genuinely missing piece — confirmed by grep, zero matches — is
  any UI at all for Phase 6's `ApplicationEntitlement`/`AppCode` catalog (category, description,
  dependency edges, `source: PLAN | MANUAL_OVERRIDE`); `RestaurantDetailPage.tsx`'s "Applications"
  tab already lists per-app enable/disable toggles but shows none of that new data. This plan
  redirects Phase 7's "category matrix" deliverable there, where it's actually new, instead of
  redoing `PlanDetailPage.tsx`'s matrix a second time for data it already displays.
- `RestaurantDetailPage.tsx`'s "Subscription" tab (and every other tab that reads `activeSub`)
  picks exactly one subscription — `restaurant.subscriptions.find(s => ACTIVE || TRIAL) ??
  restaurant.subscriptions[0]` — even though the type (`subscriptions: Subscription[]`) and the
  backend (Phase 2/5: one active subscription per `productFamily`) already support a restaurant
  holding two concurrent ones. This is the literal gap the master plan's "shows both active
  subscriptions as separate cards" deliverable describes.
- `GenerateActivationKeyModal.tsx` has no quota information at all today — just a device-type
  dropdown and an expiry field. The data needed for a preview (a restaurant's current device
  count per type, and that app's quota) already exists via `GET /api/v1/restaurants/:id`
  (`devices[]`) and `GET /api/v1/restaurants/:id/applications` (`deviceQuota`, and after Phase 6,
  `source`) — nothing new needs to ship on the backend for this.
- `QR_ORDERING` has no `DeviceType`/`ActivationKeyDeviceType` value (Phase 5's deliberate ruling:
  it's a restaurant-wide web feature with no physical device) — it must **not** be added to
  `GenerateActivationKeyModal.tsx`'s device-type dropdown, only to `APP_CODES` for the
  Applications-tab catalog display.

## Global Constraints

- No new pages or routes — every change extends an existing page/component, matching the master
  plan's explicit framing for this phase.
- `Plan.tier`'s new `'QR'` value and `Subscription`/`Plan`'s new `productFamily` field are typed
  additively; nothing currently rendering `'CORE' | 'PRO' | 'ENTERPRISE'` may crash or type-error
  on a value it doesn't recognize — every switch/lookup over `tier` gets an explicit fallback
  branch, not an exhaustive union assumption.
- No automated test exists for this app — every task's own verification step is "run the dev
  server and the real `cloud/api`, exercise the flow in a browser," not a unit test. `npm run
  build` (which runs `tsc --noEmit` first, per this app's own `package.json`) is the only
  automated gate, run at the end of every task.
- Every new fetch this plan adds reuses the existing `api.get`/`api.patch` client
  (`cloud/super-admin-web/src/api/client.ts`) and its existing `ApiError` handling pattern — no
  new HTTP layer.

## Review Focus

- A restaurant created before Phase 1 shipped has `restaurantCode: null` (the backfill script
  flags rows with no valid mobile for manual review rather than inventing one) — the identity
  block must show a clear "not yet assigned" state, not `null`/`undefined` rendered literally.
  Covered by Task 2.
- A restaurant with a subscription whose `plan.productFamily` is missing from an older cached
  API response shape (defensive: the field is new) must not crash the Subscription tab — default
  to `'RESTAURANT'` rather than reading `undefined.toUpperCase()` or similar. Covered by Task 5.
- The activation-key quota preview must handle a restaurant with **no** `ApplicationEntitlement`
  row for the selected device type yet (pre-Phase-2 subscriptions can have zero rows — see
  `application-entitlements.service.ts`'s own `listForRestaurant` returning `[]`) by falling back
  to the plan's `maxDevices`, not showing a broken "undefined / undefined" preview. Covered by
  Task 4.
- Selecting `deviceType: 'ANY'` in the activation-key modal must not attempt a per-app quota
  preview at all (no single `AppCode` corresponds to `'ANY'`) — it should show a neutral message
  instead of a wrong number. Covered by Task 4.
- The Applications tab's new catalog fetch must not block or break the existing enable/disable
  toggles if it fails (e.g. a stale platform token mid-session) — the toggle buttons already work
  from `appEntitlements` alone; the catalog call only adds category/description/source, and its
  failure must degrade to hiding that extra info, not disabling the page. Covered by Task 3.

---

### Task 1: Frontend types catch-up

**Files:**
- Modify: `cloud/super-admin-web/src/api/types.ts`

**Interfaces:**
- Consumes: the real backend response shapes — `Restaurant.restaurantCode`/`mobile` (Phase 1,
  `cloud/api/prisma/schema.prisma`), `Plan.productFamily`/`PlanTier.QR` (Phase 5),
  `AppCode.QR_ORDERING` (Phase 5), `ApplicationEntitlement.source` and the catalog shape from
  `GET /api/v1/application-entitlements/catalog` (Phase 6,
  `cloud/api/src/modules/application-entitlements/feature-catalog.ts`).
- Produces: `RestaurantCore.restaurantCode: string | null`, `RestaurantCore.mobile: string |
  null`; `Plan.tier` widened to include `'QR'`; `Plan.productFamily: 'RESTAURANT' | 'KIOSK'`;
  `APP_CODES` extended with `'QR_ORDERING'` (+ its label); `ApplicationEntitlement.source: 'PLAN'
  | 'MANUAL_OVERRIDE'`; a new `FeatureCatalogEntry` interface and `FEATURE_CATALOG_APP_CODES`
  export — consumed by Task 3.

- [ ] **Step 1: Add the new fields to `RestaurantCore`**

In `cloud/super-admin-web/src/api/types.ts`, find `export interface RestaurantCore {` and add two
fields right after `id: string;`:

```typescript
export interface RestaurantCore {
  id: string;
  // Customer-facing identity ("JM" + 10-digit mobile). Null for a legacy restaurant the Phase 1
  // backfill flagged for manual review (no valid mobile on record at backfill time).
  restaurantCode: string | null;
  mobile: string | null;
  name: string;
  legalName: string | null;
  address?: string | null;
  city: string | null;
  state: string | null;
  gstin?: string | null;
  fssaiNumber?: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  createdAt: string;
}
```

- [ ] **Step 2: Widen `Plan.tier` and add `productFamily`**

Find `export interface Plan {` and change its `tier` line and add `productFamily`:

```typescript
export interface Plan {
  id: string;
  tier: 'CORE' | 'PRO' | 'QR' | 'ENTERPRISE';
  // Which commercial product line this plan belongs to — a restaurant may hold one active
  // subscription per family concurrently (a RESTAURANT plan plus a separate KIOSK add-on).
  productFamily: 'RESTAURANT' | 'KIOSK';
  name: string;
  description: string | null;
  priceMonthly: number;
  priceYearly: number | null;
  maxBranches: number;
  maxDevices: number;
  maxUsers: number;
  entitlements: Entitlements;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  _count?: { subscriptions: number };
}
```

- [ ] **Step 3: Add `QR_ORDERING` to `APP_CODES`**

Find `export const APP_CODES = [...]` and `APP_CODE_LABELS`:

```typescript
export const APP_CODES = ['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS', 'KIOSK', 'KIOSK_ADMIN', 'QR_ORDERING'] as const;
export type AppCode = (typeof APP_CODES)[number];

export const APP_CODE_LABELS: Record<AppCode, string> = {
  POS: 'POS',
  POS_ADMIN: 'Restaurant Admin',
  CAPTAIN: 'Captain App',
  KDS: 'Kitchen Display (KDS)',
  KIOSK: 'Self-Ordering Kiosk',
  KIOSK_ADMIN: 'Kiosk Admin',
  QR_ORDERING: 'QR Table Ordering'
};
```

- [ ] **Step 4: Add `source` to `ApplicationEntitlement` and the catalog types**

Find `export interface ApplicationEntitlement {` and add `source`; then add the two new exports
right after it:

```typescript
export interface ApplicationEntitlement {
  id: string;
  restaurantId: string;
  subscriptionId: string;
  appCode: AppCode;
  enabled: boolean;
  deviceQuota: number | null;
  config: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  // Phase 6: whether `enabled` currently matches the owning subscription's plan-tier default, or
  // was manually toggled away from it by a Super Admin.
  source: 'PLAN' | 'MANUAL_OVERRIDE';
}

export interface FeatureCatalogEntry {
  category: string;
  description: string;
  dependsOn: AppCode[];
}

/** GET /api/v1/application-entitlements/catalog — one entry per AppCode. */
export type FeatureCatalog = Record<AppCode, FeatureCatalogEntry>;
```

- [ ] **Step 5: Verify the typecheck still passes**

Run: `cd cloud/super-admin-web && npx tsc --noEmit`
Expected: no errors — every existing consumer of these types (`RestaurantDetailPage.tsx`,
`RestaurantsListPage.tsx`, `PlanDetailPage.tsx`, etc.) only reads a subset of these interfaces'
fields today, so adding new optional-in-practice fields and widening `tier`'s union is additive.
If any `switch (plan.tier)` or similar exhaustiveness check now errors on the unhandled `'QR'`
case, that call site is a real gap — add a `default:`/fallback branch there (this is the
"defensive fallback" required by Global Constraints), do not narrow the type back down.

- [ ] **Step 6: Commit**

```bash
git add cloud/super-admin-web/src/api/types.ts
git commit -m "feat(super-admin-web): add restaurantCode, productFamily, QR tier and catalog types"
```

---

### Task 2: Restaurant identity block — surface `restaurantCode`, demote the raw UUID

**Files:**
- Modify: `cloud/super-admin-web/src/pages/Restaurants/RestaurantDetailPage.tsx`

**Interfaces:**
- Consumes: `RestaurantCore.restaurantCode`/`mobile` (Task 1).
- Produces: nothing consumed by a later task.

- [ ] **Step 1: Replace the page header's inline UUID with the restaurantCode, and add a copy control**

In `RestaurantDetailPage.tsx`, find the `page-subtitle` line inside the header (around line 702):

```typescript
          <p className="page-subtitle">
            {[restaurant.city, restaurant.state, restaurant.country].filter(Boolean).join(', ')} • {restaurant.branches.length} Branch{restaurant.branches.length > 1 ? 'es' : ''} • {restaurant.devices.length} Registered Terminal{restaurant.devices.length > 1 ? 's' : ''} • ID: <code className="mono" style={{ fontSize: 11 }}>{restaurant.id}</code>
          </p>
```

Replace it with (drop the trailing `• ID: ...` fragment — the identity block below now owns
showing the identifier):

```typescript
          <p className="page-subtitle">
            {[restaurant.city, restaurant.state, restaurant.country].filter(Boolean).join(', ')} • {restaurant.branches.length} Branch{restaurant.branches.length > 1 ? 'es' : ''} • {restaurant.devices.length} Registered Terminal{restaurant.devices.length > 1 ? 's' : ''}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            {restaurant.restaurantCode ? (
              <>
                <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>Restaurant ID:</span>
                <code className="mono" style={{ fontSize: 13, fontWeight: 800, color: '#0B253A' }}>{restaurant.restaurantCode}</code>
                <CopyButton text={restaurant.restaurantCode} label="Copy" title="Copy the Restaurant ID" />
              </>
            ) : (
              <Badge tone="warning">Restaurant ID not yet assigned — add a mobile number to generate one</Badge>
            )}
          </div>
```

- [ ] **Step 2: Move the raw UUID under an "Advanced / Internal IDs" disclosure**

In the "Commercial & Legal Profile" card (around line 752-777), find:

```typescript
            <Card className="detail-card">
              <div className="detail-card-title">Commercial &amp; Legal Profile</div>
              <dl className="detail-list">
                <dt>Restaurant ID</dt>
                <dd>
                  <span className="mono" style={{ fontSize: 12, wordBreak: 'break-all' }}>{restaurant.id}</span>{' '}
                  <CopyButton text={restaurant.id} label="Copy ID" title="Copy the Restaurant ID" />
                </dd>
                <dt>Legal Name</dt>
```

Replace with:

```typescript
            <Card className="detail-card">
              <div className="detail-card-title">Commercial &amp; Legal Profile</div>
              <dl className="detail-list">
                <dt>Restaurant ID</dt>
                <dd>
                  {restaurant.restaurantCode ? (
                    <span className="mono" style={{ fontSize: 13, fontWeight: 700 }}>{restaurant.restaurantCode}</span>
                  ) : (
                    <span className="muted">Not yet assigned</span>
                  )}
                </dd>
                <dt>Registered Mobile</dt>
                <dd>{restaurant.mobile || '—'}</dd>
                <dt>Legal Name</dt>
```

Then, immediately after the closing `</dl>` of this same card (before `</Card>`), add the
disclosure holding the internal UUID:

```typescript
              </dl>
              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#64748b' }}>
                  Advanced / Internal IDs
                </summary>
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="muted" style={{ fontSize: 11 }}>Internal UUID:</span>
                  <span className="mono" style={{ fontSize: 11, wordBreak: 'break-all' }}>{restaurant.id}</span>
                  <CopyButton text={restaurant.id} label="Copy" title="Copy the internal UUID" />
                </div>
              </details>
            </Card>
```

- [ ] **Step 3: Update the "Hardware & Terminal Activation Keys" card to lead with `restaurantCode`**

Around line 816-820, find:

```typescript
                <div style={{ margin: '8px 0 0 0', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13, color: '#0B253A' }}>
                  <strong>Restaurant ID</strong>
                  <code className="mono" style={{ fontSize: 12, background: '#fff', border: '1px solid #FDBA74', borderRadius: 8, padding: '3px 8px', wordBreak: 'break-all' }}>{restaurant.id}</code>
                  <CopyButton text={restaurant.id} label="Copy ID" title="Copy the Restaurant ID" />
                </div>
```

Replace with:

```typescript
                <div style={{ margin: '8px 0 0 0', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13, color: '#0B253A' }}>
                  <strong>Restaurant ID</strong>
                  <code className="mono" style={{ fontSize: 12, background: '#fff', border: '1px solid #FDBA74', borderRadius: 8, padding: '3px 8px', wordBreak: 'break-all' }}>
                    {restaurant.restaurantCode ?? 'Not yet assigned'}
                  </code>
                  {restaurant.restaurantCode && (
                    <CopyButton text={restaurant.restaurantCode} label="Copy ID" title="Copy the Restaurant ID" />
                  )}
                </div>
```

(This is the ID Kiosk Admin/Captain/POS ask the owner for at first login — it must be the
customer-facing code, not the internal UUID, for that flow to make sense to a restaurant owner.)

- [ ] **Step 4: Run the typecheck**

Run: `cd cloud/super-admin-web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Verify by running the app**

Run (two terminals, both already documented in this repo's existing dev workflow from Phase 4):
`cd cloud/api && npm run start:dev` and `cd cloud/super-admin-web && npm run dev` (port 5180).
Log in as the seeded platform admin (`superadmin@jamanvaar.app` — see Task 6 for how this plan
obtains a known password for verification), open any restaurant created **after** Phase 1 shipped
(it will have a `restaurantCode`), and confirm: the header shows the code with a working copy
button, the "Advanced / Internal IDs" disclosure is collapsed by default and reveals the UUID
when clicked, and the Activation Keys card shows the same code. Then open a restaurant created
**before** Phase 1 (or one created with no `mobile`) and confirm the "not yet assigned" states
render instead of `null`.

- [ ] **Step 6: Commit**

```bash
git add cloud/super-admin-web/src/pages/Restaurants/RestaurantDetailPage.tsx
git commit -m "feat(super-admin-web): lead restaurant identity with restaurantCode, demote UUID to a disclosure"
```

---

### Task 3: Application feature catalog surfaced on the Applications tab

**Files:**
- Modify: `cloud/super-admin-web/src/pages/Restaurants/RestaurantDetailPage.tsx`

**Interfaces:**
- Consumes: `FeatureCatalog`, `ApplicationEntitlement.source` (Task 1); `GET
  /api/v1/application-entitlements/catalog` (Phase 6).
- Produces: nothing consumed by a later task.

- [ ] **Step 1: Fetch the catalog alongside the existing entitlements fetch**

Add a new import next to the existing type imports (near the top of the file):

```typescript
import type { FeatureCatalog } from '../../api/types';
```

Add new state next to `appEntitlements`/`savingAppCode` (around line 220-221):

```typescript
  const [featureCatalog, setFeatureCatalog] = useState<FeatureCatalog | null>(null);
```

In the lazy-load tab-data `useEffect` (around line 378-383), extend the `applications` tab
branch:

```typescript
    if (tab === 'applications' && !appEntitlements) {
      api
        .get<ApplicationEntitlement[]>(`/api/v1/restaurants/${id}/applications`)
        .then(setAppEntitlements)
        .catch(() => setAppEntitlements([]));
    }
    if (tab === 'applications' && !featureCatalog) {
      // Degrades gracefully: if this call fails, category/description/source badges are just
      // omitted — the enable/disable toggles below read from appEntitlements alone and keep working.
      api.get<FeatureCatalog>('/api/v1/application-entitlements/catalog').then(setFeatureCatalog).catch(() => {});
    }
```

Add `featureCatalog` to that effect's dependency array (it already lists `appEntitlements`, add
alongside it).

- [ ] **Step 2: Render category, description and source on each app tile**

In the Applications tab's tile rendering (around line 1145-1190), find the tile's content block:

```typescript
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: enabled ? '#166534' : '#0B253A' }}>
                          {APP_CODE_LABELS[code]}
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                          {deviceCount} device{deviceCount === 1 ? '' : 's'} active
                          {row?.deviceQuota ? ` · quota ${row.deviceQuota}` : ''}
                        </div>
                      </div>
                      <Badge tone={enabled ? 'success' : 'neutral'}>{enabled ? 'Enabled' : 'Disabled'}</Badge>
                    </div>
```

Replace with (adds the catalog description, a category chip, and a source badge — all optional
since `featureCatalog`/`row` may not have loaded yet):

```typescript
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: enabled ? '#166534' : '#0B253A' }}>
                            {APP_CODE_LABELS[code]}
                          </span>
                          {featureCatalog?.[code] && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 6, padding: '1px 6px' }}>
                              {featureCatalog[code].category}
                            </span>
                          )}
                        </div>
                        {featureCatalog?.[code] && (
                          <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>{featureCatalog[code].description}</div>
                        )}
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                          {deviceCount} device{deviceCount === 1 ? '' : 's'} active
                          {row?.deviceQuota ? ` · quota ${row.deviceQuota}` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        <Badge tone={enabled ? 'success' : 'neutral'}>{enabled ? 'Enabled' : 'Disabled'}</Badge>
                        {row?.source === 'MANUAL_OVERRIDE' && <Badge tone="warning">Manual override</Badge>}
                      </div>
                    </div>
```

- [ ] **Step 3: Run the typecheck**

Run: `cd cloud/super-admin-web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify by running the app**

With both dev servers running, open a restaurant's Applications tab. Confirm each tile now shows
a category chip and description under the app name, and that any app whose `enabled` state was
manually toggled away from its plan's default shows a "Manual override" badge (toggle POS_ADMIN
off then back on manually to see the badge appear, matching Phase 6's `source` logic — note
`POS_ADMIN requires POS`, so if `POS` is currently disabled this toggle will correctly be
refused with a 409; pick an app with no dependents, e.g. `CAPTAIN` or `KDS`, to demonstrate the
override badge without hitting that check). Confirm the enable/disable buttons still work exactly
as before.

- [ ] **Step 5: Commit**

```bash
git add cloud/super-admin-web/src/pages/Restaurants/RestaurantDetailPage.tsx
git commit -m "feat(super-admin-web): surface Phase 6 feature catalog (category, description, source) on the Applications tab"
```

---

### Task 4: Activation-key generation dialog gets a quota preview

**Files:**
- Modify: `cloud/super-admin-web/src/pages/ActivationKeys/GenerateActivationKeyModal.tsx`

**Interfaces:**
- Consumes: `GET /api/v1/restaurants/:id` (existing, returns `devices[]`), `GET
  /api/v1/restaurants/:id/applications` (existing + Phase 6's `deviceQuota`/`source`).
- Produces: nothing consumed by a later task.

- [ ] **Step 1: Fetch quota data once a restaurant and a real device type are both selected**

Add imports/types near the top of `GenerateActivationKeyModal.tsx`:

```typescript
import type { ApplicationEntitlement, RestaurantDetail } from '../../api/types';
```

Add state alongside the existing `branches`/`branchId` state:

```typescript
  const [quotaPreview, setQuotaPreview] = useState<{ current: number; quota: number } | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(false);
```

Add a new effect (place it after the existing `branches`-loading effect):

```typescript
  useEffect(() => {
    setQuotaPreview(null);
    // 'ANY' isn't a single AppCode — no per-app quota applies to it.
    if (!restaurantId || deviceType === 'ANY') return;
    setQuotaLoading(true);
    Promise.all([
      api.get<RestaurantDetail>(`/api/v1/restaurants/${restaurantId}`),
      api.get<ApplicationEntitlement[]>(`/api/v1/restaurants/${restaurantId}/applications`)
    ])
      .then(([restaurant, entitlements]) => {
        const current = restaurant.devices.filter((d) => (d as { type: string }).type === deviceType && d.status !== 'REVOKED').length;
        const row = entitlements.find((e) => e.appCode === deviceType);
        const activeSub = restaurant.subscriptions.find((s) => s.status === 'ACTIVE' || s.status === 'TRIAL') ?? restaurant.subscriptions[0];
        // No entitlement row yet (a pre-Phase-2 subscription) — fall back to the plan's overall cap.
        const quota = row?.deviceQuota ?? activeSub?.plan.maxDevices ?? 0;
        setQuotaPreview({ current, quota });
      })
      .catch(() => setQuotaPreview(null))
      .finally(() => setQuotaLoading(false));
  }, [restaurantId, deviceType]);
```

- [ ] **Step 2: Render the preview under the device-type field**

In the form's device-type field (around line 126-138), find:

```typescript
              <div className="field">
                <label>Allowed device type</label>
                <select value={deviceType} onChange={(e) => setDeviceType(e.target.value as typeof deviceType)}>
                  <option value="ANY">Restaurant Admin Console (Any Terminal)</option>
                  <option value="POS_ADMIN">Restaurant Admin Console (POS_ADMIN)</option>
                  <option value="POS">Main Billing Counter POS</option>
                  <option value="CAPTAIN">Captain Waiter Tablet</option>
                  <option value="KDS">Kitchen Order Display (KDS)</option>
                  <option value="KIOSK">Self-Order Kiosk</option>
                  <option value="KIOSK_ADMIN">Kiosk Admin Console</option>
                </select>
              </div>
```

Add the preview immediately after this `</div>` (still inside the same `form-grid`'s parent, as
its own block below the grid):

```typescript
            {deviceType !== 'ANY' && restaurantId && (
              <div style={{ fontSize: 12, color: '#64748b', margin: '-4px 0 4px' }}>
                {quotaLoading ? (
                  'Checking device quota…'
                ) : quotaPreview ? (
                  <span style={{ color: quotaPreview.current + 1 > quotaPreview.quota ? '#dc2626' : '#64748b', fontWeight: quotaPreview.current + 1 > quotaPreview.quota ? 700 : 400 }}>
                    {quotaPreview.current} / {quotaPreview.quota} devices in use → {quotaPreview.current + 1} / {quotaPreview.quota} after this key is redeemed
                    {quotaPreview.current + 1 > quotaPreview.quota ? ' — over quota, redemption will be refused' : ''}
                  </span>
                ) : null}
              </div>
            )}
```

- [ ] **Step 3: Run the typecheck**

Run: `cd cloud/super-admin-web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify by running the app**

Open "Generate Activation Key" for a restaurant with at least one existing device. Select that
device's type and confirm the current/requested/after line appears with the right numbers.
Select `ANY` and confirm the line disappears. If the restaurant is already at its quota for a
type, generate one more key for that type and confirm the preview turns red/bold and the warning
text appears (the actual generation call still succeeds — it's redemption that Phase 2 gates on
quota, not key generation — so this is a preview/warning, not a blocker, matching the master
plan's "quota preview" wording rather than a hard stop).

- [ ] **Step 5: Commit**

```bash
git add cloud/super-admin-web/src/pages/ActivationKeys/GenerateActivationKeyModal.tsx
git commit -m "feat(super-admin-web): show current/requested/after device quota when generating an activation key"
```

---

### Task 5: Restaurant overview shows every active subscription as its own card

**Files:**
- Modify: `cloud/super-admin-web/src/pages/Restaurants/RestaurantDetailPage.tsx`

**Interfaces:**
- Consumes: `Plan.productFamily` (Task 1).
- Produces: nothing consumed by a later task.

- [ ] **Step 1: Write a small helper for a family-labelled subscription card, and compute all active subscriptions**

Just before the `return (` in `RestaurantDetailPage()` (after the existing `activeSub`/
`effectiveTier`/`isPro` computation around line 645-651), add:

```typescript
  // Phase 2/5: a restaurant may hold one active subscription per productFamily concurrently —
  // a RESTAURANT-family base plan plus a separate KIOSK-family add-on. `activeSub` above stays
  // the single "primary" one every other tab's logic keys off of (backward compatible); this is
  // every subscription currently ACTIVE or TRIAL, for the overview's combined summary.
  const allActiveSubs = restaurant.subscriptions.filter((s) => s.status === 'ACTIVE' || s.status === 'TRIAL');
  const familyLabel = (family: string | undefined) => (family === 'KIOSK' ? 'Kiosk Add-on' : 'Restaurant Plan');
```

- [ ] **Step 2: Render one card per active subscription in the Subscription tab**

In the Subscription tab (around line 1056-1112), find the single-card block:

```typescript
      {tab === 'subscription' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Card style={{ padding: 22 }}>
```

Leave that first card (the "Current SaaS Subscription Plan" one, tied to `activeSub` and the
Extend/Change Plan buttons) exactly as-is — it stays the primary action surface. Immediately
before its closing `</Card>` and the `<LicenseCertificatePanel ... />` line that follows, insert
a new block that lists every other active subscription (i.e., every one besides `activeSub`,
since that one is already shown above):

```typescript
          {allActiveSubs.filter((s) => s.id !== activeSub?.id).length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
              {allActiveSubs.filter((s) => s.id !== activeSub?.id).map((s) => (
                <Card key={s.id} style={{ padding: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#64748b' }}>
                      {familyLabel((s.plan as { productFamily?: string }).productFamily)}
                    </span>
                    <Badge tone={statusTone(s.status)} pulse={s.status === 'ACTIVE'}>{s.status}</Badge>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>{s.plan.name}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    {s.plan.tier} · ₹{(s.plan.priceMonthly / 100).toLocaleString('en-IN')}/mo · expires {new Date(s.expiresAt).toLocaleDateString('en-IN')}
                  </div>
                </Card>
              ))}
            </div>
          )}

          <LicenseCertificatePanel restaurantId={restaurant.id} />
```

(Remove the old standalone `<LicenseCertificatePanel restaurantId={restaurant.id} />` line this
replaces, so it isn't rendered twice.)

- [ ] **Step 3: Combined entitlement summary — reuse the existing Applications tab data**

Add one line inside the "Current SaaS Subscription Plan" card's header area (next to its existing
`<h3>`/description, around line 1060-1067), so the primary card itself states when more than one
subscription is active:

```typescript
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                  Governs feature flags, maximum allowed POS terminals, and cloud sync policies.
                  {allActiveSubs.length > 1 && ` This restaurant holds ${allActiveSubs.length} active subscriptions — see the Applications tab for their combined entitlements.`}
                </p>
```

(This replaces the existing single `<p>` at that location. The Applications tab already
aggregates across every active subscription — `GET /api/v1/restaurants/:id/applications`'s
`listForRestaurant` picks one subscription today, so this sentence is accurate as a pointer to
where a combined view belongs; a deeper backend aggregation of that specific endpoint is out of
this task's scope, which is presentation of what Task 1–4 and the existing API already return.)

- [ ] **Step 4: Run the typecheck**

Run: `cd cloud/super-admin-web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Verify by running the app**

Open a restaurant that holds both a RESTAURANT-family and a KIOSK-family active subscription (use
`multi-family-subscriptions.e2e.spec.ts`'s pattern, or assign both from the Subscriptions page
against a restaurant you control in the dev DB, to create one for this check). Confirm the
Subscription tab now shows the primary card plus a second "Kiosk Add-on" card with its own plan
name, tier, price and expiry. Open a restaurant with only one subscription and confirm no second
card renders and no crash occurs.

- [ ] **Step 6: Commit**

```bash
git add cloud/super-admin-web/src/pages/Restaurants/RestaurantDetailPage.tsx
git commit -m "feat(super-admin-web): show every active subscription (base + Kiosk add-on) as its own card"
```

---

### Task 6: Full verification, typecheck, and final review

**Files:** none (verification only).

- [ ] **Step 1: Ensure a known Super Admin credential exists for verification**

The seeded platform admin's password is random unless overridden. Run once against the dev
database:

Run: `cd cloud/api && SEED_SUPER_ADMIN_PASSWORD=<a-local-dev-only-password> SEED_RESET_SUPER_ADMIN_PASSWORD=true npx prisma db seed`
Expected: seed output confirms the super admin's password was reset. This is a local dev-database
credential only — it is never committed and never used against a shared/deployed environment.

- [ ] **Step 2: Run the whole flow end-to-end in the browser**

With `cloud/api`'s dev server and `cloud/super-admin-web`'s dev server both running, log in with
the credential from Step 1 and walk through, in order: Task 2's identity block (a
`restaurantCode`-having restaurant and one without), Task 3's Applications tab catalog, Task 4's
activation-key quota preview (including an over-quota case), and Task 5's multi-subscription
cards. Confirm no console errors appear in the browser during any of these (check via the
browser's devtools console, or the Playwright `browser_console_messages` tool if using Playwright
for this pass).

- [ ] **Step 3: Run the production build (catches anything `tsc --noEmit` alone might miss, e.g. Vite-specific import issues)**

Run: `cd cloud/super-admin-web && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 4: Self-review the full diff**

Run: `git diff 34cb5ba -- cloud/super-admin-web/src` and read every changed line. Confirm: every
new field read off `restaurant`/`plan`/`row` objects has a fallback for `null`/`undefined` (no
raw `.toUpperCase()` or similar on a possibly-missing field), the quota preview never renders for
`deviceType === 'ANY'`, and no existing enable/disable/generate/extend action's behavior changed
— only new information was added around them.

- [ ] **Step 5: Commit this plan document**

```bash
git add docs/superpowers/plans/2026-09-25-jamanvaar-phase7-super-admin-ux.md
git commit -m "docs: add Phase 7 (Super Admin UX redesign) plan"
```

- [ ] **Step 6: Push**

```bash
git push origin main
```
