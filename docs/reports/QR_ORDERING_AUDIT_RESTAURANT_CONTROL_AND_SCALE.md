# QR Ordering Audit: Restaurant-Controlled Menu, Multi-Customer Tables, Concurrency and Scale

Audit of the code as it stands (after the first QR implementation, 2026-09-26) against `docs/qr-additinal .md`, which holds **two** requirement sets: *Full Restaurant-Controlled QR Ordering* (lines 1-1042) and *Multi-Customer QR, Table Management, Concurrency and High Traffic* (from line 1043). There is no separate `wr-additinal.md`; the second set is in the same file. Nothing was implemented while writing this. Payment (Razorpay, cash processing) is out of scope; a search finds no Razorpay reference in the repository.

Legend: **OK** verified in code and, where stated, by a test. **PARTIAL** works in part. **GAP** missing or wrong. Every status below was checked in the code named; where I could not confirm something it says so.

---

# Part A. Restaurant-controlled menu

## A1. The flow, step by step

| Step | What exists | Hardcoded | Database-backed | Restaurant Admin can edit | Customer receives | Missing | What must change |
|---|---|---|---|---|---|---|---|
| **Category** | `Category` (name, slug, description, imageUrl, sortOrder, isActive, translations); `MenuRepository.create/update/deleteCategory`; `MenuCategoriesModule` | `sortOrder` is assigned once at creation (`db.categories.length + 1`); seed categories exist in a fresh local database until activation clears them | Local device database, synced as `MENU_CATEGORY` entities | name, description, image, active. **No reorder control** (a search of the category module and repository finds none) | `id`, `name`, `sortOrder` only; sorted by `sortOrder` | Category **image**, **description** and **QR visibility** never reach the guest; no reorder UI; no per-branch visibility | Publish category image/description/visibility; add reorder; honour active/QR flags in the published menu |
| **Item** | `MenuItem` with name, description, price, imageUrl, dietaryType, isAvailable, taxGroupId, sortOrder, kitchenStation, `isQrOrderingEnabled`, `salesChannels`, `branchIds`; `ItemModal`; `create/update/deleteMenuItem`, `toggleItemAvailability`, `bulkToggleAvailability` | New dishes default `taxGroupId: 'tax-gst-5'` (`repositories.ts:357`); a new dish attaches **every** modifier group by default (`ItemModal`); `sortOrder` auto-assigned | Local database, synced as `MENU_ITEM` | name, description, price, image, availability, station, dietary type, group attachment. **Not editable anywhere**: item order, tax group, QR visibility / `salesChannels`, `branchIds`, quantity min/max, special-instruction switch | id, name, description, price, image, category, dietary type, group ids. **Items are not sorted at all**: the guest menu query has no `orderBy`, so item order is whatever the database returns | Item ordering (data and UI); tax group selector; channel / QR visibility editor; branch restriction editor; quantity rules; per-item instruction switch | Sort by `sortOrder`; add the missing editors; remove the hardcoded defaults |
| **Modifier group** | Type `ModifierGroup` (name, description, min/max, isRequired, options, sortOrder); `getAllModifierGroups()` only | Groups exist only as **seed data** (`SEED_MODIFIER_GROUPS`); a fresh restaurant has the platform's seed groups | Local database, synced as `MODIFIER_GROUP` (added by the first QR work) | **Nothing.** A search of `packages` and `apps` finds no create, update or delete for a group and no screen (the only writers are the seed and a menu-import) | id, name, isRequired, min, max, options. Group `description`, `sortOrder`, `isActive` are read in part and ignored | **Everything**: group CRUD, min/max, required, display order, active, description, default selections | Build modifier-group management (data layer + Restaurant Admin screens) |
| **Modifier option** | `ModifierOption` (name, priceDelta, isDefault, isAvailable, sortOrder, image field type) | Seed only | as above | **Nothing** | id, name, priceDelta (rupees). `isAvailable` honoured; **`sortOrder` ignored (options appear in stored order)**; `isDefault` and option images not sent | Option CRUD, price editing, reorder, default selections, images | Same as group |
| **Pricing** | `price` (also `takeawayPrice`, `dineInPrice` fields exist); modifier `priceDelta`; `priceCart` on the server (paise) | Tax: none hardcoded any more on the server | Item price and option price synced | Item price yes; option price no | Display price; server quote gives the authoritative total | `dineInPrice` is ignored by QR (a dine-in QR order uses `price`); no branch price override | Decide the pricing source per order type; add branch overrides |
| **Tax** | `TaxGroup` (cgst, sgst, igst, isInclusive); server reads `TAX_GROUP` entities; inclusive tax supported in `priceCart` | Seed has one group; new dishes default to `'tax-gst-5'` | Local + synced | **Not in Restaurant Admin** (only Kiosk Admin edits tax groups) | Tax lines in the quote | Tax group editor in Restaurant Admin; per-item selector | Move/share the editor; remove default |
| **Availability** | `isAvailable`; server excludes unavailable dishes and refuses them on order (tested) | none | yes | **Yes** (item toggle, bulk toggle) | hidden / refused | Reaches the guest only after the next entity-sync tick, not on an explicit publish | Tie to publish (see below) |
| **QR channel** | `salesChannels` and `isQrOrderingEnabled` honoured by the server (tested for `salesChannels`) | none | yes (fields on the item) | **No.** The only screen that set `isQrOrderingEnabled` was the old QR module's dish dialog, which the first QR work deleted; nothing replaced it. `isDigitalMenuVisible` is ignored | filtered menu | Editor for channels and QR visibility | Restore and extend (per-item, per-category) |
| **Published menu** | `MenuPublication` (version number, watermark, note, audit) and a "Publish" action | `menuVersion` is the latest publication number | Publication row only | Publish button exists | `menuVersion` = latest publication, **but the menu content is read live** from the synced entities | **No snapshot**: publishing does not freeze anything. Edits reach the guest as soon as the admin's device syncs, so a half-edited menu can be visible; `menuVersion` can stay the same while content changes (only the content-hash `etag` changes) | Publish must build and store an immutable snapshot; the guest reads only snapshots |
| **QR customer page** | `apps/qr-guest`: header (restaurant, branch, table), search, categories, items, options sheet, cart, checkout, status | System copy is static English ("Add", "View Cart", "Thank you!", step names, "Pay at the counter…"); **`₹` is hardcoded** although `Restaurant.currency` exists; no logo (the restaurant record has none) | n/a (renders server data) | n/a | see menu contract | Logo; configurable labels/status wording; currency from the restaurant; category images; item image sizes | Configuration-backed branding block |
| **Customization** | Options sheet with required / max rules, prices | none | rules come from the group | see above | rules and prices | Default selections not applied; "Included" / "Required" wording; option descriptions | Follow the specification's modal |
| **Cart** | Lines keep item, option ids and names, note, display unit price, quantity; sent to the server as ids only (correct) | none | browser storage keyed by QR token | n/a | n/a | Cart shows selected options (yes) but not per-option prices; per-line snapshot to the server is ids only (by design, the server reprices) | Keep ids-only submission; add option prices to the display |
| **Order** | Server prices and creates a `SyncedOrder` line per dish: name, unitPrice (paise, already including options), lineTotal, **modifier names only** | none | `SyncedOrder.items` JSON | n/a | confirmation with server total | **Historical snapshot is incomplete** (see A3): option prices, ids, group names, tax rate/amount per line, base price and the menu version are not stored | Snapshot fields on every line and the order |
| **POS** | Order arrives by cursor, inbox accept/decline | none | local DB | n/a | n/a | Device mapping of a pulled line **rebuilds option prices as ₹0** when `modifierDetails` is absent (`orderItemFromRemote`), so a QR order's options show `+₹0` on POS | Send and read `modifierDetails` |
| **KOT** | Deterministic tickets per station; item options by name; special instructions carried | none | local DB | n/a | n/a | Options shown by name only (fine for a kitchen) | none beyond the snapshot |
| **KDS** | Same pull and tickets | none | local DB | n/a | n/a | not driven in a browser | verify with the fixtures |

