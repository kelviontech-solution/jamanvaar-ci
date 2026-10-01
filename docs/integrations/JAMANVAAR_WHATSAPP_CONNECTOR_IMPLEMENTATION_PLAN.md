# Jamanvaar ↔ WhatsApp connector: implementation plan

Written 29 Sept 2026. This is the execution plan for [`WHATSAPP_ORDERING_PLAN_AND_PROMPT.md`](WHATSAPP_ORDERING_PLAN_AND_PROMPT.md) — read that first for *why* the architecture looks like this. This doc answers *where the code goes, in what order, and how each step gets proven correct before the next one starts*.

**One correction to the earlier design, found by actually reading the other repo (`product/whatsapp`) before writing this:** section 3 of the earlier plan assumed Jamanvaar's Restaurant Admin would collect the restaurant's raw Meta WhatsApp token and forward it to the chatbot service. That chatbot service already exists (`product/whatsapp`, "KelvionTech WhatsApp Business OS") and **already has its own restaurant onboarding and its own "Settings → WhatsApp Cloud API" screen** where an owner pastes their Meta token directly — that part is built, working, and must not be duplicated. The only genuinely missing piece is a way to say *"this WhatsApp-ordering restaurant and this Jamanvaar restaurant are the same business, and Jamanvaar owns the menu/price/order for it."* That is a much smaller thing than re-collecting a Meta token, and it is exactly your friend's original proposal: **Jamanvaar issues an API key; the owner pastes it into `product/whatsapp`'s dashboard.** Section 2 below reflects this corrected direction, not the earlier doc's section 3.

---

## 1. Where the code goes — no new repo

| Repo | Role | Why here, not a new service |
| --- | --- | --- |
| `product/kiosk` (this repo) | Owns the menu, price, tax, order, payment, POS, KDS. Exposes the "channel" contract. | Already has the exact pattern this needs — `cloud/api/src/modules/qr-ordering` and `order-sync` are an external-channel-to-POS/KDS pipeline today. Extending it is hours of work; standing up a third service to sit in between would duplicate auth, duplicate the order pipeline, and be one more thing to deploy, monitor and secure. |
| `product/whatsapp` | Owns the WhatsApp conversation, Meta credentials, and — for restaurants **not** on Jamanvaar — its own menu/order/POS/KDS. | It already is "the chatbot service" the earlier doc described. It already has per-restaurant Meta onboarding, a bot flow engine, payment gateways behind an interface (`services/payment/base.py`), and its own dashboard. Building a second chatbot elsewhere would mean maintaining two conversation engines forever. |
| A new repo | — | **Not needed.** There is no piece of this that isn't naturally owned by one of the two existing repos. Introducing a third service only makes sense if you later want an independent "integration hub" fronting *multiple* POS platforms (UrbanPiper is that, for aggregators) — not the case here, where there are exactly two systems talking to each other. |

Nothing about `Personal/whatsappweb` (the marketing site) changes as part of this plan.

---

## 2. The corrected connect flow

```
product/whatsapp                                   Jamanvaar (this repo)
  (restaurant already                                 (restaurant already
   onboarded, own Meta                                  exists in pos-admin)
   token already connected)

  Restaurant Admin (pos-admin)
  → Settings → Integrations → WhatsApp Ordering
  → [Generate API Key]  ───────────────────────────►  cloud/api creates a key,
                                                          shows it ONCE, stores
                                                          only a hash + prefix
        jmn_live_xxxxxxxxxxxxxxxxx
              │
              ▼
  product/whatsapp dashboard
  → Settings → Integrations → Jamanvaar
  → paste key → [Connect]  ─────────────────────────►  POST /api/v1/tenant/whatsapp-channel/validate-key
                                                          (Authorization: Bearer jmn_live_...)
                                                          validates hash, returns
                                                          { restaurantId, restaurantName,
                                                            branches[], permissions[] }
              ◄─────────────────────────────────────────
  stores fulfillment_mode = JAMANVAAR,
  jamanvaar_restaurant_id, key reference (never the
  raw key — only what's needed to call back with it)
```

This reuses a pattern already in this repo (`cloud/api/src/modules/activation-keys`) — key generation, hashing, prefix display, revoke — instead of inventing a new key-management subsystem.

---

## 3. Backend changes

### 3.1 `product/kiosk` — `cloud/api`

