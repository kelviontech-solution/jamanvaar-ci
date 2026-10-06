# Full-platform click-through — 2026-09-27

**How this was done:** all 7 apps (Super Admin, Restaurant Admin, POS, Captain, KDS, Kiosk, Kiosk Admin) were run for real (`npm run dev:*`) and driven with a real, visible Chrome window (Playwright), not a mock. One throwaway restaurant ("QA Bistro") was created through the same API Super Admin uses — full plan, one activation key per app, four real staff PINs, a small real menu (5 dishes, 2 categories, 3 tables) — and every app was signed in and clicked through as a real user would. The QA restaurant and its throwaway platform-admin accounts are deleted from the dev database; nothing was pushed to git.

## Summary

| App | Sign-in | Screens opened | Result |
|---|---|---|---|
| Super Admin | email + password + emailed code | 28 of 28 | all opened cleanly |
| Restaurant Admin (POS Admin) | Restaurant ID + owner password, then activation key | 22 of 22 | all opened cleanly (after a test-harness fix, see below) |
| POS | activation key, then staff PIN | 13 of 13 | all opened cleanly |
| Captain | activation key, then staff PIN | 5 of 5 | all opened cleanly |
| KDS | activation key, then staff PIN | 1 (single-screen app) | signs in, station list is real, receives orders |
| Kiosk | activation key (guest-facing, no PIN) | full guest order flow | placed a real order end to end |
| Kiosk Admin | Restaurant ID + owner password, key, then password again | 16 of 16 | all opened cleanly |

**Cross-app data flow — the actual thing you asked to check:**

| Flow | Result |
|---|---|
| Guest orders on the **Kiosk**, pays cash → appears on **KDS** | **PASS.** Order reached the KDS within seconds. Items split correctly by kitchen station (Tandoor station shows only the Tandoor dish, Beverage station shows only the drink). |
| Cashier sends a KOT from **POS** (takeaway) → appears on **KDS** | **PASS.** |
| Captain seats a table, adds a dish, fires the KOT → appears on **KDS** | **PASS.** |
| A **KDS** signing in fresh still catches up on an order placed before it started | **PASS** (cloud catch-up works). |

So: yes — if a restaurant has POS, Captain and Kiosk all subscribed, an order from any one of them reaches the KDS, and the KDS correctly splits tickets by station instead of showing everything on one screen.

---

## What was actually clicked, per app

