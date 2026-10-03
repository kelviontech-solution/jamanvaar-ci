# Progress log — WhatsApp connector track

## 2026-10-01 — Pre-pilot live audit (security, DB, browser) across Phases 0-8

User asked to test everything built so far "even with browser if you have to," ahead of
connecting a real restaurant with a real, already-live Meta WhatsApp number. Full pass
across both repos: DB migration integrity, live adversarial HTTP checks, and real
Playwright-driven browser sessions against all three frontends (pos-admin,
super-admin-web, product/whatsapp) -- the actual gap every earlier phase had explicitly
named and left open ("Playwright/chromium-cli isn't set up in this environment").
Installed it into an isolated scratchpad directory for this pass.

**Two real bugs found, both fixed and pushed, neither caught by any earlier test:**

1. **Deployment-blocking: alembic revision ID collisions in `product/whatsapp`.**
   `alembic current`/`alembic heads` warned "Revision ... is present more than once" for
   two IDs. All three Jamanvaar migrations (Phases 0/2/5) had reused revision ids AND a
   down_revision that already belonged to real, unrelated, pre-existing migrations
   (`add_user_setup_token_columns`, `add_display_devices`), and branched off a stale
   parent that already had a different real child. `dev.db` has no `alembic_version`
   table at all (bootstrapped from the ORM models, confirmed, not assumed) and already has
   the Jamanvaar columns from an earlier manual patch -- so this broken chain had never
   actually been exercised by a real `alembic upgrade`, anywhere, until this check.
   Deploying to a database with a real alembic history and running `upgrade head` would
   hit a non-deterministic collision where either migration's DDL could silently never
   run -- possibly the pre-existing, already-shipped one. Fixed by renumbering all three
   to fresh ids and re-anchoring the chain onto the real current head. Full detail: the
   commit itself in `product/whatsapp`.
2. **Super Admin's WhatsApp Ordering page was invisible and refused to every role,
   including Platform Owner.** Phase 6 added the route and nav entry but never registered
   it in `super-admin-web`'s separate `auth/access.ts` route-to-area table, which fails
   CLOSED on an unmapped route. Found only because this was the first time anyone (human
   or automated) actually clicked the link in a real browser -- every earlier check of
   this page was HTTP-level or `tsc --noEmit` only. Fixed with one line mirroring
   `/qr-ordering`'s own area.

**What else was checked live, all correct, zero bugs:** kiosk DB migration status (clean).
pos-admin's full real-browser flow -- owner login, device activation, Settings, Generate
Key, the real masked-key display, and the locked-entitlement state (Locked badge, correct
message, Disconnect still enabled, Generate Key correctly absent once already connected).
The full cross-repo connect, done for real: a key generated in one live browser session
(pos-admin) pasted into a second live browser session (`product/whatsapp`'s own restaurant
settings), producing a real signed service-to-service call between the two live dev
servers and a genuine "Connected to ... on Jamanvaar" result with the right restaurant id
and timestamp. The Phase 8 Orders-page banner and the kitchen-display 409 (confirmed by
reading full response/console logs after an initial test script gave it too little time
and looked stuck -- re-verified before concluding anything, not left as an open question).

**Process notes, both corrected before they caused harm:**
- Ran `pip install -r requirements.txt` against the global system Python instead of
  `product/whatsapp/backend`'s own `.venv`, downgrading packages shared with unrelated
  local projects (gevent, streamlit, langchain-community flagged conflicts immediately).
  Reverted all 8 affected packages to their exact prior versions before doing anything
  else; the repo's own `.venv` already had everything needed and was used for the rest.
- Found and fixed a pre-existing, unrelated bug while seeding live test data: Phase 5's
  `test/whatsapp-outbound-webhook.e2e.spec.ts` never deleted the restaurant it creates --
  ten real orphans had accumulated in the shared dev database and were breaking
  `backups-local.e2e.spec.ts`'s own stale-restaurant scan. Fixed the leak, removed the
  orphans, and fixed `feature-catalog-model.e2e.spec.ts`'s stale hardcoded catalog counts
  (Phase 6's real `whatsappOrdering` feature made the old numbers wrong, not the seed).

**Verification:** full regression both repos after every fix. `cloud/api`: 1005/1014
(7 pre-existing tenant-isolation.spec.ts RLS failures, unrelated). `product/whatsapp`
backend: 756/760 (4 pre-existing, already-self-documented datetime-comparison failures in
unrelated media-caching tests). All seeded audit data (restaurants, users, activation
keys, display devices, both databases) removed afterward; confirmed zero rows remain.

## 2026-10-01 — Phase 8 (pilot readiness)

Per the plan: "nothing new — this is rollout," except for one build item the plan itself
flags as blocking: deciding the fate of `product/whatsapp`'s standalone POS/KDS pages for
a Jamanvaar-connected restaurant. Investigated it properly rather than treating it as a
pure opinion call, and found a second, related gap along the way that also had to close
before a real pilot restaurant could safely connect.

**The standalone-pages decision.** Read the actual code instead of guessing: both
`product/whatsapp`'s unattended kitchen/POS tablet (`app/pos/[restaurantId]`, backed by
`GET /pos/{restaurant_id}/orders`) and its staff dashboard Orders page query that
platform's own `Order` table directly, with no awareness of `fulfillment_mode` at all.
The moment a restaurant connects, `JamanvaarFulfillmentSink` takes over checkout and that
table stops receiving new rows for it — an unattended tablet reading it would go silently
stale, kitchen staff watching a frozen or empty board while real orders exist only in
Jamanvaar's own KDS. That's not a judgment call between two equally valid UX options; a
restaurant pilot really would have broken this way. Decision: neither hide the pages nor
leave them unchanged — make them fail honest. `pos_list_orders` now returns 409 the
moment `fulfillment_mode == JAMANVAAR`, with a clear frontend message replacing the blank
board; the staff Orders page keeps its real historical pre-connection data but gains a
persistent banner. New backend test:
`test_pos_orders_refuses_once_the_restaurant_connects_to_jamanvaar`. The generic-engine
`Engagement`-based Orders view needed no change — confirmed by reading
`JamanvaarFulfillmentSink`'s own code that it still writes a local `Engagement` row
(correlated via `jamanvaar_payment_id`) even for a connected restaurant, so that view was
never actually going stale to begin with.