**New module** `cloud/api/src/modules/whatsapp-channel/` (shape modeled on `qr-ordering/`):

| File | Purpose |
| --- | --- |
| `whatsapp-channel.module.ts` | Wires the two controllers + service into Nest. |
| `whatsapp-channel.tenant.controller.ts` | Browser-facing, behind the existing device/owner auth (pos-admin login) — generate/revoke key, view connection status, settings (auto-accept, prep time, pause online orders). |
| `whatsapp-channel.service.controller.ts` | Service-to-service, behind a **new** `ServiceSignatureGuard` (HMAC, not a login) — `validate-key`, `menu`, `quote`, `checkout`, `orders/:id`. |
| `whatsapp-channel.service.ts` | Key generation/hashing/lookup, quote calculation (reuses the same price/tax logic the QR flow already uses), order creation (calls into `order-sync`, same path a QR order takes). |
| `dto/*.ts` | Request/response shapes — write these first (Phase 0), they're the contract both repos build against. |

**New guard** `cloud/api/src/common/guards/service-signature.guard.ts` — HMAC-SHA256 over method/path/timestamp/body, reject anything older than 5 minutes or already seen (replay cache). Write this once; it's reusable for the UrbanPiper aggregator work later, so don't special-case it to WhatsApp.

**Prisma schema** (`cloud/api/prisma/schema.prisma`):
- New model `WhatsAppChannelConnection` (`id`, `restaurantId` unique, `keyPrefix`, `keyHash`, `status`, `permissions Json`, `autoAccept Boolean`, `prepTimeMinutes`, `pausedAt`, `connectedAt`, `lastUsedAt`, `revokedAt`) — mirrors the shape your friend's research described, and the `key_hash`/`key_prefix`/`permissions` pattern already exists conceptually in `activation-keys`.
- `Order` model: add a `source` field (`OrderSource` enum: `KIOSK`, `QR`, `WHATSAPP`, `POS` — check the existing enum values before adding; don't invent a second field if `order_type` already partially serves this). This needs a real migration (`prisma migrate dev --name add_order_source`), reviewed before merge — this table has money on it, get a second pair of eyes on the migration specifically.

**Local device schema** (`packages/database/src/schema.ts`, the on-device SQLite `orders` table used by POS/kiosk apps): needs the equivalent `source`/channel column so a synced WhatsApp order is distinguishable on-device. **Flag, don't guess:** confirm the actual migration mechanism for this file with whoever owns `packages/database` before writing DDL — the file shows `CREATE TABLE IF NOT EXISTS`, which doesn't tell you how an *existing* installed device picks up a new column safely.

**Reused, not rebuilt:** Cashfree order creation/webhook/commission-split code from the recent payments work (`cae16b0`, `e051370`, `3a6d092`) — extend it to accept an order originating from `channels/checkout`, don't fork it.

### 3.2 `product/whatsapp` — `backend/app`

**New abstraction**, mirroring `services/payment/base.py`'s `PaymentGateway` ABC exactly — same shape, same team already understands it:

```
backend/app/services/fulfillment/
  base.py       FulfillmentSink(ABC): create_order(cart) -> OrderResult, get_order_status(id)
  local.py      LocalFulfillmentSink — wraps today's order_service.create_order_from_cart unchanged
  jamanvaar.py  JamanvaarFulfillmentSink — calls POST {JAMANVAAR}/api/v1/channels/checkout, signed

backend/app/services/catalog/
  base.py       CatalogProvider(ABC): get_menu(branch_id), get_availability()
  local.py      LocalCatalogProvider — today's Product/Category tables, unchanged
  jamanvaar.py  JamanvaarCatalogProvider — GET {JAMANVAAR}/api/v1/channels/menu, ETag-cached

backend/app/services/jamanvaar_client.py   HMAC signing helper + HTTP client, shared by both jamanvaar.py files
```

**`models/restaurant.py`**: add `fulfillment_mode` (`LOCAL` default | `JAMANVAAR`), `jamanvaar_restaurant_id`, `jamanvaar_connected_at`, a reference to the stored API key (never the raw key past the moment it's used to call `validate-key`). New Alembic revision.

**`generic_flow_engine.py`**: the only functional change — wherever it currently calls `order_service` or reads `Product`/`Category` directly, it goes through the tenant's selected `FulfillmentSink`/`CatalogProvider` instead. This is the one place real behavioral risk lives, because it's the file every existing standalone restaurant depends on today — see the Phase 0 verification gate below, which exists specifically to catch a regression here before any Jamanvaar-specific code is even written.

**New inbound webhook receivers** (`backend/app/api/v1/routers/jamanvaar_webhooks.py`): `POST /webhooks/jamanvaar/menu-published`, `POST /webhooks/jamanvaar/order-status` — signed, verified the same way the existing Meta webhook signature check works.

---

## 4. Frontend changes

### 4.1 `product/kiosk`

| App | Change |
| --- | --- |
| `apps/restaurant-system/pos-admin` | New panel under `components/settings/` — "WhatsApp Ordering": generate/revoke key (show once), connection status once `product/whatsapp` calls back, auto-accept/prep-time/pause toggles. `components/orders/` — a "WhatsApp" source badge + filter, same visual treatment QR orders already get. `components/kitchen/` if pos-admin surfaces a live kitchen view. |
| `apps/restaurant-system/kds` | `KdsTicketCard.tsx` — WhatsApp label, customer name/phone, delivery address when present. `kdsLogic.ts` — ticket identity derived from the order id the same way QR orders already are, so two KDS screens never fork one ticket (this rule already exists in the codebase; just confirm the new source doesn't bypass it). |
| `apps/restaurant-system/captain` | Only if dine-in-via-WhatsApp (table number) is in scope — otherwise untouched. Treat as a later phase, not MVP; flag explicitly if the pilot restaurant needs it. |
| `cloud/super-admin-web` | New dashboard row/section for WhatsApp-connected restaurants — mirrors the QR-ordering and payments dashboards that already exist (`622b4a2`, `db3c655`). Entitlement toggle (which plan includes WhatsApp ordering), same pattern as `application-entitlements` already does for QR. |

### 4.2 `product/whatsapp`

| Area | Change |
| --- | --- |
| `frontend/app/(dashboard)/restaurants/[id]/settings` (or a new `(dashboard)/integrations` route — pick one, don't split it across both) | New "Jamanvaar" panel: paste API key, [Connect], shows "Connected to <restaurant name>" with [Sync Menu Now], [Test Connection], [Disconnect] — same shape the earlier doc's section 12 sketched. |
| `frontend/app/(dashboard)/orders`, `live-chat`, `pos/[restaurantId]` | When `fulfillment_mode = JAMANVAAR`, show a banner that orders/POS/KDS now live in Jamanvaar, and decide (explicit product decision, not a default) whether to hide this restaurant's own `displays` (POS/KDS) pages entirely for that tenant, to avoid the two-dashboards problem flagged earlier. |

---

## 5. Suggested team split (so people aren't blocked on each other)

- **Dev A — kiosk backend**: §3.1, all of it. Owns the Prisma migration.
- **Dev B — kiosk frontend**: §4.1. Blocked on Dev A only for the DTO shapes (frozen at end of Phase 0), not on working endpoints — build against a mock until Phase 1 lands.
- **Dev C — whatsapp backend**: §3.2. Owns the Alembic migration. The `FulfillmentSink`/`CatalogProvider` refactor (Phase 0) has zero dependency on Dev A/B and can start immediately.
- **Dev D — whatsapp frontend**: §4.2. Same as Dev B — build against a mock `validate-key` response until Phase 2.

The one hard sync point every phase below assumes: **the DTOs in `cloud/api/.../whatsapp-channel/dto/*.ts` are the single source of truth for the contract.** If the shape needs to change mid-build, that's a conversation between Dev A and Dev C before either side edits code, not something discovered at integration time.

---

## 6. Phases, each gated by verification before the next starts

Every phase ends with **both** an automated check and, where there's a UI or a real request/response involved, a real browser/API run — not just "tests pass." This mirrors how `BUG_LIST_2.md` was actually produced in this repo (Playwright driving each persona against a real running stack), so use the same approach: the `run` skill to launch the app, drive it, and look at the result, not just reason about the code.

### Phase 0 — Contracts & scaffolding (no behavior change anywhere)
**Build:** Freeze the DTOs. `cloud/api`: Prisma model + migration, HMAC guard, empty controllers returning `501`. `product/whatsapp`: `FulfillmentSink`/`CatalogProvider` interfaces, `LocalFulfillmentSink`/`LocalCatalogProvider` wired in as pure passthroughs, `generic_flow_engine.py` refactored to call through them.
**Verify:**
- `npx vitest run` (kiosk root) and `pytest` (whatsapp backend) both green, no new failures.
- `tsc --noEmit` clean across kiosk apps; whatsapp's own type/lint check clean.
- Browser: launch `product/whatsapp` locally (`run` skill), place one full order as an existing standalone restaurant end to end — this must behave **identically** to before the refactor. This is the regression gate for the riskiest change in the whole plan (touching `generic_flow_engine.py`), and it happens before any new feature code exists.
- Browser: launch kiosk's `dev:all`, confirm POS/KDS/QR ordering is unaffected (new module isn't wired into anything yet, so this should be a no-op check).

### Phase 1 — Key issuance (kiosk side only, no order flow)
**Build:** `whatsapp-channel.tenant.controller.ts` (generate/revoke/status), pos-admin Settings UI.
**Verify:**
- Automated: unit tests for key hashing/prefix/revoke; RBAC test proving only Owner/Admin can generate a key and every other role is refused (write this test *because* B2-051 already proved this exact class of bug exists elsewhere in this repo — don't repeat it here).
- Browser (`run` skill, pos-admin): generate a key, confirm it's shown once and not retrievable again from any screen or API response; revoke it; confirm a revoked key fails validation.

### Phase 2 — Connect (whatsapp side calls validate-key)
**Build:** `validate-key` service endpoint (kiosk), Jamanvaar Integrations page + `jamanvaar_client.py` (whatsapp).
**Verify:**
- Automated: signed-request tests (valid signature accepted, replay rejected, expired timestamp rejected, wrong key rejected with a plain reason and nothing saved).
- Browser: paste a real key generated in Phase 1 into the whatsapp dashboard, confirm "Connected to <restaurant name>" appears with the right restaurant; disconnect; confirm a garbage key is rejected with a readable message, not a stack trace.

### Phase 3 — Menu pull (read-only)
**Build:** `GET channels/menu` (reuses `qr-menu.service.ts`'s live sold-out logic), `menu.published` outbound webhook, `JamanvaarCatalogProvider` wired in for connected tenants.
**Verify:**
- Automated: a dish marked sold-out in Jamanvaar must not appear in the channel-menu response; ETag/304 behavior tested.
- Browser: use `product/whatsapp`'s existing **Bot Preview** (`dry_run=True`) against a Jamanvaar-connected demo restaurant — confirm categories/dishes match pos-admin's real menu; mark a dish sold out in pos-admin, confirm Bot Preview reflects it without a redeploy; change a price in pos-admin, confirm it updates within the webhook/ETag refresh window.

### Phase 4 — Quote, checkout, payment, order creation (manual accept only)
**Build:** `POST channels/quote`, `POST channels/checkout` (Cashfree Option A, reuses existing split/commission code), order lands in pos-admin's pending desk with source `WHATSAPP`; `JamanvaarFulfillmentSink` wired in for real.
**Verify:**
- Automated: a tampered client-side total must never be trusted — write the test that proves it (send a quote total, then checkout with a different amount, confirm the server price wins); idempotency test (send the same checkout/webhook twice, confirm exactly one order and one payment).
- Browser, full path: Bot Preview or a real Meta test number → build a cart → pay via Cashfree sandbox → confirm the order appears in pos-admin's pending desk within ~2 seconds with a WhatsApp badge and correct customer info → accept it → confirm it appears on KDS as a ticket. This is the acceptance test the original plan doc names explicitly; treat it as non-negotiable before Phase 5.

### Phase 5 — Status back-channel, auto-accept, settings
**Build:** `order.status`/`order.confirmed` outbound webhooks, auto-accept/prep-time/pause-online-orders settings, whatsapp-side message templates.
**Verify:**
- Automated: every status transition (accepted → preparing → ready → completed/cancelled/refunded) produces exactly one outbound webhook call, retried on failure, never lost.
- Browser: mark an order through its full lifecycle on KDS, confirm the correct message reaches a real WhatsApp test chat (or the whatsapp side's message log if a live number isn't set up yet) at each step; toggle "Pause online orders" in pos-admin, confirm a new WhatsApp order attempt is politely refused.

### Phase 6 — Entitlement & Super Admin visibility
**Build:** plan-gated entitlement (mirrors QR-ordering's), super-admin-web dashboard section.
**Verify:**
- Automated: entitlement-off blocks the endpoints server-side, not just hides the UI button.
- Browser: downgrade a restaurant's plan in super-admin-web, confirm pos-admin's WhatsApp settings actually locks — and specifically re-check this doesn't repeat B2-055 (Restaurant Admin kept showing PRO features after a downgrade elsewhere in this repo).

### Phase 7 — Security hardening pass — ✅ **DONE 2026-10-01**
**Build:** rate limiting per key/customer number, replay-window tightening, PII retention policy, alerting on invalid/expired connections.
**Verify:** run the `security-review` or `code-review` skill against the full diff; specifically re-run the B2-029 (cross-tenant leak) and B2-051 (RBAC leak) scenarios against the *new* endpoints to confirm this surface doesn't reintroduce either.

**What shipped (detail and test evidence in `docs/PROGRESS_LOG.md`'s 2026-10-01 entry):**
- Rate limiting: `channels/menu|quote|orders/:id` are now capped per *restaurant* (90/min), not per IP — the global default throttler is IP-tracked, which is wrong for this surface specifically, since every connected restaurant's traffic arrives from `product/whatsapp`'s one shared backend server. `channels/checkout` adds its own tighter per-restaurant cap (20/min) plus a per-restaurant-*and*-customer-phone cap (5/10 min), so a bug or an abusive actor can't spam one customer's WhatsApp with repeat Cashfree payment links even while the restaurant's own overall budget has room left.
- Replay window tightened from 5 minutes to 2, identically on both verifiers (`ServiceSignatureGuard` on kiosk, `jamanvaar_signature.py` on `product/whatsapp`) so neither side starts rejecting the other's legitimately-timed requests.
- Alerting: a restaurant that **is** connected but whose entitlement just blocked a real, customer-facing channel call now raises a real, queryable `WHATSAPP_CONNECTION_LOCKED` platform notification (deduped to once/restaurant/day) — not a periodic scan, raised inline at the moment it happens, so the team can reach out before the restaurant notices lost orders. Deliberately does **not** live inside `ServiceSignatureGuard` itself: that guard has no database access at all in the common case by design, and alerting from the pre-auth layer would hand an attacker spraying forged signatures a way to force a database write per attempt.
- PII retention policy: **no narrow fix was made here, on purpose.** There is no retention or anonymization policy anywhere in this platform for any order channel's customer PII (POS, QR, Captain or WhatsApp) — confirmed by searching the whole `cloud/api` codebase, not inferred. `docs/SECURITY_AUDIT_2026-09-27.md`'s F-02 already flagged customer PII exposure as a platform-wide, pre-existing finding. Building a retention/anonymization job that only covered WhatsApp orders would single out the newest channel while leaving every other channel's identical data exactly as exposed, which is worse than doing nothing: it would look like the platform solved its PII retention problem when it solved roughly 0% of it. This needs a platform-wide decision (how long, anonymize vs. hard-delete, which fields) applied to the `Order` table across every `source`, not a per-channel patch — tracked as a follow-up, not attempted in this phase.
- Re-ran B2-029 (cross-tenant leak) against the new surface directly: two connected restaurants, each with a different menu item — `channels/menu` for one never lists the other's items; quoting one restaurant's cart with the other's `itemId` fails closed (400, not a cross-tenant price); an order can't be fetched by pairing its real id with the *wrong* restaurant's id (404). All three are new, real regression tests (`test/whatsapp-channel-security.e2e.spec.ts`), not just re-reasoned-through.

### Phase 8 — Pilot
**Build:** nothing new — this is rollout. Decide the fate of `product/whatsapp`'s own standalone POS/KDS pages for Jamanvaar-mode tenants (hide vs. keep) before pilot, not after.
**Verify:** one real restaurant, a real Meta number, a week of daily reconciliation (the existing reconciliation-exceptions feature, applied to WhatsApp-sourced orders too) before opening to more tenants.

---

## 7. What's still an open decision, not yet answered by this plan

- Whether Captain (dine-in-by-table via WhatsApp) is in scope for the pilot or a later phase.
- The exact fate of `product/whatsapp`'s standalone `displays` pages for Jamanvaar-connected tenants (§4.2, §8) — needs a product decision, not an engineering one.
- The local SQLite migration mechanism for `packages/database/src/schema.ts` (§3.1) — needs a five-minute conversation with whoever last touched that file before Phase 0's schema work starts.