### Super Admin (28 pages)
Executive Dashboard, Restaurants (list + one restaurant's detail page), Restaurant Owners, Branches, Subscriptions, Invoices & Billing, Plans & Entitlements, Feature Catalog, QR Ordering Suite, JAMAN AI Engine, Master Menu Catalog, Activation Keys, Payment Gateways, Applications & Releases, Device Fleet, Sync & Conflict Monitor, Backups & Recovery, System Telemetry, Staging Sandboxes, Reports & Analytics, Audit Logs, Emergency Offline Policy, Platform Team, Support Tickets, Diagnostics & Support, Platform Settings, My Profile. All opened; no blank pages, no 5xx errors, no uncaught JS errors.

Text on some pages includes things like "Demo", "@example.test" — these are **real rows already sitting in the shared dev database** from earlier work (other test/demo restaurants, this session's own throwaway QA accounts), not strings baked into the product. Spot-checked one ("jamanvaar.local" on the Platform Team page) against the source: it does not appear anywhere in the code, confirming it's old seeded/test data, not a hardcoded value.

### Restaurant Admin / POS Admin (22 pages)
Dashboard, Billing/Invoices, Orders, Live Orders/KDS, Floor/Tables, Reservations, Kitchen/KOT, QR Table Ordering, Menu & Categories, Customisations & Tax, Inventory & Recipes, Purchasing & Stock Control, Customers CRM, Staff & Roles, Payments & Split, Shift & Cash Drawer, Reports & Analytics, Printers & Devices, Sync & Devices, Restaurant Settings, Subscription Plans, Audit Trail Logs, Backup & Restore, Help & Support. All opened; no blank pages, no 5xx, no uncaught JS errors.

### POS (13 pages)
Billing/Menu, Floor & Tables, Live Orders, Bills & Invoices, Kitchen & KOT, Customers CRM, Shift & Cash, Day History, POS Reports, Inventory & Stock, Settings, JAMAN AI Assistant, Print Queue. All open (the AI assistant opens as a chat dialog, confirmed separately).

### Captain (5 pages)
My Tables (default landing — proven working via the live order flow above), Active Orders, Food Ready, Messages, More Options. All open.

### KDS
One operational screen (by design — a kitchen ticket board, not a multi-page app). Confirmed: real staff PIN sign-in, station list built from the real menu (not the old hard-coded 5-button list), receives and correctly station-routes orders from all three other apps.

### Kiosk
Full guest flow driven for real: language screen → Dine-In/Takeaway → table selection → menu (real dishes, real prices from the cloud) → add to cart (cart total math correct) → payment screen (Cash at Counter available; UPI correctly shown "Unavailable" since no payment gateway is configured for this restaurant) → order placed → token shown → order reaches KDS.

### Kiosk Admin (16 pages)
Dashboard, Menu Management, Combos & Meal Deals, Orders & KDS, Table Layout, Kiosk Terminals, Offers & Coupons, Receipt & E-Bill, Hardware & Diagnostics, Customer Feedback, Reports & Export, Staff & Roles, Sync Center, Audit Activity Logs, License & Entitlement, Settings & Backup. All open.

---

## Findings

### 1. Some full-screen dialogs do not close on the Escape key (confirmed, real)
Checked directly (not a test-harness guess): opening **EOD Report** or **Reconciliation** in Restaurant Admin, or **Invite Teammate** in Super Admin, then pressing Escape — the dialog stays open and keeps blocking clicks on whatever is behind it. Only the dialog's own button works, and that button isn't always labelled the same way (`Close`, `Close Audit`, or an icon with no text). There's no shared "Escape closes this" behavior across the apps' modal component.
- **Why it matters:** a keyboard user, or anyone used to Escape closing a dialog (the near-universal convention), gets stuck.
- **Severity:** low-to-medium — nothing breaks past it, but it's a real, confirmed gap, not a maybe.

### 2. Captain's mobile bottom nav runs the badge number into the label with no space
The bottom tab bar's raw text is `3My Tables` (digit immediately before the label, no space in between) on narrow layouts, versus `My Tables` + `3` as separate lines on the sidebar. Purely cosmetic/screen-reader text quality, not a functional bug — the tab works.

### 3. Everything else that looked broken on the first pass was the test harness, not the product
Worth recording so the "found 20 broken pages" numbers earlier in this run aren't misread: a first automated sweep of Restaurant Admin showed most of its 22 screens as "could not open." Investigating showed the actual cause: my own click-automation didn't know how to dismiss the EOD Report / Reconciliation dialogs (see finding 1 above), so once one of those opened, every subsequent click in the test was blocked by the same leftover overlay — a chain reaction in the *test script*, not the app. Once the test script was taught the same escape hatches a real user has, all 22 screens opened cleanly. Restaurant Admin, POS and Captain are not broken.

---

## What this did **not** check
- Real payment gateway charges (UPI/card) — no payment gateway is configured for a fresh restaurant, so only "Unavailable" vs "Cash at Counter" was confirmed, not an actual charge.
- Printing to real hardware.
- Every settings form's individual save button (a representative sample across each page was clicked, not literally every input on every screen).
- Multi-day/EOD close-day flows, refunds, voids, and other actions that are destructive or hard to undo were deliberately **not** clicked by the automated sweep (by design, so nothing in your dev database was locked, deleted or force-closed).
- Branch Core / offline-LAN mode, and the native desktop (Tauri) build — this was all run as the web dev build.
