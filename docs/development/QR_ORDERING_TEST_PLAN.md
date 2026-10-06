# QR Ordering: Test Plan and Coverage

## Where the tests are

| Suite | File | What it proves |
|---|---|---|
| Cloud e2e (real API, real PostgreSQL with row-level security) | `cloud/api/test/qr-ordering-saas.e2e.spec.ts` (51 tests) | entitlement, codes, public API, menu, pricing, idempotency, pipeline delivery, claim, settings, limits, analytics, abuse |
| Cloud e2e | `cloud/api/test/qr-legacy-compat.e2e.spec.ts` (6) | legacy tokens, guessable tokens refused, cross-tenant takeover impossible, deprecated adapter |
| Cloud e2e | `cloud/api/test/qr-ordering.e2e.spec.ts` (4) | platform view, usage computed not reported, AppCode entitlement |
| Cloud unit | `cloud/api/src/common/cors.spec.ts` (4) | route-scoped CORS |
| Root (devices, real Branch Core over HTTP) | `tests/qr_order_desk.test.ts` (9) | deterministic tickets, accept claim, two terminals at once, offline accept, decline |
| Root | `tests/qr_guest_cart.test.ts` (7) | guest cart rules, attempt key, hostile saved cart |
| Root (existing, extended by the work) | `tests/branch_core*.test.ts`, `offline_routing_integration`, `pos_full_offline_sqlite` | Branch Core delivery, restart, exactly-once, POS offline on SQLite |
| Real browser | run by hand with the live fixture (below) | the guest flow against the real API |

Run: `cd cloud/api && npx vitest run` and, from the repository root, `npx vitest run`.

## The 40 tests the specification lists

| # | Requirement | Test |
|---|---|---|
| 1-3 | token resolves the right restaurant, branch, table | "generates an unguessable token … resolves to the right restaurant, branch and table" |
| 4 | invalid QR rejected | "unknown, malformed and guessed tokens are refused" |
| 5, 6 | revoked / disabled rejected | "regenerating makes the old token dead", "disable and enable are reversible" |
| 7, 8 | inactive restaurant / branch rejected | "a suspended restaurant and a deactivated branch stop the guest page at once, and coming back restores it" |
| 9, 10 | entitlement disabled rejected / enabled works | "₹5,000 and ₹7,000 plans are locked…", "a locked restaurant cannot generate a code" |
| 11, 12 | upgrade enables, downgrade blocks | "upgrade enables QR … downgrade blocks new QR orders" |
| 13 | feature override works | "a Super Admin override enables QR for one restaurant without touching the plan" |
| 14, 15 | menu from the right restaurant, never leaks | "never leaks another restaurant: same table number, different menu" |
| 16 | branch isolation | "a dish restricted to one branch…", "delivered … to no other branch" |
| 17 | item validation | "an item of another restaurant, an unknown item…", "modifier rules come from the restaurant" |
| 18 | price tampering rejected | "rejects any client price, total, restaurant, branch or table" |
| 19, 20 | duplicate prevention, retry after timeout | "a repeated submit … is one order, and concurrent submits are one order" |
| 21 | enters the canonical Order | "is delivered … with source QR" (SyncedOrder, seq, source) |
| 22 | reaches POS | same test, plus the real-browser run; `qr_order_desk` arrival test |
| 23 | creates KOT | `qr_order_desk`: "every terminal builds the SAME kitchen tickets" |
| 24 | KOT reaches KDS | KDS reads the same cursor pull; `qr_order_desk` second-terminal test (the KDS role is a terminal that starts from nothing). **The KDS screen itself was not driven in a browser.** |
| 25 | duplicate sync doesn't duplicate | `qr_order_desk` "pulling the same order again never creates a second ticket"; cloud pull replay |
| 26 | missed realtime event recovered | "a device that missed the live wake-up recovers it from its cursor" |
| 27 | multiple POS devices | "delivered to every POS of the right branch" (two POS), "two terminals pressing Accept at the same moment" |
| 28 | multiple QR tables | "a second code … many tables coexist", "numbers are per branch per day" |
| 29 | multiple branches | branch isolation tests |
| 30 | regeneration invalidates old token | "regenerating makes the old token dead" |
| 31 | download / print data correct | "print data holds what is printed on the card and no internal identifier" (PNG/PDF rendering is browser code, not covered) |
| 32 | customer refresh safe | attempt key tests (`qr_guest_cart`), refresh checked in the real browser |
| 33 | order status works | "kitchen progress reaches the customer through the canonical status" |
| 34 | payment verification safe | "online payment is not offered and cannot be forced" |
| 35 | rate limiting | "abuse resistance" (four tests) |
| 36 | authorization | "another restaurant cannot see, change or print this restaurant's code; a terminal that is not the admin console cannot manage codes" |
| 37 | tenant isolation | menu leakage test, admin isolation test, RLS on the new tables |
| 38 | audit logs | "every administrative action is in the audit log" |
| 39 | menu version changes propagate | "menu changes are reflected on the next request and the version follows publication" |
| 40 | offline / local sync behavior | `qr_order_desk` offline accept, `branch_core_chaos`, `pos_full_offline_sqlite` |

## Scenario tests

* **End to end (spec 60):** the cloud spec creates a restaurant, branches, plans, a table, a menu (Paneer Pizza, Cold Coffee), generates the code, opens it as an anonymous customer, orders, checks one order, the POS pull, the ticket, and the customer status through PREPARING → READY → COMPLETED. The same flow was run in a **real browser** against the real API on 2026-09-26 (guest page, cart with required/optional modifiers, server quote, order QR-1, POS cursor pull showing source QR, kitchen status updating the guest page live, refresh returning to the order status).
* **Negative (spec 61, 62):** plan without QR → page unavailable and direct POST 403; body `restaurantId` of another restaurant → 400.
* **Multi-restaurant (63), multi-branch (64):** two restaurants and two branches with the same table number and different menus.
* **Offline sync (65):** `qr_order_desk` (offline accept, claim sent later), `branch_core_chaos`, `pos_full_offline_sqlite`.

## Live browser fixture

`LIVE_FIXTURE=<file> npx vitest run test/_live_fixture.e2e.spec.ts` (from `cloud/api`) creates a QR-enabled restaurant in the test database and writes the QR address and device tokens to the file. Start the API (`node dist/cloud/api/src/main.js` with `DATABASE_URL` set to the test database) and `apps/qr-guest` (`npm run dev:qr-guest`), then open the address. It is skipped unless `LIVE_FIXTURE` is set.

## Not covered by an automated test

Restaurant Admin QR console and the POS inbox were type-checked but not driven in a browser; KDS screen rendering; PNG/PDF output; the customer app's visual layout beyond the manual run.