## A2. The fifteen specific verifications

| # | Check | Result | Basis |
|---|---|---|---|
| 1 | Modifier / customization data is dynamic | **PARTIAL** | The server and customer app take it from the restaurant's synced entities (no static list remains; `qr-menu.service.ts`). But the only source of those entities is **seed data**: the restaurant cannot create or change any |
| 2 | Modifier prices are dynamic | **PARTIAL** | Read from `priceDelta` (tested). Not editable |
| 3 | Required / optional rules are dynamic | **PARTIAL** | Enforced from the group's data on the server (tested). Not editable |
| 4 | Min / max selections are dynamic | **PARTIAL** | Same. Note `maxSelections: 0` means "no maximum" and a required group with `min: 0` still needs one choice: the semantics are undocumented |
| 5 | Item availability is dynamic | **OK** for data and validation (tested); reaches guests without a publish gate |
| 6 | QR channel availability is dynamic | **PARTIAL** | Honoured (`salesChannels` tested). No editor since the old module was removed |
| 7 | Category ordering is dynamic | **PARTIAL** | Guest menu sorts by `sortOrder`; the value is auto-assigned and cannot be changed |
| 8 | Item ordering is dynamic | **GAP** | Items are not sorted by the server and have no order editor |
| 9 | Images are dynamic | **PARTIAL** | The item's `imageUrl` is used. Upload resizes in the browser and stores a **base64 data URL inside the item record** (`ItemModal`), so images travel inside every sync and inside every public menu response. There is no object storage for menu images (the only storage module is for backups). Category images are not sent |
| 10 | Restaurant-specific menu data is dynamic | **OK** for the server and customer app (each restaurant sees only its own, tested); defaults on new records are hardcoded (tax group, attach-all-groups) |
| 11 | Branch-specific configuration is respected | **PARTIAL** | Only a `branchIds` visibility list on an item (honoured, tested, no editor). No branch price, availability or category override. A table has no branch field in the local model; the QR code carries the branch |
| 12 | Historical orders preserve original prices / configuration | **GAP** | See A3 |
| 13 | Backend recalculates and validates prices | **OK** | tested: client price/total/ids rejected, unknown items and options refused, required and min/max enforced |
| 14 | QR ordering uses the canonical order system | **OK** | shared ingest, `SyncedOrder`, sequence, branch, source (tested) |
| 15 | No hardcoded restaurant configuration remains in production QR logic | **PARTIAL** | The server has none. Remaining: the `tax-gst-5` default and attach-all default when creating dishes, `₹`, English status/step wording and button labels in the customer app, seed menu/groups in a fresh local database, the `qrToken` "legacy" mirror |