**A second, related gap found while verifying the plan's own Phase 8 "Verify" line**
("a week of daily reconciliation... applied to WhatsApp-sourced orders too"): kiosk's
existing `PaymentReconciliationService.reconcile()` calls Cashfree's
`/easy-split/orders/{id}/split` endpoint — Orders-API-specific — using
`PaymentTransaction.providerOrderId`. For a WhatsApp-channel payment, that column holds a
Cashfree Payment *Link* id (`createCashfreeLinkAttempt`'s `wapay_...`), not a real
Cashfree order id; calling that endpoint with it would simply throw and be swallowed by
the job's own per-payment `catch`-and-log. In other words: as built, every WhatsApp order's
payment would have silently never been reconciled at all, for the entire pilot — the exact
check the plan calls for would have run daily and found nothing, forever, with no error
visible anywhere. Fixed with a dedicated `reconcileLinkPayment` path (branches on
`Order.source === 'WHATSAPP'`): checks the link actually reached Cashfree's `PAID` status
and that `amountPaid` (rupees, converted to paise with a ₹1 rounding tolerance) matches,
reusing the existing `UNEXPECTED_STATUS`/`AMOUNT_MISMATCH` exception types rather than
adding a new enum value. Deliberately narrower than the Orders-API check: Cashfree's
Payment Link detail response doesn't expose a parsed per-vendor split-settlement status
the way the Easy Split endpoint does, so the vendor-split settlement side of a WhatsApp
order's commission isn't independently reconciled yet — flagged, not silently assumed
fine. 3 new tests in `payment-reconciliation.e2e.spec.ts` (9 total, up from 6).

**Verification:** `tsc --noEmit` clean on `cloud/api`; the whatsapp frontend's own
`tsc --noEmit` also clean. `product/whatsapp`'s full backend suite: 756/760 passing, the 4
failures a pre-existing, already-self-documented naive/aware-datetime bug in unrelated
media-caching tests ("Same aware-column-vs-naive-cutoff bug as _media_message above," per
that code's own comment) — confirmed unrelated before moving on, not assumed. Full
`cloud/api` regression suite re-run after this phase's changes — see the run recorded
alongside this entry.

**What's left before a real pilot, and why none of it is something I can do from here:**
onboarding one real restaurant and obtaining a real Meta WhatsApp Business API number are
business actions, not engineering ones — this phase made the two things that needed fixing
before that happened safe to happen, not the rollout itself.

## 2026-10-01 — Phase 7 (security hardening pass)

Per the plan's own four build items: rate limiting per key/customer number, replay-window
tightening, a PII retention policy decision, and alerting on invalid/expired connections.
Verification step per the plan: re-run B2-029 (cross-tenant leak) and B2-051 (RBAC leak)
against the new endpoints specifically.

**Rate limiting.** The existing global `ThrottlerModule` default (120/min) is tracked per
IP — correct everywhere else in this app, wrong here specifically: every connected
restaurant's traffic for `channels/menu|quote|checkout|orders/:id` arrives from
`product/whatsapp`'s one shared backend server, so an IP-keyed limit is really "every
restaurant on the connector, combined" — one restaurant's bug or a single abusive actor
could starve every other restaurant's requests. Added four named throttlers
(`whatsappSvc`, `whatsappCheckout`, `whatsappCheckoutPerCustomer`, `whatsappValidateKey`)
to `app.module.ts`, each registered with a deliberately enormous module-level default limit
(1,000,000/min) and only overridden down to the real, tight limit via each specific route's
own `@Throttle({name: {limit, ttl, getTracker}})` in
`whatsapp-channel.service.controller.ts`. That inversion matters and was caught before
shipping, not after: `@nestjs/throttler`'s global `ThrottlerGuard` (the app's single
`APP_GUARD`) checks **every** registered named throttler against **every** route in the
whole app unless that specific route overrides it — registering the real tight limit at
the module level first (my first draft) would have rate-limited every other endpoint in
the entire platform to the same tiny per-IP budget. `channels/menu|quote|orders/:id` are
now capped per-restaurant at 90/min; `channels/checkout` adds its own tighter 20/min
per-restaurant cap plus a 5-per-10-min cap keyed on restaurant+customer-phone specifically,
so a bug or an abusive actor can't spam one real customer's WhatsApp with repeat Cashfree
payment links even while the restaurant's overall budget has room left; `validate-key` (no
restaurantId yet — that's what it resolves) keeps per-IP tracking with its own 30/min cap.

**Replay window tightened from 5 minutes to 2**, identically on both verifiers
(`ServiceSignatureGuard` on kiosk, `jamanvaar_signature.py` on `product/whatsapp`) so
neither side starts rejecting the other's legitimately-timed requests — still generous for
two NTP-synced cloud servers, but a meaningfully smaller window for a captured signature to
be replayed in. Checked both test suites for any timestamp assumption closer than 2 minutes
first; none existed (the one stale-timestamp test on each side uses a 10-minute offset).

**Alerting on invalid/expired connections.** New `WHATSAPP_CONNECTION_LOCKED` platform
notification type (`platform-notifications.service.ts`), fired from
`WhatsAppChannelService.requireConnected()` the moment a real, customer-facing channel call
is refused because a restaurant that **is** `CONNECTED` just lost its `WHATSAPP_ORDERING`
entitlement — not a restaurant that was never connected (that's just an unconfigured
integration, not a regression). Unlike every other notification type in this service, it
isn't found by `scanAndNotify()`'s periodic scan; it's raised inline, at the exact moment a
real order would otherwise have silently failed, deduped to once per restaurant per day.
Deliberately **not** placed inside `ServiceSignatureGuard` itself: that guard has no
database access at all in the common case, by design, specifically so a forged signature is
rejected before any query runs — adding a notification write there would hand an attacker
spraying forged signatures a way to turn each attempt into a database write.

**PII retention policy — no narrow fix, on purpose.** Searched the whole `cloud/api`
codebase first rather than assuming: there is no retention or anonymization policy anywhere
in this platform for any order channel's customer PII (POS, QR, Captain or WhatsApp) — only
`Backup` (30 days) and `PlatformNotification` (90 days) have purge jobs at all.
`docs/SECURITY_AUDIT_2026-09-27.md`'s F-02 already flagged customer PII exposure as a
platform-wide, pre-existing finding, not something this feature introduced. Building a
retention/anonymization job that covered only WhatsApp orders would single out the newest
channel while leaving every other channel's identical `Order.customerName`/`customerPhone`
exposure untouched — that's worse than doing nothing, because it would look solved when
roughly 0% of it is. This is a platform-wide product decision (how long, anonymize vs.
hard-delete, which fields, applied to `Order` across every `source`), tracked as a
dedicated follow-up rather than attempted piecemeal here.

**B2-029 re-run against the new surface** (`test/whatsapp-channel-security.e2e.spec.ts`,
new file, 4 tests): two connected restaurants, each with a different published menu item —
`channels/menu` for one never lists the other's item; quoting one restaurant's cart with
the other's `itemId` fails closed (400 from `priceCart`, not a cross-tenant price); an order
created for restaurant A can't be fetched by pairing its real id with restaurant B's id
(404) and can with its own (200). Also extended the existing Phase 6 downgrade test
(`whatsapp-channel-entitlement.e2e.spec.ts`) to assert the new `WHATSAPP_CONNECTION_LOCKED`
alert actually lands in the real database, not just that the 403 is returned.

**Two more real bugs found by the full-suite run specifically** (neither caused by this
phase's own code, both surfaced by actually running the whole suite rather than trusting
the WhatsApp-specific files in isolation):
1. `test/feature-catalog-model.e2e.spec.ts`'s "every legacy key and AppCode represented
   exactly once" test hardcoded the pre-WhatsApp counts (21 legacy keys, 7 AppCodes) against
   the live, shared Feature catalog — stale the moment Phase 6's real `whatsappOrdering`
   feature (its own real, intentional `legacyEntitlementKey`, the same mechanism
   `qrTableOrdering` already uses for the identical pilot-stage-flag-gating reason) landed in
   the seed. Updated the two hardcoded expectations (21→22, AppCode set +`WHATSAPP_ORDERING`)
   rather than the seed — the seed is correct, the test's snapshot of it was just out of date.
2. `test/whatsapp-outbound-webhook.e2e.spec.ts` (Phase 5) creates a real `Restaurant` row
   directly via Prisma but its `afterAll` never deleted it — ten real, `ACTIVE` orphans had
   accumulated in the shared dev database (one per run of that file across this session,
   including re-runs during today's own verification), each with no branch, no owner, nothing.
   `test/backups-local.e2e.spec.ts`'s own `snapshotStaleRestaurants()` test (BUG-072, which
   genuinely scans every `ACTIVE` restaurant platform-wide, by design) failed because 10 of
   those scans hit one of these empty husks and errored. Fixed the leak (`afterAll` now
   deletes the restaurant; `OutboundWebhookDelivery`'s `onDelete: Cascade` handles the rest),
   and deleted the 10 existing orphans directly from the dev database.

**Unrelated environment note, corrected before it caused any damage:** while chasing #2
above, ran `pip install -r requirements.txt` against the global system Python in
`product/whatsapp/backend` instead of that repo's own `.venv` — it silently downgraded
several packages (`pillow`, `greenlet`, `bcrypt`, `cryptography`, `cachetools`, `reportlab`,
`email-validator`, `alembic`) that other, unrelated local projects on this machine also
depend on (`gevent`, `streamlit`, `langchain-community` all immediately flagged version
conflicts). Reverted all eight to their exact prior versions before doing anything else, then
re-ran the actual check through the repo's own `.venv` (which already had everything needed).
No code was affected either way — this was a local pip environment, not the repo — but it's
recorded here because it was a real, if caught-in-time, mistake, not because it changed any
deliverable.

**Verification:** `tsc --noEmit` clean on `cloud/api`. Full regression suite re-run after
these changes (rate limiting is a global `APP_GUARD`, so every other module's tests are the
real check that nothing else got throttled by accident, not just the WhatsApp-specific
files): 1001/1011 passing. All 8 remaining failures are pre-existing and unrelated to this
phase: 7 are the same long-documented `tenant-isolation.spec.ts` RLS/BYPASSRLS pattern this
log has tracked since before this connector existed, and the 8th
(`branch-core-uplink.e2e.spec.ts`) is a polling-timeout flake that only reproduces under the
full suite's heavier concurrent load, already independently flagged as pre-existing in
`BUG_LIST_2.md`'s B2-052 entry ("one `branch-core-uplink` test that didn't reproduce in
isolation") during completely unrelated work — not something this phase introduced.
`product/whatsapp`'s own
`test_jamanvaar_connector.py`/`test_jamanvaar_webhooks.py`/`test_jamanvaar_catalog_switch.py`
(21 tests, run through that repo's own `.venv`) all pass unchanged after the replay-window
tightening. All WhatsApp-specific files pass: 42 + 6 + 4 = 52 tests across the six
pre-existing files, plus 4 new ones in `whatsapp-channel-security.e2e.spec.ts`.

## 2026-09-30 — Phase 6 (entitlement & Super Admin visibility)

Per the plan's own scope: a real, plan-checked `WHATSAPP_ORDERING` entitlement gating every
endpoint server-side (not just a UI affordance), plus Super Admin visibility into who's
actually connected. Mirrors QR ordering's own entitlement treatment closely enough that
anyone who already knows that pattern recognises this one.

**New `WHATSAPP_ORDERING` AppCode** (migration `20260930164153_whatsapp_ordering_app_code`,
additive enum value): added everywhere `QR_ORDERING` already appears as a literal union
across kiosk (`application-entitlements.service.ts`, its DTO, `features/dto/feature.dto.ts`,
`subscriptions/dto/subscription.dto.ts`, `prisma/seed.ts`) and `super-admin-web/src/api/types.ts`.
New Feature/FeatureCategory catalog row (`whatsappOrdering`, category `whatsapp_ordering`),
seeded directly rather than via the full `prisma/seed.ts` script (avoided touching unrelated
demo data by writing a small standalone upsert script instead). Deliberately **not** granted
by either seeded plan's own tier defaults (pilot-stage, per the plan doc's Phase 8 — a
restaurant gets it via an explicit per-subscription override until the pilot graduates to a
normal plan inclusion), following the exact same "granted only by the plan's own feature
flag, never by a tier's name" design QR ordering already established
(`appsForPlan()`'s own filter, extended to also strip `WHATSAPP_ORDERING`).

**Real bug found and fixed, pre-existing and already affecting `QR_ORDERING` too, not
something this phase introduced**: `ApplicationEntitlementsService.update()`'s
device-impact-warning check and `assertDeviceQuotaAvailable()` both cast an `AppCode`
straight into a `DeviceType`-typed Prisma query (`type: appCode as unknown as DeviceType`)
— but neither `QR_ORDERING` nor the new `WHATSAPP_ORDERING` has a real `DeviceType` (a QR
guest's browser or a WhatsApp customer's chat is never an activated `Device` row). Confirmed
live against the real Prisma client (not just inferred): this throws
`PrismaClientValidationError: Invalid value for argument type. Expected DeviceType.` —
an unhandled 500 instead of the intended "0 devices affected" answer, every time a Super
Admin tries to disable either entitlement via the real toggle endpoint
(`PATCH /api/v1/subscriptions/:id/applications/:appCode`). Fixed with a new
`DEVICE_BACKED_APP_CODES` set, checked before either cast. Directly tested against the real
endpoint in the new entitlement test file (below), not just inferred from a live REPL
session — proves both the crash is real (pre-fix, reproduced) and the fix works (post-fix,
clean 200).

**`WhatsAppChannelService`**: `requireConnected` now re-checks the entitlement on every call
(not just at connect time) — a plan downgrade must lock an already-connected restaurant out
immediately, the exact B2-055 regression class QR ordering's own entitlement already guards
against. `requireOrderable` refactored to call `requireConnected` first (was a parallel,
duplicated connection-status check) rather than re-implementing the same lookup. New
`entitlement()` (read-only, for pos-admin's panel) and `requireEntitled()` (throws the same
`{statusCode: 403, code: 'ENTITLEMENT_REQUIRED', feature, reason, message}` shape QR's own
`requireEnabled` throws) gate `generateKey`, `updateSettings` and `validateKey` directly —
`revokeKey` is deliberately left ungated, matching QR's own "turning something off is never
blocked by a lock" precedent. New `GET /api/v1/tenant/whatsapp-channel/entitlement` route.

**Test-file fallout, expected and mechanical**: every existing WhatsApp test file now needs
an explicit `applications: [...]` on its subscription-creation call including
`'WHATSAPP_ORDERING'` (previously these subscriptions relied on `RESTAURANT:PRO`'s tier
defaults, which never included it) — fixed across `whatsapp-channel.e2e.spec.ts` (which
previously created no subscription at all — added one), `whatsapp-channel-menu.e2e.spec.ts`,
`whatsapp-channel-payments.e2e.spec.ts`, `whatsapp-channel-outbound-hooks.e2e.spec.ts`.

**A second real, if narrow, bug found by the full-suite run specifically (not the isolated
one)**: `whatsapp-outbound-webhook.e2e.spec.ts` and `whatsapp-channel-outbound-hooks.e2e.spec.ts`'s
shared `waitUntil()` polling helper accepted *any* truthy row as "done," including one still
`PENDING` — `enqueue()`'s delivery row is created synchronously before its fire-and-forget
delivery attempt actually runs, and under the full suite's heavier load (vs. running the file
alone) the first poll tick can catch that still-`PENDING` row and return prematurely instead
of waiting for it to actually resolve. Fixed both predicates to require
`status !== 'PENDING'`. A real lesson for this codebase's own testing discipline, not just
this session: a polling helper's predicate must describe the actual terminal condition, not
just "the row exists" — worth relearning it caught something that only reproduces under
full-suite load, not in isolation.

New `test/whatsapp-channel-entitlement.e2e.spec.ts` (6 tests): no subscription at all,
plan doesn't include it, `entitlement()`'s locked-message shape, the fully-entitled happy
path (generate key → settings → validate-key connects), the Super Admin disable-after-connect
sequence against the real toggle endpoint (proving the DEVICE_BACKED_APP_CODES fix
directly), and checkout/quote refused once disabled even for an already-connected
restaurant. Full `cloud/api` suite re-run: 996 passed, only the same pre-existing,
already-tracked RLS/superuser failures remain.

**`product/kiosk`'s own frontends**:
- `pos-admin`'s `WhatsAppChannelPanel.tsx`: fetches `entitlement()` alongside `status()`,
  shows a "Locked" badge + explanatory banner (using the server's own `lockedMessage`, not a
  second copy of the wording) and disables Generate Key / Save Settings while locked —
  Disconnect stays enabled, matching the backend's own "turning off is never blocked"
  choice. New `fetchWhatsAppChannelEntitlement()` in `cloudClient.ts`.
- `super-admin-web`: new, deliberately smaller-than-QR `WhatsAppOrderingPage.tsx`
  (`/whatsapp-ordering`, nav entry under "SaaS Management") — new backend module
  `whatsapp-ordering-admin` (`GET /api/v1/whatsapp-ordering/restaurants|metrics`,
  `PlatformAuthGuard`-protected). Deliberately lists only restaurants with a real
  `WhatsAppChannelConnection` row (not every restaurant on the platform, unlike QR's own
  listing) — this connector is pilot-stage and the useful question is narrower: who's
  actually connected and is it healthy, not "which of everyone could be." Entitlement
  *toggling* deliberately reuses the existing generic Applications tab rather than a
  parallel WhatsApp-specific override endpoint — `WHATSAPP_ORDERING` is an ordinary AppCode
  now, not a special case needing its own mutation surface. New
  `test/whatsapp-ordering-admin.e2e.spec.ts` (4 tests): auth required, lists a real connected
  restaurant with real data (not a static shape), never lists an unconnected restaurant,
  metrics reflect real counts.

**Live-verified against the actually-running dev servers, not just vitest's in-memory
app**: restarted all three (`cloud-api`, `pos-admin`, `super-admin-web` — one was a stale
pre-Phase-6 process). Seeded one real restaurant + owner + `WHATSAPP_ORDERING`-entitled
subscription directly via Prisma, logged in through the real `/tenant-auth/login` endpoint
(a real JWT, not a test double), confirmed `entitlement`/`generate-key` both work normally
while entitled — then flipped the entitlement row off directly (simulating the Super Admin
toggle) and re-hit the *same* live endpoints with *no server restart*: `entitlement` flipped
to locked with the real `lockedMessage` text pos-admin would render, and `settings` update
was refused with the real `403 ENTITLEMENT_REQUIRED` body. Playwright/chromium-cli wasn't
set up in this environment (confirmed, not assumed — neither `which chromium-cli` nor an
existing project skill for it were found), so this proves the actual deployed wiring
end-to-end at the HTTP level — the same calls pos-admin's React component makes — rather
than a full pixel-rendered browser click-through. Said plainly rather than silently
substituting one for the other: if a rendering-only bug exists (a JSX typo, a class name
mismatch), this check would not catch it, though `tsc --noEmit` passing cleanly on both
frontends makes that a low-probability gap. Throwaway restaurant/plan/subscription deleted
afterward.

## 2026-09-30 — Phase 5 (status back-channel, order.confirmed/order.status webhooks)

Closes the gap Phase 4's own report flagged as deliberately left open: nothing told
product/whatsapp a Jamanvaar order got paid, or later moved through the kitchen, so a
customer got no automatic WhatsApp updates after confirming their order. Per the plan
doc's Phase 5 scope: outbound `order.confirmed`/`order.status` webhooks, reusing the
already-built auto-accept/prep-time/pause settings unchanged.

**Kiosk side — new `OutboundWebhookDelivery` table + `WhatsAppOutboundWebhookService`
(`src/modules/whatsapp-outbound/`, a new standalone module deliberately kept dependency-free
besides Prisma — both `PaymentsModule` and `OrderSyncModule` need to inject it, and
`WhatsAppChannelModule` already imports `PaymentsModule`, so putting it there would create
a cycle):**
- The outbound mirror of `WebhookEvent` (which records the *inbound* half, Cashfree calling
  us) and of `ServiceSignatureGuard` (which verifies product/whatsapp's calls *into* kiosk).
  A row is written durably *before* the first delivery attempt, so "retried on failure,
  never lost" (the plan's own requirement) holds even across a process crash mid-delivery.
- `enqueue()` writes the row then fires one immediate best-effort attempt (fire-and-forget —
  never blocks the caller, a payment-webhook handler or an order-sync push, on an external
  HTTP call). A dedicated 20-second in-process interval retries anything still `PENDING`
  past its backoff (`5s * 2^attempts`, capped at 10 minutes, `MAX_ATTEMPTS = 8` before a row
  is marked `FAILED` and stops auto-retrying); also registered with the existing
  `JobsService`'s slower 15-minute sweep as a last-resort safety net if that faster interval
  ever dies — redundant by design, and harmless since `attempt()` re-checks status before
  ever sending (a `PENDING`-only row, so a race between the two is a no-op, not a double
  send).
- Signs with the exact same scheme `ServiceSignatureGuard` verifies, just the sending side
  this time: `HMAC-SHA256(secret, METHOD\nPATH\nTIMESTAMP\nSHA256(BODY))`, `X-Signature`/
  `X-Timestamp` headers, the same shared `JAMANVAAR_SERVICE_SECRET`. New env var
  `WHATSAPP_CONNECTOR_BASE_URL` (product/whatsapp's own base URL, kiosk calling INTO it —
  added to `.env.example` with the usual "leave empty and it fails closed" framing).
- **Real bug found and fixed by the service's own new test**: the success-delivery path
  never incremented `attempts`, leaving a misleading `attempts: 0` on a `DELIVERED` row —
  fixed to increment on both outcomes; `attempts` now genuinely means "how many times this
  was tried," not "how many times it failed."
- `PaymentsService.ingestWhatsAppOrderIfNeeded` enqueues `order.confirmed` once (only on a
  genuinely fresh ingestion, matching `ingestServerOrder`'s own duplicate-dedup rule) with
  `{ paymentId, orderId, publicOrderId, status }`. `paymentId` (the `PaymentTransaction.id`
  already returned in `channels/checkout`'s response, and already stashed by
  `JamanvaarFulfillmentSink` on `Engagement.gateway_metadata.jamanvaar_payment_id`) is the
  correlator — deliberately reused rather than inventing a new field, since product/whatsapp
  already has it from checkout time.
- `OrderSyncService.pushEvents` collects a WhatsApp-sourced order's status changes during
  its transaction (only for an *existing* order whose `status` actually changed, source ==
  `'WHATSAPP'`, correlator read back from `meta.paymentTransactionId` — already stored there
  at ingestion time for the existing payment-violation guard rail) and enqueues
  `order.status` *after* the transaction commits — same "wake the branch only after commit"
  discipline this method's own `realtime.publish` already follows.
- Both hook points isolate the enqueue call in its own try/catch: the KDS-side write (the
  part that actually matters) has already committed by that point, so a failure to enqueue
  must never be reported back as a failure of the webhook/push request whose real job is
  done. `enqueue()` itself durably records and retries on its own regardless.
- New `test/whatsapp-outbound-webhook.e2e.spec.ts` (5 tests) proves the service itself
  against a **real local HTTP server** (not a mocked `fetch`) — signs a real request, the
  test's own receiver recomputes the HMAC independently and asserts it matches, proving wire
  compatibility rather than just "fetch was called." Covers success, a non-2xx response
  leaving the row retryable, `retryDue()` redelivering once backoff elapses, exhaustion to
  `FAILED`, and never re-attempting a non-`PENDING` row.
- New `test/whatsapp-channel-outbound-hooks.e2e.spec.ts` (5 tests) proves both hook points
  fire (or correctly don't) against the same kind of real local receiver: a paid WhatsApp
  order fires a real signed `order.confirmed`; a redelivered payment webhook does not fire a
  second one; a POS device moving the order to `PREPARING` fires a real signed
  `order.status` with the correct `previousStatus`; re-pushing the same status doesn't
  refire; a POS-*sourced* (non-WhatsApp) order's status changes never fire anything.
- Full `cloud/api` suite re-run: 987 passed, only the same pre-existing, already-tracked
  RLS/superuser failures remain.

**`product/whatsapp` side — `jamanvaar_webhooks.py` (the reverse direction of
`jamanvaar_client.py`, which calls INTO kiosk):**
- `Engagement` gains `jamanvaar_payment_id` (indexed, additive migration
  `c3d4e5f6a7b8` — alembic history already has two heads from earlier drift, not this
  phase's problem to fix; chained off the Jamanvaar-specific branch like the two before it).
  Populated by `JamanvaarFulfillmentSink.create_engagement` from `result["paymentId"]` — the
  same correlator kiosk's `order.confirmed`/`order.status` payloads carry, so no new field
  needed on either side beyond this one column.
- `app/core/jamanvaar_signature.py`: `verify_jamanvaar_signature`, a FastAPI dependency that
  is the verifying mirror of kiosk's `ServiceSignatureGuard` — identical scheme, identical
  failure modes (unconfigured secret, malformed/missing signature, stale timestamp >5min,
  exact-signature replay), same shared secret read from `settings.JAMANVAAR_SERVICE_SECRET`.
- `app/api/v1/routers/jamanvaar_webhooks.py`: `POST /api/v1/webhooks/jamanvaar/order-event`.
  Mirrors `generic_payments.py`'s Razorpay webhook receiver closely — row-lock the
  `Engagement` (`SELECT ... FOR UPDATE`) for the rest of the transaction so a redelivered/
  concurrent event can't double-send a message, idempotent per-event handling, and reuses
  the *exact* `status_labels`/`send_generic_message` machinery `engagements.py`'s own
  staff-driven PATCH status-update endpoint already uses — a Jamanvaar-driven status change
  reads to the customer exactly like a staff-driven one would, not a parallel invented
  format.
  - Kiosk's richer KDS status vocabulary (`NEW`/`PREPARING`/`READY`/`COMPLETED`/`CANCELLED`/
    `VOID`/`VOIDED`/`REFUNDED`) is mapped onto this platform's own small, generic
    `EngagementStatus` set (`NEW`/`CONFIRMED`/`IN_PROGRESS`/`COMPLETED`/`CANCELLED`) —
    deliberately the *same* `NEW -> CONFIRMED -> IN_PROGRESS -> COMPLETED` sequence
    `engagements.py`'s own `_LEGAL_TRANSITIONS` graph already uses, so a Jamanvaar-driven
    engagement is indistinguishable from a staff-driven one to anything reading
    `engagement.status` afterward. `_KIOSK_STATUS_MESSAGE` gives a few statuses (especially
    the terminal ones) their own specific customer copy; anything else falls back to the
    existing generic `status_labels`-aware line.
  - `order.confirmed` flips `payment_status` to `"paid"` (idempotent — a redelivery for an
    already-paid engagement is a safe no-op, never a second "payment received" message) and
    sends "✅ Payment received! ... sent to the kitchen."
- New `app/tests/test_jamanvaar_webhooks.py` (11 tests): signature verification (wrong
  secret, stale timestamp, exact-signature replay), `order.confirmed`'s payment_status flip
  + status mapping + duplicate-delivery idempotency, `order.status`'s status mapping +
  specific messages (`READY`, `CANCELLED`) + no-resend-on-unchanged-status + an unmapped
  future kiosk status being ignored safely rather than crashing, and an unknown `paymentId`
  being ignored rather than crashing. Full `app/tests/` suite re-run: 759 passed (748 + 11
  new), no regressions.

**Live-verified end to end, real cross-language signing, zero manual signing on either
side**: restarted both dev servers fresh (both were running stale, pre-Phase-5 code — one
had a duplicate/zombie `uvicorn` process on product/whatsapp's side too, killed both and
started one clean). Seeded one real `Engagement` on product/whatsapp's live `dev.db`
(`jamanvaar_payment_id` set) via the app's own ORM, then inserted one real `PENDING`
`OutboundWebhookDelivery` row directly into kiosk's live Postgres — no script signed
anything by hand this time. The **live running `cloud-api`'s own 20-second retry interval**
picked the row up on its own, computed a real HMAC signature in TypeScript, and POSTed it to
product/whatsapp's real running server; that server's Python `hmac` verification accepted it
on the first try, looked up the `Engagement` by `jamanvaar_payment_id`, and flipped
`payment_status` to `"paid"` with the correct `gateway_metadata` — confirmed by reading
`dev.db` directly afterward. This is the first real proof that the two independent HMAC
implementations (TypeScript signing, Python verifying) actually interoperate for this new,
reversed direction — the exact risk class that produced real bugs in Phase 3 (query-string
signing) and Phase 4 (the fabricated checkout-URL bug) — and this time it worked on the
first live attempt, no fix needed. Throwaway restaurants/engagements/delivery rows deleted
from both databases afterward.

**What Phase 5 does NOT do**: retry a `FAILED` (attempts-exhausted) delivery automatically —
that needs a human to notice and requeue it (no admin UI built for this yet, `OutboundWebhookDelivery`
rows are queryable directly for now). Also does not yet cover every possible kiosk status
(`SOME_FUTURE_STATUS`-shaped values are safely ignored, not crashed on, per
`test_order_status_unmapped_kiosk_status_is_ignored` — but a genuinely new kiosk-side status
added later would need a corresponding `_STATUS_MAP`/`_KIOSK_STATUS_MESSAGE` entry on this
side to actually reach the customer).

## 2026-09-30 — Phase 4b: real Cashfree sandbox testing found and fixed a real bug in Phase 4

After Phase 4 shipped (below) with full mocked test coverage, the user set up a real Cashfree
sandbox merchant account (test-mode keys, zero real money — see that product's own docs) so
the connector could be verified against Cashfree for real instead of only via mocks. This
caught something the mocked tests structurally could not: **`hostedCheckoutUrl()` — the
function that built the "payment link" the WhatsApp bot sends — was a fabricated URL
pattern that doesn't exist.** Cashfree's Orders API (`createOrder`/`payment_session_id`,
what kiosk's own device flow correctly uses) has no plain, pasteable checkout URL at all;
their real hosted checkout only opens via a JS SDK call (`cashfree.checkout({paymentSessionId})`)
running on a real webpage. A mocked `createOrder` call can never catch a wrong *downstream
URL format* built from its result — the mock returns whatever the test told it to, and the
test asserted against that same invented pattern. Only opening the real link in a real
browser surfaced it (a real Cashfree "Oops! Well, this is embarrassing" error page) —
confirmed via Cashfree's own docs (fetched live, not assumed) once the live failure pointed
at it: `www.cashfree.com/docs/docs/web-integration-create-order`.

**The fix — switched to Cashfree's Payment Links product** (`POST /links`), which does
return a real, plain, shareable `link_url`, and which Cashfree explicitly documents for
this exact WhatsApp use case (`payments/no-code/whatsapp-payment-links`). Confirmed via
`payments/latest/payment-links/webhooks` and the general PG webhook-signature docs that its
webhook uses the identical `x-webhook-signature`/`x-webhook-timestamp` HMAC-SHA256 scheme
already implemented, just a different, previously-unhandled event type (`PAYMENT_LINK_EVENT`)
with fields (`link_id`/`cf_link_id`/`link_status`) directly under `data`, not nested under
`data.order`/`data.payment` the way Orders' webhook is.

- `CashfreeGatewayService`: `hostedCheckoutUrl()` removed entirely (it was simply wrong, not
  salvageable); added `createPaymentLink()` and `getPaymentLinkDetails()` (the read-side
  counterpart — a manual reconcile path independent of the webhook, useful for exactly the
  no-tunnel local-testing situation this was built and verified under).
- `PaymentsService`: `createChannelOrder` now calls a new `createCashfreeLinkAttempt` instead
  of the Orders-based `createCashfreeAttempt` (kiosk's own device flow keeps using the
  latter, completely unchanged — a kiosk screen can run the JS SDK, so Orders was always the
  right product there). `providerOrderId` holds Cashfree's `link_id` for these rows — same
  column, same `@@unique([provider, providerOrderId])` index Orders-based lookups already
  use, deliberately reused rather than adding a schema migration for a second identifier
  column. `commissionSplitFor()` factored out of `createCashfreeAttempt` so both Cashfree
  products compute platform commission identically.
- `processCashfreeWebhook`: a new `handlePaymentLinkWebhook` branch, parallel to the existing
  `handleRefundWebhook` (deliberately not unified into one generic parser — the two payload
  shapes are different enough that one function covering both would be harder to read).
  **A second real bug, this one caught by the test suite, not live**: the `providerOrderId`
  extraction used a blind `?? ` fallback chain across all three payload shapes
  (`data.order.order_id ?? data.refund.order_id ?? data.link_id`) — but a PAID link event
  *also* carries a nested `data.order` (Cashfree's own internal order id for the underlying
  transaction, not our link_id), so the chain silently picked the wrong field and the lookup
  always failed. Fixed by resolving `providerOrderId` explicitly per event type instead of
  falling through. The event-key dedup also needed `link_status` folded in
  (`cf_link_id:link_status`, not just `cf_link_id` alone) — a link's `cf_link_id` never
  changes across its whole lifecycle, so keying on it alone would wrongly dedupe a genuine
  `PARTIALLY_PAID -> PAID` transition as a repeat of the first delivery.
- Test suite updated to match: `whatsapp-channel-payments.e2e.spec.ts` now mocks
  `createPaymentLink` (not `createOrder`) and builds `PAYMENT_LINK_EVENT` payloads. All 12
  Phase 4 tests plus the full regression suite (977/987, same pre-existing RLS-only
  failures as always) pass.

**Live-verified twice against Cashfree's real sandbox, still zero real money**: once by
calling the real `channels/checkout` endpoint end-to-end (real HMAC-signed request, real
Cashfree Payment Link created, real `link_url` returned) and once by the user actually
opening that link in a browser and deliberately failing a test payment on it — a real,
correctly-branded Cashfree checkout page, a real CF Link ID, a real "Payment Failed" result
page. Also confirmed via `getPaymentLinkDetails` against Cashfree's real API afterward: a
failed attempt leaves the link `link_status: ACTIVE` (not a terminal failure) — Cashfree
lets the customer retry the *same* link rather than requiring a new one, and
`handlePaymentLinkWebhook`'s logic already matches that (a non-PAID/EXPIRED/CANCELLED status
correctly falls through as "not terminal yet," not mis-handled as a failure).

**Durable lesson**: a mocked test proves the code *shape* is right — it cannot prove an
*invented external contract* (a URL format, a field name) is real, because the mock is
built from the same assumption the code under test is. The three-real-bugs-in-Phase-3
lesson (keep doing live checks) held again here, one level up: even after "verified against
real sandbox" became possible, a second live pass (the user actually clicking through, not
just the API call succeeding) caught that "success" in isolation (a 201 with a `link_url` in
it) doesn't mean the *link itself* works — the API call succeeding and the resulting URL
being genuinely openable turned out to be two different things worth checking separately.

Real Cashfree sandbox credentials are now in `cloud/api/.env` (test-mode only, never
committed, never printed in any Claude output this session). `CASHFREE_WEBHOOK_NOTIFY_URL`
is still empty — no tunnel set up (the user is going straight to a real AWS domain instead of
ngrok, which needs no tunnel at all once the server has a real public address). Until then,
a real payment's success/failure won't auto-update this dev DB — `getPaymentLinkDetails` is
the manual fallback proven above.

## 2026-09-30 — Phase 4 (quote, checkout, payment→KDS gating)

The highest-stakes phase (real payment code, both repos) — built under the user's explicit
constraints: never share real Cashfree credentials, never move real money (test/mocked
gateway only), and the specific product requirement that drove the whole phase's design —
the payment link must reach the customer's WhatsApp screen right after they confirm, and
the order must reach the restaurant's POS/KDS **only after** payment is confirmed, never
before.

**Kiosk side (`cloud/api`):**
- Additive migration `20260930110058_whatsapp_channel_order_fields`: `Order` gains
  `source` (default `'KIOSK'`), `branchId`, `orderType`, `tableLabel`, `customerName`,
  `customerPhone` — all nullable except `source`. Same pre-existing, unrelated schema-drift
  `DROP INDEX "TenantRefreshToken_deviceId_idx"` Prisma's diff proposed had to be stripped
  again (see Phase 0's note — still not fixed, still not this phase's job to fix).
  `prisma migrate dev` hung waiting on an interactive "name the next migration" prompt after
  applying this one cleanly (that unrelated drift again) — killed the stuck process rather
  than answering it, confirmed via `prisma migrate status` that exactly the one intended
  migration applied and nothing else was created.
- `CashfreeGatewayService.hostedCheckoutUrl(paymentSessionId)`: pure string-builder for
  Cashfree's hosted checkout redirect URL (sandbox vs production host, same conditional as
  `baseUrl()`) — no network call, so always safe including in tests.
- `PaymentsService.createChannelOrder()`: the WhatsApp-connector twin of
  `createOrGetPaymentOrder` — same idempotency-by-`externalOrderId`, same
  `RestaurantPaymentConnection` ACTIVE gate, same `createCashfreeAttempt` reuse (commission
  split unchanged) — but takes an already-priced cart (the caller priced it from
  `QrMenuService`'s lookup, not `MenuSyncService`'s, for consistency with `channels/menu`)
  and stamps the new `source`/`branchId`/`orderType`/`tableLabel`/`customerName`/
  `customerPhone` fields. Creates **no** `SyncedOrder` — only the payment-bookkeeping `Order`.
- `PaymentsService.processCashfreeWebhook()`'s SUCCESS handling now calls a new
  `ingestWhatsAppOrderIfNeeded(payment)` — the one place a WhatsApp order becomes visible on
  POS/KDS, reached only once Cashfree confirms `SUCCESS`. Calls
  `OrderSyncService.ingestServerOrder()` with `paymentStatus: 'SUCCESS'`,
  `status: connection.autoAccept ? 'PREPARING' : 'NEW'`, `meta.paymentTransactionId` (so the
  existing payment-violation guard rail ties the order to its transaction the same way QR
  orders do), and a `WA-<n>` daily order number via the same `NumberSequence` pattern QR
  uses (`kind: 'WHATSAPP'` instead of `'QR'`, so the two counters never collide). **Correctness
  subtlety that took real thought**: this must run not just on the fresh SUCCESS transition
  but also on the pre-existing `TERMINAL_STATUSES` short-circuit branch (an already-SUCCESS
  payment on a redelivered webhook) — otherwise a first delivery whose *ingestion* failed
  (KDS-side error, not a payment error) would never get a second chance, since the
  short-circuit used to return immediately without attempting it again. Both call sites now
  route through the same idempotent method (`ingestServerOrder` dedupes on
  `(restaurantId, externalOrderId)`, so a redelivery after a successful ingestion is a
  proven-safe no-op — covered by a dedicated test). Ingestion failure is recorded as a
  `FAILED` `WebhookEvent` (visible for ops, naturally retried on the next Cashfree
  redelivery) but never reported back to Cashfree as a payment failure — the money is
  already correctly settled by that point regardless of what happens to the KDS side.
- `WhatsAppChannelService.quote()`/`checkout()`/`getOrderStatus()`: real now (were 501
  stubs). `checkout()` maps `'PICKUP'` (product/whatsapp's vocabulary) to `'TAKEAWAY'`
  (this platform's), requires a table number for `DINE_IN`, and refuses while the channel
  is paused (`requireOrderable`, new — `requireConnected` plus a `pausedAt` check).
- **Design gap found and fixed while building the whatsapp-side client**: `channelQuoteSchema`/
  `channelCheckoutSchema` originally required `branchId`, but product/whatsapp has no concept
  of a Jamanvaar branch id at all (not even Phase 2's connect flow captures one) — would have
  made `channels/checkout` uncallable from the bot for exactly the single-branch restaurants
  this connector mostly serves. Fixed by making `branchId` optional everywhere (matching
  `channels/menu`'s own existing branch-agnostic default) and adding
  `WhatsAppChannelService.resolveBranchId()`, which falls back to the restaurant's oldest
  branch. `quote()` now echoes the resolved `branchId` back so the bot can pin subsequent
  calls to it.
- New `test/whatsapp-channel-payments.e2e.spec.ts` (12 tests): quote pricing/rejections,
  checkout creates the payment order + hosted-checkout link and **no** `SyncedOrder`,
  idempotent retry, paused-channel refusal, pre-payment `getOrderStatus`, a signed
  simulated Cashfree webhook creating the `SyncedOrder` (status `NEW`, `autoAccept` off),
  duplicate webhook delivery not double-ingesting, `autoAccept` on landing in `PREPARING`,
  and a `FAILED` payment never creating a `SyncedOrder`. `test/whatsapp-channel.e2e.spec.ts`'s
  now-stale "`channels/orders/:id` is 501" test rewritten to prove it fails closed (404, not
  a 500) for an unknown order — caught a real small bug in the process: calling it with no
  `restaurantId` query param 500'd instead of 404ing (Prisma choking on `undefined`, not a
  guarded `NotFoundException`) — fixed by making `requireConnected`/`requireOrderable`
  refuse a missing `restaurantId` explicitly before ever reaching Prisma.
- **No real Cashfree call anywhere in this phase's tests**: `CashfreeGatewayService.createOrder`
  is the only method that would ever reach Cashfree's API, and it's the only one mocked (via
  `vi.spyOn`, not a full provider replacement) — `verifyWebhookSignature` and
  `hostedCheckoutUrl` run for real (pure local logic, no network, no secret ever printed).
  "Payment succeeded" is simulated the same way `payments-webhook.e2e.spec.ts` always has: a
  hand-signed POST to this server's own webhook endpoint with a test-only
  `CASHFREE_WEBHOOK_SECRET`, never a call to Cashfree.
- Full `cloud/api` suite re-run: 978 passed, only the same pre-existing, already-tracked
  (B2-029/BUG-075) `tenant-isolation.spec.ts` failures remain — **not a Phase 4 regression**,
  confirmed by `git log` showing that file untouched since a September commit predating this
  session. Root cause re-confirmed while investigating: the local dev database connects as
  the Postgres `postgres` superuser, and Postgres never applies RLS (even `FORCE ROW LEVEL
  SECURITY`) to a table's owner or a superuser — this makes every RLS policy silently
  decorative in *this specific dev environment*, independent of whether the policies
  themselves are correct. Whether production's DB role has the same property is unknown from
  here and is the actual question that matters — already on record against B2-029/BUG-075,
  not something this session re-opened or investigated further.

**`product/whatsapp` side — `JamanvaarFulfillmentSink`:**
- `jamanvaar_client.checkout()`: same signed-request discipline as `get_menu`/`validate_key`
  (exact bytes signed == exact bytes sent). Maps kiosk's 400/403/404 into plain-language
  `JamanvaarClientError`s.
- New `app/services/fulfillment/jamanvaar.py` — `JamanvaarFulfillmentSink.create_engagement`
  calls Jamanvaar's `channels/checkout`, then creates a **local** `Engagement` row (for this
  bot's own conversation state, analytics and reference-number display) but deliberately
  **no** `EngagementItem` rows: a Jamanvaar item has no local `catalog_items` row for
  `EngagementItem.catalog_item_id`'s FK to reference at all (same reason
  `JamanvaarCatalogProvider`'s tables stay empty) — the cart is snapshotted into
  `details["cart"]` instead, which every existing reader already treats as free-form JSON.
  `engagement.total`/`subtotal` come from Jamanvaar's own server-priced response, not the
  pre-checkout local estimate (same "server always re-prices" rule QR/kiosk-terminal
  payments already enforce) — and `_create_engagement` was updated to trust
  `engagement.total` from here on for exactly that reason (a no-op for LOCAL, where the two
  were always identical anyway).
- `_Engine.__init__`'s fulfillment-sink swap point, previously unconditional
  `LocalFulfillmentSink` with a hard decline for JAMANVAAR mode (Phase 3's placeholder), is
  now a real per-call dispatcher (`_fulfillment_sink(restaurant)`), mirroring
  `_catalog_provider`'s existing pattern — restaurant isn't known at `__init__` time, so both
  sinks are built once and selected per call, never stored on `self`.
- `_create_engagement`'s money-bearing branch: a JAMANVAAR engagement's payment link comes
  straight from what the sink already put on `engagement.gateway_metadata["payment_link_url"]`
  (Jamanvaar's own Cashfree session) — the Razorpay `create_payment_link` call is skipped
  entirely for this mode, not just its result ignored.
- **The one deliberate behavioral change beyond wiring the sink in**: `notify_business` (the
  WhatsApp message to the restaurant's own staff number) is now skipped for a JAMANVAAR
  engagement, on top of the pre-existing demo-restaurant skip. This is not an oversight —
  it's the same requirement the kiosk-side webhook gating exists for: the restaurant must
  not find out about an order before it's paid for, and a staff notification sent at
  checkout time (before Jamanvaar's webhook has fired) would be exactly that leak. A
  JAMANVAAR restaurant instead only learns about a paid order via its own POS/KDS, once
  `ingestWhatsAppOrderIfNeeded` on the kiosk side runs.
- `test_jamanvaar_catalog_switch.py`'s old "checkout declines honestly" test (proving
  Phase 3's placeholder-decline message) rewritten into
  `test_jamanvaar_mode_checkout_goes_through_jamanvaar_and_skips_staff_notification`: mocks
  `jamanvaar_client.checkout` (not just `get_menu`), drives the real browse→cart→confirm
  flow, and asserts the real `Engagement` row (`payment_method`, `payment_status: "pending"`
  — never `"paid"` at this point, that's the webhook's job — `gateway_metadata`, `total`),
  zero `EngagementItem` rows, the confirmation message carrying the real payment link, and
  `notify_business` never called.
- Full `app/tests/` suite re-run: 748 passed, no regressions.

**Live cross-repo check (both dev servers, real HTTP, no real Cashfree anywhere):**
Started `cloud-api` fresh (killed/regenerated Prisma client earlier this session for the
migration, so it needed restarting anyway) — `product/whatsapp`'s `uvicorn` was already
running from an earlier session and untouched. Seeded one throwaway restaurant + branch +
`WhatsAppChannelConnection` (CONNECTED) directly via Prisma against the live dev database —
no menu published, deliberately, since this check's purpose was the checkout wire format,
not the menu machinery (already live-proven in Phase 3). Drove the **real**
`jamanvaar_client.checkout()` Python function (not a mock, not a monkeypatch) against the
**real** running NestJS server: real HMAC-SHA256 signing over a real JSON POST body, real
`ServiceSignatureGuard` verification, real Zod validation, real `resolveBranchId` fallback
(no `branchId` sent — correctly resolved to the seeded restaurant's one branch), and a real,
correct `400 Unknown menu item: does-not-exist-item` from `priceCart` — proving the two
services agree on the checkout wire format end to end, the same class of check that caught
three real bugs in Phase 3.
- **One diagnostic bug found and fixed in the verification tooling itself, not production
  code**: the first live attempt got a real `401 Signature does not match` even after
  confirming (by string comparison) that both repos' `.env` files held byte-identical
  `JAMANVAAR_SERVICE_SECRET` values. Root cause: the value is quoted in `.env`
  (`JAMANVAAR_SERVICE_SECRET="..."`), which Node's `dotenv` (used by the real server) strips
  automatically but a bash `cut`-based extraction does not — the diagnostic script was
  signing with the literal quote characters included, an HMAC mismatch entirely on this
  session's side, not a real bug. Fixed the extraction, re-ran, got the expected result.
  Worth remembering for any future ad hoc signing script against this repo's `.env` files.
- Throwaway restaurant deleted afterward. `cloud-api` (port 4000) is left running (was down
  at the start of this phase from an earlier restart for the Prisma regenerate); the
  `product/whatsapp` backend was already running and untouched throughout.

**What Phase 4 does NOT yet do — a real, acknowledged gap, not a silent omission**: once
Cashfree confirms payment, the *kiosk* side correctly makes the order visible on POS/KDS,
but nothing currently calls back into *product/whatsapp* to tell the bot the payment
succeeded — so a customer who doesn't check back gets no automatic "your order is
confirmed!" WhatsApp follow-up message. The two systems' payment confirmation paths are
completely separate (Cashfree's webhook lands on kiosk's backend, never
product/whatsapp's) by design — closing this gap means either product/whatsapp polling
`channels/orders/:id` (built, real, unused so far) or kiosk calling a new outbound webhook
into product/whatsapp once `ingestWhatsAppOrderIfNeeded` succeeds. Deliberately out of
scope for this phase: it's genuinely new subsystem work (a new signed endpoint, a new
outbound call, its own tests on both sides), not a checkout/payment-gating concern, and the
user's explicit requirement — link reaches the customer immediately, order reaches the
kitchen only after payment — is fully satisfied without it.

## 2026-09-30 — Phase 3 (menu pull)

The biggest phase yet, and the one that caught the most real bugs — three, each found by
an actual live or end-to-end run, not by inspection, and each would have shipped broken
if the verification had stopped at mocked unit tests.

**Kiosk side (`cloud/api`):**
- `channels/menu` is now real: `WhatsAppChannelService.getMenu(restaurantId, branchId)`
  reuses `QrMenuService.build()` unchanged — the exact same published-snapshot + live
  sold-out overlay + ETag machinery QR ordering already uses — then redacts the
  server-only `lookup`/`stations` fields, the same redaction `qr-public.service.ts`
  already does for guests. A restaurant must have an active (`CONNECTED`)
  `WhatsAppChannelConnection` or the call is refused (404) — closes the gap Phase 0 flagged
  about a signed call not otherwise being scoped to one restaurant.
- **Bug #1, found by a failing e2e test, not inspection**: `ServiceSignatureGuard` stripped
  the query string before signing (`path.split('?')[0]`). Since `channels/menu`'s
  `restaurantId` lives in the query string, this meant a signature computed for
  `restaurantId=A` would also validate, unchanged, for `restaurantId=B` — the query string
  wasn't actually protected by the signature at all. Fixed to sign the full
  `request.originalUrl` including its query string; added a code comment explaining the
  failure mode so it can't quietly regress.
- New `test/whatsapp-channel-menu.e2e.spec.ts` (5 tests): real published menu returned,
  sold-out item live-excluded, `lookup`/`stations` never present, ETag/304 works, refuses
  an unconnected or revoked restaurant, refuses unsigned. Full `cloud/api` suite re-run
  (974 tests): only the same pre-existing, already-documented `tenant-isolation.spec.ts`/
  BYPASSRLS failures remain — confirmed twice, back to back, to rule out the one run that
  showed an extra flake as anything but resource-contention noise.

**`product/whatsapp` side — the CatalogProvider abstraction:**
- New `app/services/catalog/` — `base.py` (`CatalogProvider` ABC, `CategoryView`/
  `ItemView` dataclasses), `local.py` (`LocalCatalogProvider`, wrapping
  `CatalogCategoryRepository`/`CatalogItemRepository` unchanged), `jamanvaar.py`
  (`JamanvaarCatalogProvider`, pulls and ETag-caches `channels/menu`).
- `jamanvaar_client.py` gained `get_menu()` — same signed-request discipline as
  `validate_key()` (exact bytes signed == exact bytes sent), plus the GET-specific detail
  that an empty body still hashes as the literal string `"{}"` (matching kiosk's own
  guard-side fallback for a bodyless request), not empty bytes.
- All 7 places `generic_flow_engine.py` reads the catalog (`category_repo.list_visible`,
  `item_repo.list_by_category` ×3, `item_repo.get` ×2) now go through a new
  `self._catalog_provider(restaurant)` dispatcher — LOCAL restaurants get the one
  `LocalCatalogProvider` built once in `__init__` (unchanged behavior); a JAMANVAAR
  restaurant gets a fresh `JamanvaarCatalogProvider` per call (stateless — its cache is
  module-level). Restaurant isn't known at `__init__` time (each `_Engine` threads it
  through every method call, never stores it), so this dispatches per-call rather than
  selecting once — a real design finding worth carrying into Phase 4's
  `FulfillmentSink` selection, which will need the same shape.
- **Safety guard added**: `JamanvaarFulfillmentSink` doesn't exist yet (Phase 4). Since
  Phase 2's connect flow is real and already reachable, a restaurant could already be in
  JAMANVAAR mode today. Checkout now checks `fulfillment_mode` before reaching the
  (unconditionally LOCAL) `fulfillment_sink` and declines with a plain "being upgraded,
  try again shortly" message instead of silently trying to check out through tables that
  were never populated for it.

**Bug #2, found live, not by the mocked pytest suite**: kiosk menu item/category ids are
opaque, device-assigned external ids (e.g. `"cat-py"`) — **not** guaranteed to be
UUID-formatted at all, unlike this platform's own `CatalogCategory`/`CatalogItem.id`
(always a real UUID column). An early version of `JamanvaarCatalogProvider` did
`uuid.UUID(c["id"])` and crashed the instant it saw real Jamanvaar data, live. My own
mocked pytest fixtures happened to use UUID-shaped fake ids (`"22222222-..."`), which
masked this completely — it only surfaced once I ran `JamanvaarCatalogProvider` against
the real live kiosk server instead of a mock. Fixed by making `CategoryView.id`/
`ItemView.id` plain `str` throughout (not `uuid.UUID`), moving the UUID parsing into
`LocalCatalogProvider` (whose own tables genuinely do need one) instead of at the
`generic_flow_engine.py` call sites, which now pass the id straight through as the string
it always was (exactly what a WhatsApp button reply id already is).

**Bug #3, found by the same live run, one layer deeper**: even after fixing #2,
`image_presenter.py`'s `resolve_item_images[_bulk]`/`resolve_category_images[_bulk]`
still crashed for a live Jamanvaar item. Those functions run a real SQL query
(`WHERE catalog_item_id IN (...)`) using the given object's `.id` as a bind parameter
against a `GUID()`-typed column — and that column type's `process_bind_param` tries
`uuid.UUID(value)` on every bound value, unconditionally, regardless of whether the row
could ever match. A non-UUID id doesn't just fail to match (the safe behavior I'd assumed
after checking the *single-item* fallback path in isolation) — the query construction
itself raises, on SQLite via `uuid.UUID()` and, checked separately, the equivalent
failure mode on Postgres's own native `uuid` column type. Fixed with four new wrapper
methods on `_Engine` (`_images_for_item`/`_images_for_items`/`_images_for_category`/
`_images_for_categories`) that skip the local Image-table query entirely for a JAMANVAAR
restaurant — resolving straight from the View's own `.images`/`.image_url`, which is
exactly what `channels/menu` already gave it — and call the real, unchanged
`resolve_*_images[_bulk]` for LOCAL restaurants. All 6 call sites in
`generic_flow_engine.py` now go through these wrappers instead of the raw functions.

**Verification, in the order each bug was actually caught:**
- `test_jamanvaar_catalog_switch.py` (3 new tests, `jamanvaar_client.get_menu` mocked):
  browse shows Jamanvaar's categories/items and never the local ones; checkout for a
  JAMANVAAR restaurant declines honestly with zero `Engagement` rows created; LOCAL mode
  fully unaffected. All passed on the first real run — **but only because the mock data
  happened to be UUID-shaped**, which is exactly why bugs #2 and #3 weren't caught here.
- Full `pytest` suite re-run after each of the three fixes (738 → 745 → 748 passed across
  the phase, zero regressions each time).
- **Live, unmocked, cross-repo, three separate real checks against the running kiosk
  server**: (1) the raw `jamanvaar_client.get_menu()` call — real published menu, sold-out
  item live-excluded, ETag/304 round-trip. (2) The full `JamanvaarCatalogProvider` wrapper
  — this is where bug #2 first surfaced. (3) A complete, real WhatsApp-shaped conversation
  (`process_inbound_message`, "Hi" → tap "Order" → tap the real "Mains" category → real
  "Paneer Pizza" shown, "Sold Out Dish" absent) against a restaurant actually connected to
  the live kiosk restaurant — this is where bug #3 surfaced (bug #2's fix alone wasn't
  enough to get this far without a crash). Re-ran this exact same live conversation check
  after each fix until it passed clean, then cleaned up every throwaway restaurant on both
  sides afterward.
- One more lesson from this phase, worth keeping: my first attempt at the live conversation
  check itself had a bug — grabbing `sender.sent[-1]` and assuming WhatsApp always renders
  options as a "list" message, when a single category (this test's real live data) renders
  as a "button" message instead, with a different JSON shape. Caught by actually reading
  the message contents rather than trusting an assertion failure's first plausible
  explanation, then fixed by reusing the repo's own `_extract_options`-equivalent logic
  (handles both shapes) instead of my own narrower parsing.

**Not yet done / next up:** Phase 4 (quote/checkout) — `channels/quote`/`channels/checkout`
are still deliberate 501 stubs; `JamanvaarFulfillmentSink` doesn't exist yet. A
JAMANVAAR-connected restaurant can now show a customer its real, live Jamanvaar menu
end-to-end, but still can't actually take their order — the Phase 3 checkout guard added
above makes that decline honest instead of broken, not a real capability yet.

---

## 2026-09-30 — Phase 2 (product/whatsapp's own "Jamanvaar" connect screen)

Backend and frontend both, in `product/whatsapp`, plus the first real cross-repo proof that
the two independently-written HMAC implementations (kiosk's Node guard, whatsapp's Python
client) actually agree.

**Backend:**
- New `app/services/jamanvaar_client.py` — signs and sends the `validate-key` call to
  kiosk's `ServiceSignatureGuard`. Deliberately signs and sends the **exact same bytes**
  (`content=raw_body`, not httpx's `json=`, which would re-serialize and could drift from
  the hash computed over `raw_body`) — this is the fragile edge Phase 0's log flagged about
  the guard's `JSON.stringify(request.body)` fallback; this client is written to not be the
  thing that breaks it.
- `Restaurant.fulfillment_mode` (added Phase 0, unused until now) is joined by
  `jamanvaar_restaurant_id`/`jamanvaar_connected_at` — deliberately **not** storing the raw
  API key on this side at all; it proves identity once, at connect time, and its job ends
  there. New Alembic migration `b2c3d4e5f6a7`.
- New router `app/api/v1/routers/jamanvaar_connector.py` — `GET/POST .../jamanvaar/status`,
  `connect`, `disconnect`, reusing this codebase's own `resolve_tenant_id` + Owner/Super
  Admin role check (same shape as `PATCH /restaurants/{id}`) rather than writing new
  authorization logic. Disconnecting here deliberately does **not** revoke the key on
  kiosk's side — that stays a separate, deliberate action over there.
- New `JAMANVAAR_BASE_URL`/`JAMANVAAR_SERVICE_SECRET` settings (both repos' `.env.example`
  updated); the service secret must match kiosk's exactly.

**Frontend:** new `JamanvaarConnectorSection` in `restaurants/page.tsx`, matching this
file's existing section-component pattern (`PosDisplaysSection`, `DemoModeSection`) and
Tailwind conventions exactly. Paste a key → Connect; shows the connected Jamanvaar
restaurant id/name/timestamp; Disconnect reverts to the paste form.

**Verified, in increasing order of how real it gets:**
- `tsc --noEmit` clean on the frontend; full `pytest` — 738/738 passed, zero regressions.
  New `test_jamanvaar_connector.py` (7 tests, HTTP call mocked): connect success, invalid
  key leaves nothing connected, disconnect never re-calls Jamanvaar, manager role blocked,
  cross-restaurant access blocked, unauthenticated blocked.
- **The real cross-repo check, live, not mocked**: added `JAMANVAAR_SERVICE_SECRET` to both
  repos' actual `.env` (dev-only value, gitignored on both sides), restarted kiosk's
  cloud-api to pick it up, generated a real key via the live kiosk API, then called
  `jamanvaar_client.validate_key` for real from a Python shell against the live Node
  server. **It worked** — same for the negative cases (unknown key → 404 with a plain
  reason; mismatched service secret → 401 with a plain reason). This is the proof that
  Python's `json.dumps(..., separators=(",",":"))` and Node's `JSON.stringify` really do
  produce byte-identical output for this payload shape, which the whole signature scheme
  depends on.
- **Real browser, both apps' real UI, one real key passed between them**: ran kiosk's
  cloud-api (:4000) and, for the first time, `product/whatsapp`'s own backend (uvicorn,
  :8000) and frontend (Next.js, :3000) — using that repo's own documented no-Docker SQLite
  dev path (`AGENT_HANDOFF.md`), reusing its existing `dev.db` and adding the two new
  columns to it non-destructively (`ALTER TABLE`, not a drop/recreate). Logged in as the
  seeded demo owner (reset their password to the documented default after the existing one
  didn't work — noted here since it's a real, if minor, change to existing dev data), drove
  the real Restaurants page, pasted a real key generated moments earlier on the real kiosk
  Restaurant Admin. Screenshot confirms: "Connected to "TEST PyCrossCheck ..." on
  Jamanvaar", the real Jamanvaar restaurant id shown, real timestamp. Then Disconnect,
  confirmed by a second screenshot: reverts cleanly to "Not connected" and the paste form.
  (My own verification script initially mis-read the disconnect result — it matched an
  unrelated header badge with the same text; the screenshot itself was correct the whole
  time. Caught by looking at the actual image, not just trusting the script's assertion.)
- Cleaned up every throwaway restaurant/connection from both databases afterward.

**Not yet done / next up:** Phase 3 (menu pull) and Phase 4 (quote/checkout) — the
`channels/*` endpoints are still deliberate 501 stubs on the kiosk side, and
`JamanvaarFulfillmentSink`/`JamanvaarCatalogProvider` don't exist yet on the whatsapp side.
Connecting a restaurant here does not yet change what a customer's WhatsApp order actually
does — `fulfillment_mode` is recorded but nothing downstream reads it yet.

---

## 2026-09-30 — Phase 1 (pos-admin UI for the key screen)

Backend for this was already built and tested in Phase 0 below — this session added the
actual screen and wired it up.

- New `apps/restaurant-system/pos-admin/src/components/settings/WhatsAppChannelPanel.tsx`,
  styled to match the existing `CloudDeviceLoginsPanel.tsx`/`TerminalDisplaySettings.tsx`
  panels exactly (same card/badge/button classes, same "show the secret once" pattern).
  Wired into `App.tsx`'s existing `SETTINGS` tab, between `TerminalDisplaySettings` and
  `ReportBrandingSettings` — no new nav item invented; the design doc's "Restaurant Admin →
  Online ordering → WhatsApp" location doesn't exist as a nav section yet, and adding one is
  a UX decision for the user, not something to do unilaterally.
- New client functions in `cloud/cloudClient.ts` (`fetchWhatsAppChannelStatus`,
  `generateWhatsAppChannelKey`, `revokeWhatsAppChannelKey`, `updateWhatsAppChannelSettings`),
  following the exact pattern `fetchDisplayScale`/`saveDisplayScale` already use.
- **One real fix caught by this**: the settings endpoint was originally `PUT`, but this
  app's shared `request()` helper's `RequestOptions.method` union only allows
  `GET|POST|PATCH` (no `PUT` anywhere in this codebase). Changed the cloud/api endpoint from
  `@Put` to `@Patch` to match the codebase's own convention, rather than widening a shared
  type for one new caller — updated the DTO/e2e test to match, re-verified.
- **Verified for real, not just typechecked**: `tsc --noEmit` clean on `pos-admin`; full root
  `vitest run` — 1294/1294 passed, 180/180 files, no regressions. Then a real headless-browser
  pass (Playwright, same throwaway-account technique as the B2-052 verification) against the
  actual running app: seeded a restaurant + owner login + PRO plan/subscription + a real
  `POS_ADMIN` activation key via the live API, then drove pos-admin's **real** login screen
  (Restaurant ID + password → first-time device activation with the hardware key — this
  app's actual onboarding flow, not a shortcut around it). Confirmed on screen: the panel
  renders in the right place with the right styling; Generate Key shows a real
  `jmn_live_...` key with a "copy it now, it isn't shown again" banner; the status badge
  reads "Waiting to connect" (PENDING); Disconnect flips it back to "Not connected"
  (NOT_CONNECTED) with the key redacted (`jmn_live_rS7B••••••••••`) beforehand. Zero
  JavaScript console errors (the `ERR_CONNECTION_REFUSED` spam in the console is this app's
  own pre-existing, expected Branch Core polling — "Local Core: Unreachable" is shown
  on-screen deliberately, unrelated to this change). Cleaned up the throwaway restaurant,
  plan, subscription, device, activation key and platform user afterward.

**Not yet done / next up:** Phase 2 — `product/whatsapp`'s own "Jamanvaar" dashboard panel
(paste the key generated here, call `validate-key` for real instead of via a signed test
script).

---

## 2026-09-30 — Phase 0 (contracts & scaffolding), both repos

**Correction made before writing any code**, found by actually reading `product/whatsapp`'s
`generic_flow_engine.py` instead of trusting the earlier plan's assumption: the *current,
actively-developed* multi-niche engine does not create `Order`/`OrderItem` rows at all —
only the legacy, Prince-Corner-only `flow_engine.py` does that. The real engine creates
`Engagement`/`EngagementItem` rows instead (a generic model covering orders, bookings and
enquiries across all 12 niches). This changed the actual refactor target from what the
original design doc assumed. No user decision needed — the correct path was clear once
found, so proceeded rather than pausing to ask.

### `product/whatsapp`

- New `app/services/fulfillment/` — `base.py` (`FulfillmentSink` ABC + `SoldOutError`,
  mirroring the existing `PaymentGateway` ABC pattern in `services/payment/base.py`) and
  `local.py` (`LocalFulfillmentSink`, today's persistence logic extracted **verbatim** from
  `generic_flow_engine.py::_create_engagement` — same stock-check order, same
  reference-number retry loop, same eager-load of `.items`).
- `generic_flow_engine.py::_create_engagement` refactored to call
  `self.fulfillment_sink.create_engagement(...)` instead of inlining persistence; the sink
  is constructed unconditionally as `LocalFulfillmentSink` in `_Engine.__init__` for now
  (nothing can select `JamanvaarFulfillmentSink` yet — no connect flow exists).
- New `FulfillmentMode` enum (`LOCAL` default | `JAMANVAAR`) and `Restaurant.fulfillment_mode`
  column, migration `a1b2c3d4e5f6_add_restaurant_fulfillment_mode.py` (additive, matches the
  existing enum-migration style in this repo — `postgresql.ENUM(...).create(bind,
  checkfirst=True)` then reference with `create_type=False`).
- **Verified**: full `pytest` suite, 738/738 passed (Python 3.10 venv — 3.12 wasn't
  installed in this environment; AGENT_HANDOFF.md's 3.12 requirement was about avoiding
  3.14, not pinning exactly 3.12, and 3.10 built `rapidfuzz` fine). This includes
  `test_niche_restaurant.py`'s full real-engine order flow (welcome → cart → checkout →
  confirm → stock decrement → staff notification) — proof the extraction is truly
  behavior-preserving, not just "it imports."
- **Scope note**: `CatalogProvider` (the menu-read equivalent) was planned for Phase 0 too
  but deliberately deferred to Phase 3 (menu pull) — `item_repo` reads are spread across
  several call sites in `generic_flow_engine.py` for browsing, and rewiring all of them now,
  disconnected from actually building the Jamanvaar menu-pull endpoint, added risk without
  benefit. `FulfillmentSink` (the part Phase 4 actually needs) was worth doing now because
  it's one call site, cleanly bounded, and already had test coverage to prove against.

### `product/kiosk` — `cloud/api`

- New `whatsapp-channel` module (`cloud/api/src/modules/whatsapp-channel/`): a tenant
  controller (key generate/revoke/status/settings, behind `TenantAuthGuard`, mirroring
  `qr-ordering`'s tenant controller) and a service controller (`validate-key` — real; the
  `channels/menu|quote|checkout|orders/:id` endpoints — stubbed `501 NOT_BUILT_YET`, behind
  a new `ServiceSignatureGuard`).
- New `ServiceSignatureGuard` (`common/guards/service-signature.guard.ts`): HMAC-SHA256 over
  `METHOD\nPATH\nTIMESTAMP\nSHA256(BODY)`, keyed by `JAMANVAAR_SERVICE_SECRET` env var,
  constant-time comparison (`crypto.timingSafeEqual`), rejects a timestamp more than 5
  minutes old, and rejects an exact-signature replay (in-memory, self-expiring cache).
  Reusable as-is for the later UrbanPiper aggregator work, not special-cased to WhatsApp.
  **Known limitation, not fixed yet**: body re-serialization for the signature falls back to
  `JSON.stringify(request.body)` since this codebase has no raw-body capture middleware yet
  — fine for Phase 0/1's small DTOs, but worth adding real raw-body capture before Phase 4's
  money-bearing checkout payload relies on it (float/key-order mismatches between sender and
  receiver's own JSON serialization could cause false signature failures).
- New Prisma model `WhatsAppChannelConnection` (one per restaurant, `@@unique`) — stores only
  `keyHash` (SHA-256 via the existing `hashOpaqueToken`, same as every other high-entropy
  secret in this codebase) and `keyPrefix` for display; the raw key is returned exactly once,
  at generation, and never stored. Migration generated via `prisma migrate dev --create-only`
  then hand-reviewed before applying — **caught the diff tool proposing an unrelated `DROP
  INDEX "TenantRefreshToken_deviceId_idx"`** (pre-existing drift between schema.prisma and
  the live database, nothing to do with this change) and removed it from the migration
  before applying, rather than silently dropping a live index as a side effect.
- **Verified**: new `test/whatsapp-channel.e2e.spec.ts` (10 tests) against the real running
  API — key generation/redaction, unauthenticated rejection, wrong-signature rejection,
  stale-timestamp rejection, replay rejection, successful validate-key + connection status
  flip, revoked-key rejection, settings update, and the 501 stub. Full `cloud/api` suite
  re-run: 960/969 passed, the remaining 9 across `tenant-isolation.spec.ts` and one flaky
  resource-contention test are the same pre-existing, documented, unrelated failures noted in
  the B2-052 entry above — nothing new broke.
- `tsc --noEmit` clean on both `cloud/api` and `cloud/super-admin-web` throughout.

**Dev environment note**: applying the new migration required stopping the running
`dev:cloud` process tree first (Prisma's query-engine DLL was locked by the live API) —
followed the orphaned-process memory's full command-line cross-check before killing anything,
confirmed a clean process list, then restarted `dev:cloud` after. Both servers (`:4000`,
`:5180`) confirmed back up afterward.

**Not yet done / next up:** Phase 1 (pos-admin UI for key generate/revoke/status — the
backend for this is already built and tested above, just not wired into a screen yet) and
Phase 2 (`product/whatsapp`'s own "Jamanvaar" dashboard panel, calling `validate-key` for
real instead of via a signed test script).


Running, dated log of what's actually been done toward
[`integrations/JAMANVAAR_WHATSAPP_CONNECTOR_IMPLEMENTATION_PLAN.md`](integrations/JAMANVAAR_WHATSAPP_CONNECTOR_IMPLEMENTATION_PLAN.md),
including the prerequisite bug-fix work. Newest entry at the top. Each entry says what changed,
where, and how it was verified — not just "done."

---

## 2026-09-30 — Prerequisite: fixed the remaining B2-052 items (Super Admin RBAC UI)

**Why this came first:** the implementation plan's own risk list said not to build a new
externally-facing, money-moving integration surface on top of an RBAC UI that still had known
gaps. B2-052 (`BUG_LIST_2.md`) was the largest tracked remainder — team-role button/tab gating
in Super Admin was only partially done as of 2026-09-24 (see
[[bug_list_2_remaining_items]] memory). Fixed all 4 remaining items.

**Item 2 — write buttons only partly disabled per role.** Found the bug list's premise was
stale: grepping the whole `cloud/super-admin-web` frontend found **zero** existing button-level
permission gating anywhere outside the route-level check in `ProtectedLayout.tsx` — not just
the ~7 buttons the original bug named. Fixed by gating every write-triggering button against
`useAuth().can(area, 'write')`, area-per-action matching the existing server-side table:
- `RestaurantDetailPage.tsx`: Generate Key, Edit Restaurant, Suspend/Reactivate Restaurant,
  Create Branch, Extend Subscription, Change Plan, activation-key Revoke/Activate-again/Delete,
  device Lock/Unlock/Revoke, application Enable/Disable, menu self-upload toggle, Trigger Cloud
  Backup, Reset Password (both the row trigger and the modal's submit).
- `SubscriptionsListPage.tsx`: Assign Subscription (header + empty-state), bulk Suspend/Reactivate,
  per-row Renew/Change Tier/Suspend-Reactivate.
- `PlansListPage.tsx`: Create Plan, per-row Edit/Activate-Deactivate.
- `RestaurantsListPage.tsx`: Quick create, Onboard Restaurant, bulk Suspend/Activate, per-row
  Suspend/Reactivate (both the dropdown item and the list-view button).

**Item 3 — all 15 tabs shown to every role.** Added a `TAB_AREA` map in `RestaurantDetailPage.tsx`
and filtered the tab bar (and the URL-driven tab fallback, so a hidden tab can't be forced via
`?tab=`) through `can(area, 'read')`. A role like Finance no longer sees Devices & Keys, Support
& Diagnostics, Backup & Recovery, Applications or Menu at all.

**Item 4 — a role change didn't reach an open session.** Added periodic revalidation to
`AuthContext.tsx`: re-fetches `/api/v1/platform/me` every 45s and on tab focus/visibility change
while authenticated, updating the live `user`/`permissions` state. A demoted user's menu now
catches up within under a minute instead of needing a manual reload; a disabled user is still
caught immediately by the existing 401 → `onSessionEnded` path.

**Item 5 — bell showed a wrong unread count.** Found the real root cause was server-side, not a
frontend display bug: `platform-notifications.service.ts` broadcast every team-wide notification
type (backup failed, terminals offline, keys expiring, etc.) to every platform role with no area
check, so e.g. Finance Admin (no `devices`/`ops` access at all) was counted for notifications
linking to pages it gets a 403 on. Fixed the same way B2-051/B2-053 fixed the equivalent
activation-key leak: added `NOTIFICATION_TYPE_AREA` mapping each notification type to the area
it belongs to, and `deniedTeamTypesFor(role)` using the existing server-side `permissionsForRole`
table (`common/rbac/access.ts`) — reused, not duplicated. **Caught my own bug during
verification:** the first version used an allow-list (`type: { in: visible }`), which silently
hid any *unclassified* notification type (e.g. `TICKET_CREATED`) from any role not granted
literally every area — broke `restaurant-tickets.e2e.spec.ts`. Fixed by switching to an explicit
deny-list (`type: { notIn: denied } }`) so an unclassified type stays visible by default.

**Verification performed, not just claimed:**
- `prisma migrate status` found the local dev database was 24 migrations behind the just-pulled
  code (same B2-004 failure mode already on record). Ran `prisma migrate deploy` (additive,
  forward-only — confirmed via `migrate status`, not guessed) and `prisma generate`. Also found
  and fixed a pre-existing broken environment dependency (`pg` declared in
  `cloud/api/package.json` but not installed) via `npm install` at the repo root — confirmed
  afterward that the only `package-lock.json` change was npm's own normalization
  (`@types/pg` moved to devDependencies to match `package.json`), not a real dependency change.
- `tsc --noEmit` clean on `cloud/api` and `cloud/super-admin-web` (both had pre-existing,
  unrelated errors before the Prisma fix above — confirmed the remaining handful after are
  pre-existing and untouched by this change: a missing `pg` type stub in `realtime-bus.ts`, a
  missing `@sqlite.org/sqlite-wasm` type in `packages/database`).
- Added a new regression test, `cloud/api/test/platform-notifications-area-scope.e2e.spec.ts`
  (3 tests), proving item 5's fix with a real restricted role (Finance Admin) rather than just
  reasoning about it.
- Ran the full `cloud/api` suite (114 files, 959 tests): 855 passed, 32 failed across 3 files —
  all 3 pre-existing and unrelated: `tenant-isolation.spec.ts` fails for the documented
  superuser/`BYPASSRLS` reason already on record against B2-029/BUG-075 (not a regression, the
  database connects as a superuser in this environment); `branch-core-uplink.e2e.spec.ts`'s one
  failure didn't reproduce at all when run in isolation (resource contention under the full
  114-file concurrent run, not a real failure); `restaurant-tickets.e2e.spec.ts`'s one failure
  **was** a real regression from my own item-5 fix, caught and fixed (see above), then
  re-verified green.
- Did not yet do a browser-driven pass (`run` skill) of the Super Admin UI itself — planned next,
  before moving on to the WhatsApp connector's Phase 0.

**Files touched:**
`cloud/super-admin-web/src/pages/Restaurants/RestaurantDetailPage.tsx`,
`cloud/super-admin-web/src/pages/Subscriptions/SubscriptionsListPage.tsx`,
`cloud/super-admin-web/src/pages/Plans/PlansListPage.tsx`,
`cloud/super-admin-web/src/pages/Restaurants/RestaurantsListPage.tsx`,
`cloud/super-admin-web/src/auth/AuthContext.tsx`,
`cloud/api/src/modules/platform-notifications/platform-notifications.service.ts`,
`cloud/api/src/modules/platform-notifications/platform-notifications.controller.ts`,
new: `cloud/api/test/platform-notifications-area-scope.e2e.spec.ts`.

**`BUG_LIST_2.md` updated** to mark B2-052 fully fixed, with the same detail as above.

**Browser verification, done for real (not skipped):** started `cloud-api` (:4000) and
`super-admin-web` (:5180) via `npm run dev:cloud`, seeded a throwaway test restaurant + plan +
subscription and two throwaway platform users (`PLATFORM_OWNER`, `FINANCE_ADMIN`) through the
real running API, and drove both through a real headless Chromium (Playwright, installed to the
scratchpad only — `chromium-cli` wasn't available in this Windows environment, and the login
flow's email-OTP step has no test bypass against a live server, so the OTP hash was set directly
via a throwaway script using the same HMAC the server itself uses, on test-only accounts). Real
results:
- Finance Admin's tab bar: exactly the 10 tabs it should have (Overview, Owner & Users, Branches,
  Subscription, Plan Quotas, Feature Entitlements, Billing & Invoices, Payments, Reports &
  Analytics, Audit Logs) — Devices & Keys/Applications/Support/Backups/Menu correctly absent.
- Forcing `?tab=devices` via URL as Finance Admin: fell back to Overview, confirmed by reading
  the actually-active tab element, not just the tab bar.
- Edit Restaurant / Suspend Restaurant: `disabled: true` for Finance Admin (read-only on
  `restaurants`). Change Plan on the Subscription tab: `disabled: false` for Finance Admin
  (correctly has `subscriptions:write`).
- Platform Owner (full access): all 15 tabs present, Edit Restaurant enabled — confirms no
  regression for a full-access role.
- Notification bell: Finance Admin (15 unread) vs. Platform Owner (30 unread) on the real dev
  database's actual accumulated notifications — confirms item 5's area filtering is doing
  something real, not just passing a synthetic test.
- Zero console exceptions on either session. Did see a batch of `403`s in Finance Admin's
  console — traced this to the **Dashboard page** (`/`, separate from Restaurant Detail),
  which appears to eagerly fetch widget data for areas Finance can't access; the same class of
  issue B2-052 fixed, but on a different page, never in B2-052's original scope, and the 403 is
  still correctly refused server-side (no data leak, just fetch/console noise). Logged here as a
  fresh, minor, separate finding — not fixed as part of this pass.
- Cleaned up: deleted the throwaway restaurant, plan, subscription and both platform users from
  the shared dev database afterward; confirmed via a follow-up query.

**Dev servers:** left running in the background (`cloud-api` :4000, `super-admin-web` :5180) for
continued work in this session — not stopped, to avoid restart overhead before Phase 0 work
starts. Follow the orphaned-process memory's command-line cross-check before killing anything
if cleanup is needed later.

**Open minor follow-up (not B2-052, found during this verification, not yet fixed):** the
Dashboard page's widget-loading 403 noise for restricted roles, noted above.

---

## 2026-09-29 — Cross-repo implementation plan written

Wrote [`JAMANVAAR_WHATSAPP_CONNECTOR_IMPLEMENTATION_PLAN.md`](integrations/JAMANVAAR_WHATSAPP_CONNECTOR_IMPLEMENTATION_PLAN.md)
after pulling 29 commits that included a prior design doc
(`WHATSAPP_ORDERING_PLAN_AND_PROMPT.md`) and the Cashfree payment/commission-split
infrastructure the plan depends on. See that file for the full phase-by-phase plan; see
[[whatsapp-ordering-integration-plan]] memory for the architecture decisions behind it
(push-order/pull-menu, industry-pattern research, the `FulfillmentSink`/`CatalogProvider`
adapter recommendation for `product/whatsapp`).

**Status: not started.** Next up per the plan is Phase 0 (contracts & scaffolding), gated on
finishing the bug-fix prerequisite above.
