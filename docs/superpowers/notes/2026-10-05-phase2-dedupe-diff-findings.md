# Phase 2 dedupe diff findings — 2026-10-05

## TableModal

`apps/kiosk-system/kiosk-admin/src/components/TableModal.tsx` vs `apps/restaurant-system/pos-admin/src/components/TableModal.tsx`.

Diffed directly (`diff`). The two files are functionally identical — same props, same state, same `handleSubmit` logic (bulk-create via `planBulkTables`, duplicate-number check, `<`/`>` sanitization), same `TableRepository` calls. Only differences are cosmetic Tailwind classes (`jaman-navy` vs `slate-600` label color, a `<Button>` vs a raw styled `<button>` for Create/Save) and one extra inline comment in pos-admin's version referencing BUG-116/B2-016/B2-028.

**No gap found — pos-admin's version is a confirmed superset (identical).**

## StaffModal

`apps/kiosk-system/kiosk-admin/src/components/StaffModal.tsx` vs `apps/restaurant-system/pos-admin/src/components/StaffModal.tsx`.

Diffed directly. pos-admin's version has everything kiosk-admin's has (name/username/email/phone/role fields, real-role dropdown, PIN issue/reset-and-show-once flow, `StaffRepository.createUser`/`updateUser`) **plus** an `hourlyPay` field backed by `StaffScheduleRepository.getPayRates()`/`setPayRate()` that kiosk-admin's version deliberately does not have. Confirmed: kiosk-admin's file has zero references to `hourlyPay`/`StaffScheduleRepository` (`grep` returned nothing).

**No gap found — pos-admin's version is a confirmed superset.**

## Combos

kiosk-admin's `COMBOS` tab (`apps/kiosk-system/kiosk-admin/src/App.tsx:2429-3233`, inline in `App.tsx`) vs `apps/restaurant-system/pos-admin/src/components/menu/ComboModal.tsx`.

Compared the two forms' state variables directly rather than the full ~800-line inline block (the inline block is view/list/create-form mixed together; the state variables are the complete feature surface). kiosk-admin tracks: `comboName, comboDesc, comboPrice, comboOriginalPrice, comboMainItemIds, comboSideItemIds, comboDrinkItemIds, comboDessertItemIds`. pos-admin's `ComboModal` tracks the same eight fields under different names (`name, description, basePrice, originalPrice, mainItemIds, sideItemIds, drinkItemIds, dessertItemIds`) **plus two kiosk-admin lacks entirely**: `isAvailable` and `featured` (confirmed by reading kiosk-admin's state block in full — no `isAvailable`/`featured` anywhere near its combo state).

**No gap found — pos-admin's version is a confirmed superset.** (This resolves the spec's "Reconcile: COMBOS" row as **Dedupe**, not Relocate.)

## Audit

kiosk-admin's `AUDIT` tab (`apps/kiosk-system/kiosk-admin/src/App.tsx:4472-4500`) vs pos-admin's own `AUDIT` tab.

kiosk-admin's tab is a plain, read-only `auditLogs.map(...)` rendering of `{action, category, username, details, timestamp}` — the same shared `AuditRepository` log every terminal (including pos-admin itself) writes to and reads from. There is no kiosk-specific filtering, field, or action type; it is the identical underlying data pos-admin's own Audit Trail tab already shows.

**No gap found — this is the same shared log, not a parallel one.**

## License

kiosk-admin's `LICENSE` tab (`apps/kiosk-system/kiosk-admin/src/App.tsx:4504-4548`) vs pos-admin's own `LICENSE` / Subscription Plans tab.

kiosk-admin's tab is a plain, read-only display of the shared local `license` object (`planName, tier, activeDevicesCount, allowedDevicesCount, validUntil, licenseKey`) — the same license state object every terminal app (including pos-admin) already reads from cloud-synced entitlements. No kiosk-specific field.

**No gap found — this is the same shared license state, not a parallel one.**

## Order channel tagging (Task 8)

`Order.orderType` already includes `'KIOSK'` as a value (`packages/types/src/enums.ts:1`), and pos-admin's `OrdersModule.tsx:820` already renders `ord.orderType` as its own column — a kiosk-sourced order is already visible there as plain text "KIOSK", no code change needed. `KitchenKotModule.tsx` (the Live KDS view) showed no channel indicator at all before this task; added a small "Kiosk" badge next to the ticket's station label when `kot.orderType === 'KIOSK'` (`KOTRecord.orderType` is the same `OrderType` value, confirmed via `packages/types/src/domain.ts:1257`).

## Bonus finding while reading this range

kiosk-admin's `SETTINGS` tab begins immediately after `LICENSE`, at `App.tsx:4551`, and the "Customer Kiosk Language & Idle Timeout" section (`KIOSK_LANGUAGE_LABELS`) starts right at line ~4565 — confirms the exact starting line for Task 6's relocation of kiosk language settings.