## A3. Historical order immutability (requirement 30) in detail

What a QR order line stores today (`qr-public.service.ts`): `externalItemId`, `name`, `quantity`, `unitPrice` (paise, **already including the chosen options**), `modifiers` (**names only**), `kitchenStatus`, `kitchenStation`, `lineTotal`, optional note; order-level subtotal, tax, total, and `meta.qrCodeVersion`.

What is **not** stored: each option's price and id, the group it came from, the item's base price, the tax group / rate and the tax on the line, and the menu version the guest ordered from. Consequences:

* The order total and each line's unit price stay correct forever (good), but **"Extra Cheese +₹40" cannot be reconstructed** once the price changes, because only the name was kept.
* On a POS or Kiosk that pulls the order, `orderItemFromRemote` fills missing option prices with **0**, so the option appears as `+₹0` on the device today.
* The order records no menu version, so an order cannot be tied back to what the customer saw.

## A4. Draft / publish (requirements 22-23)

Existing: `MenuPublication` (numbered marker, note, audit, realtime "menu" wake-up), devices report the version they applied, Restaurant Admin has a Publish button and a "pending changes" count.

Gap: publishing does not capture the menu. The guest reads live entities, so there is no draft state; `menuVersion` in the public response is the publication number while the served content can be newer; the `etag` is a hash of content. To meet the requirement without a second menu system, the **existing entities stay the draft** and publishing creates an immutable snapshot the guest reads.

