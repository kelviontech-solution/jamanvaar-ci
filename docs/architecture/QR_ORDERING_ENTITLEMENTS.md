# QR Ordering: Entitlements

QR Ordering is a real feature of a plan. Whether a restaurant has it is decided by **one function on the server**, from the plan's feature list, never from a plan name, tier or price, and never by a frontend.

```
Plan (feature list, Super Admin edits it)  ─┐
                                            ├▶ ApplicationEntitlement row (per subscription): enabled, config (limits)
Super Admin override for ONE restaurant  ───┘        │
                                                     ▼
                       ApplicationEntitlementsService.resolve(tx, restaurantId, 'QR_ORDERING')
                       → { enabled, reason, source: PLAN | MANUAL_OVERRIDE, limits, validUntil, planName }
                                                     │
        ┌────────────────────┬───────────────────────┼────────────────────────┬─────────────────────┐
        ▼                    ▼                       ▼                        ▼                     ▼
 Restaurant Admin      QR admin API            public QR API           Branch Core roster     Super Admin view
 (draws locked/enabled) (403 if not enabled)   (refuses every request)  (offline snapshot)    (projection)
```

## The three example plans

| Feature | ₹5,000 | ₹7,000 | ₹9,000 |
|---|---|---|---|
| POS, Restaurant Admin, KOT | ✓ | ✓ | ✓ |
| KDS, Captain | — | ✓ | ✓ |
| **QR Ordering** | 🔒 | 🔒 | ✓ |

These are **data**: three plans whose feature lists differ in the `qrTableOrdering` flag. The suite proves it by giving a cheap CORE-tier plan the flag (it gets QR) and a QR-tier plan without it (it does not), and by renaming and repricing plans without any change in behaviour.

## How a plan grants the application

`appsForPlan` starts from the tier's long-standing application bundle **without QR**, then adds every application whose feature the plan lists as included (the Feature catalog says which flag grants which application). QR ordering is granted **only** by the plan's own flag. The result is written to the subscription's `ApplicationEntitlement` rows when the subscription is created or its plan changes.

## What the restaurant sees

| Result | Restaurant Admin | Guest page | QR admin API |
|---|---|---|---|
| enabled | "QR Ordering ✓ Enabled", tables, codes, orders, settings | menu and ordering | works |
| not in plan | "🔒 QR Ordering is not included in your current plan" + **View Plan**; the item stays visible so the feature is discoverable; no fake purchase | "QR Ordering is currently unavailable for this restaurant." | 403 `ENTITLEMENT_REQUIRED` |
| override (Super Admin) | Enabled, shown as special access | works | works |
| downgraded | "disabled because this restaurant's current plan does not include QR Ordering" | unavailable at once | 403 for changes; history still readable |
| subscription expired / restaurant inactive | unavailable with the reason | unavailable | 403 |

## Limits

Limits are values on the entitlement row (`qrMaxActiveTables`, `qrMaxOrdersPerDay`, …), set per plan or overridden per restaurant. Unset means no limit. The table limit is enforced when a code is created or re-enabled; the daily order limit is enforced inside the order's own transaction, so concurrent guests cannot overshoot it.

## Upgrade, downgrade, override

* **Upgrade** (plan changed to one that includes QR): existing tables and codes work again immediately; nothing is rebuilt.
* **Downgrade**: new QR orders are refused on the next request. Existing orders, codes and reports are kept.
* **Override**: a Super Admin enables or disables QR (and its limits) for one restaurant. It is stored on that restaurant's subscription row through the same service every application switch uses (dependency checks, audit). **The plan is not modified.** Removing the override returns the restaurant to what its plan says.

## Offline

Restaurant Admin keeps the last answer and draws the screen from it for **7 days** after it was fetched (the same window terminals use). After that, or with no saved answer, it says it needs the internet to check the plan instead of guessing. This only affects what is *drawn*; the server enforces every action, so a stale screen can never grant access. Branch Core receives the enabled applications in its roster and enforces them for devices while offline. A revoked feature cannot stay shown as enabled for longer than the 7-day window.

## Migration

Restaurants that had QR through the old "PRO tier" default (no explicit flag) keep it: the migration enables their entitlement row. Per-restaurant overrides that lived in `PlatformSetting` were copied onto the subscription's row. Super Admin can then turn either off.