## A5. Customer-visible values (requirement 26)

| Value | Class today | Verdict |
|---|---|---|
| Restaurant name, address, city | database | OK |
| Restaurant logo | none exists | GAP: add to restaurant configuration |
| Branch name | database | OK |
| Table number | database (table record) | OK |
| Category name, order | database (sorted), not editable order | PARTIAL |
| Category image / description | database, **not sent** | GAP |
| Item name, description, price, image, dietary type | database | OK (image as data URL: see A2 #9) |
| Item order | database, **not applied** | GAP |
| Modifier group name, required, min, max | database (seed only) | PARTIAL |
| Option name, price | database (seed only) | PARTIAL |
| Option order, default, image | database, **not sent** | GAP |
| Tax | database (tax group) | OK for server; editor missing |
| Special-instruction availability | configuration (QR setting `allowCustomerNotes`) | OK (per-item switch missing) |
| Availability | database | OK |
| Ordering settings | configuration (QR settings) | OK |
| Cart labels, button text, order-status step names, thank-you text | **hardcoded English** | GAP: configuration-backed labels with defaults |
| Currency symbol | hardcoded `₹` | GAP: from restaurant currency |
| Order number, reference | system-generated | OK |

## A6. Test coverage against the requirement's own scenarios

| Scenario | Status |
|---|---|
| Admin creates item, publishes, guest sees price; change price; add option; change option price; guest sees each (requirement 29) | **Not tested and not possible end to end**: an admin cannot create or change options. Price and item changes propagate through entity sync (partly tested by "menu changes are reflected on the next request") |
| Multi-restaurant prices (31) | **OK** (different menus, same table number; option price per restaurant tested) |
| Multi-branch price (32: same dish ₹250 vs ₹300) | **GAP**: no branch price override exists |
| Historical order keeps old prices (30) | **GAP**: see A3 |

## A7. Things I found that contradict earlier statements

* My first implementation report lists "no editor yet for `salesChannels` / `branchIds`" as remaining. The truth is worse: **I removed the only editor of the per-dish QR switch** when I deleted the old QR module, so restaurants that used it can no longer change it. This audit puts it back on the plan.
* The report's "Customer Ordering PASS" holds for pricing, validation and delivery; it does not cover the restaurant's ability to author what the customer sees (Part A) and it overstated how dynamic the modifier data is: dynamic on read, not editable.

---

# Part B. Multi-customer tables, concurrency and scale

## B1. Requirement-by-requirement

| # | Requirement | Status | Basis and gap |
|---|---|---|---|
| 1 | **Multiple phones on one table QR** | **OK** by design, **PARTIAL** in tests | The token resolves to the table; no per-customer state is held on the server; each phone gets its own menu, quote and order. Tests submit several orders on one code but never with distinct browser sessions or a real 100-phone case |
| 2 | **Customer-specific carts / sessions** | **PARTIAL** | The cart is client-side (allowed) and keyed by QR token in `localStorage`: two phones are independent; two **tabs of one browser** share one cart. The session id is a random per-tab value the **client chooses**; it is used for analytics and one rate limit and is **not stored on orders** (requirement 12 asks for `customerSessionId`) |
| 3 | **Multiple independent orders per table** | **OK** | every submit is a new order; never merged (tested) |
| 4 | **Table-wise QR generation** | **OK** | one code per table, unique active code enforced; **print one and print all** exist, **print selected** does not |
| 5 | **Restaurant Admin table management** | **PARTIAL** | Floor / Tables can create, edit, set capacity and zone, activate and deactivate, delete. It is separate from the QR console. **Missing:** table branch, "name" field, archive-vs-delete, the requested table states beyond `AVAILABLE, OCCUPIED, RESERVED, BILLING, BILL_REQUESTED, CLEANING, BLOCKED` (no `ORDERING / PREPARING / SERVING / BILLED`), **controlled state transitions** (`updateTableStatus` overwrites freely, and tables sync last-write-wins), a per-table view of active QR orders with a total (requirement 44) |
| 6 | **Branch isolation** | **OK** for QR and orders (tested); **PARTIAL** for tables | the table model has no `branchId`; the branch is chosen when the code is generated |
| 7 | **Restaurant isolation** | **OK** | row-level security, tested |
| 8 | **Concurrent order creation** | **PARTIAL** | per-order advisory lock, unique index, one transaction (order, sequence, event log). Tested at small scale only: 4 identical concurrent submits, 8 concurrent numbers, a 4-request limit burst. **Not tested** at the required scales (100 same table, 1,000 across tables) |
| 9 | **Idempotency** | **OK** | key scoped to restaurant + code; concurrent duplicates and retry-after-timeout (tested) |
| 10 | **Order-number collisions** | **OK** | `QR-n` from `NumberSequence` upserted atomically per branch per business day; 8 concurrent all unique (tested). Not `MAX+1` |
| 11 | **KOT-number collisions** | **OK for QR** (deterministic from the order); **PARTIAL overall** | other channels still fall back to `KOT-<max+1>` when no number lease is configured (first start before any lease) |
| 12 | **POS concurrency** | **OK** | first-accept-wins claim, duplicate-safe (tested with two terminals) |
| 13 | **KDS concurrency** | **PARTIAL** | tickets are idempotent by id, so duplicate delivery makes one ticket (tested with a second terminal); the KDS app itself was not driven |
| 14 | **Branch Core concurrency** | **PARTIAL** | SQLite persistence, gapless sequence, exactly-once by event id, restart recovery (chaos tests, 12 devices). Not run with a QR-scale burst |
| 15 | **High QR traffic** | **GAP** | no load test. Each `GET /public/qr/:token` runs roughly 8 separate transactions (entitlement, restaurant, branch, table, settings, menu build with four entity scans, event insert, last-scanned update). The menu is rebuilt from **all** the restaurant's menu entities on every request |
| 16 | **Database indexing** | **PARTIAL** | added: `QrCode(publicToken unique, restaurantId+branchId, restaurantId+tableId)`, `SyncedOrder(restaurantId,branchId,source,createdAt)`, `publicOrderId` unique, `QrEvent` indexes; existing `SyncedEntity(restaurantId,entityType,updatedAt)`. No query-plan review; no `(branchId, tableId)` index as specified; no status index |
| 17 | **Connection pooling** | **PARTIAL / not configured** | Prisma's default pool. No environment-driven `connection_limit`, `pool_timeout`, transaction `maxWait` / `timeout`, statement or lock timeout in `prisma.service.ts` or the environment schema. Every `runAsTenant` / `runAsPlatform` call opens its own transaction |
| 18 | **Horizontal API scaling** | **PARTIAL** | Order correctness is stateless (database only), no sticky sessions needed. **But** the rate limiter is per process, and the realtime bus is per process (devices recover by cursor, guests poll, so only wake-up speed suffers) |
| 19 | **Rate limiting** | **PARTIAL** | per code, session, order and failed lookup exist. Gaps: the session id is client-chosen, so a script can rotate it; **the per-code order limit (12/min) contradicts the 100-customers-one-table scenario** and would return 429 to most of them; no per-restaurant / per-branch ceiling; unknown order-status lookups are not counted as failures |
| 20 | **Menu caching / versioning** | **GAP** | no server cache; `ETag` saves bandwidth only (the menu is still fully rebuilt for a 304); `menuVersion` does not identify content (see A4) |
| 21 | **Queue / backpressure** | **GAP** | order creation is synchronous. An accepted order is never silently lost (it is committed before the answer or the request fails), but there is no admission control, no `503 + Retry-After` under overload, and no bounded concurrency per restaurant |
| 22 | **WebSocket failure recovery** | **OK** | the guest page polls; devices use realtime only as a wake-up with cursor recovery (tested: missed wake-up recovered) |
| 23 | **Customer order privacy** | **PARTIAL** | a guest can only read an order by its reference and sees no other order. The reference is a short **human-style** code (8 characters from a 31-symbol alphabet, about 40 bits), not a separate secure tracking token; it is not bound to the session; enumeration is limited only by the general per-address limit |
| 24 | **QR regeneration / revocation** | **OK** | old token dead, new live, one transaction; historical orders untouched by design (a test that an old order stays readable after regeneration is not written) |
| 25 | **Table deactivation** | **OK** for new orders (resolver refuses an inactive or deleted table; tested). Existing active orders are untouched by design, not tested |
| 26 | **Load / concurrency testing** | **GAP** | none at the required scales; no harness, no latency / error / duplicate metrics |

## B2. Requirements from the multi-customer text that are not in the list above

| Requirement | Status |
|---|---|
| Table id globally unique, not the table number (3) | **GAP**: the local id is `tbl-${Date.now()}`, unique per restaurant only by luck of the millisecond, and two devices creating a table in the same millisecond collide. The table has no `branchId`, no `name`, no `qrEnabled` |
| Table status must not block ordering (11) | **OK**: the resolver checks only active / deleted, never the occupancy status |
| Table grouping without merging orders (9, 44) | **GAP**: no API or screen groups a table's active orders with a total |
| `customerSessionId` on the order (12) | **GAP** |
| Menu cache key includes restaurant, branch, version (52) | **n/a today (no cache)**; must be designed in |
| Stale prices never accepted by the backend (53) | **OK**: the server always prices from current data |
| Entitlement not re-queried expensively under load (51) | **GAP**: `resolve()` runs several queries on every public request |
| Transactional order + items + event + outbox (29-30) | **OK in substance**: the order row (items inside it), the sequence number and the sync event log commit in one transaction; delivery to the branch is by the cursor over that same row, so there is no separate outbox to lose. Not a separate "order items" table |
| Transient DB failure retry only with an idempotency key (36) | **GAP**: no retry at all |
| Observability, correlation id (55, 56) | **GAP**: only the generic HTTP log line; no request id, no QR metrics or structured events; order sync logs use the order id as the trace |
| Failure recovery tests (57) | **PARTIAL**: Branch Core restart, POS restart, missed wake-up, duplicate delivery, refresh are covered; API restart, DB blip, backlog and KDS restart are not |
| Payment separated from order creation (54) | **OK**: orders are created `PENDING`; nothing marks paid; no provider keys anywhere |

## B3. Conflicts and risks found

1. **Rate limit vs the 100-customer table scenario** (B1 #19): the current per-code order limit is a defect against the new requirement.
2. **Publish is not a gate** (A4): fixing it changes when admin edits reach guests; restaurants used to instant edits will need a "Publish changes" habit and a visible pending-changes indicator.
3. **Order snapshot change** (A3) touches the order line shape used by POS, Kiosk, Captain, KDS and Branch Core; old orders have no snapshot and must render as they do today.
4. **Table model change** (B2) touches tables synced by every app; ids of existing tables must stay valid.
5. **Images inside records** (A2 #9) make the public menu response and every sync payload large; moving to object storage needs a migration of existing data URLs.
6. **Cache design** must not reintroduce the cross-tenant risks the row-level security removes: keys must carry restaurant, branch and version.
7. **In-process limiter and bus** mean a second API instance changes behaviour; scaling out is blocked until they have a shared backend.

## B4. What is already good and should not be redone

Shared order ingest, atomic order numbering, deterministic kitchen tickets, first-claim acceptance, idempotency, tenant and branch isolation, QR code lifecycle, server pricing and validation, cursor recovery, polling status page, orders never marked paid.
