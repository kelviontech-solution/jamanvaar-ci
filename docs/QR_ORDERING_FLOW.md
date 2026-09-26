# QR Ordering: End-to-End Flow

## 1. Setup (once)

1. **Super Admin** creates a plan with the features it includes (the QR feature is one switch among them) and assigns it to a restaurant. The restaurant gets an `ApplicationEntitlement` row for `QR_ORDERING`.
2. **Restaurant Admin** adds its branches and tables (Floor / Tables), and publishes its menu, modifier groups and tax groups (they are published together with the dishes).
3. **Restaurant Admin → QR Ordering → Tables & QR → Generate QR.** The server checks the entitlement and the plan's table limit, mints an unguessable token, and returns the address the code opens. **Print / PNG / PDF** produce the table card.

## 2. A guest orders

```
Guest scans ─▶ https://<order site>/q/<token>
   1  GET  /public/qr/:token            who is this table?  (restaurant name, branch, table, settings)
   2  GET  /public/qr/:token/menu       the restaurant's menu for THIS branch (ETag, refreshed every minute)
   3  Guest picks dishes, options, quantities. Cart lives in the browser.
   4  POST /public/qr/:token/quote      the server prices the cart: subtotal, tax, total
   5  Guest enters name/phone if the restaurant requires them, then taps "Place order"
   6  POST /public/qr/:token/orders     idempotency key = the cart's attempt key
        ├─ resolve token, check every precondition (below)
        ├─ price on the server, validate every line
        ├─ create the order through the shared ingest (status NEW, unpaid)
        └─ answer: order number (QR-12), public reference (JQ-…), server total
   7  Status page polls GET /public/qr/orders/:reference every 5 s
```

**Preconditions checked on every request**, in this order: the code exists and is ACTIVE → the restaurant exists and is ACTIVE → the branch exists and is ACTIVE → the subscription is current and `QR_ORDERING` is enabled → QR ordering (and this code's mode) is switched on → the table exists, is active and is in this branch. Any failure shows the same message to the guest: *"QR Ordering is currently unavailable for this restaurant."* (a revoked or disabled code says the code is no longer valid).

## 3. At the restaurant

```
cloud SyncedOrder (source=QR, seq n, branch B)
      │  realtime wake-up (best effort)   ·   cursor pull (always correct)
      ▼
Branch Core of branch B ──▶ every POS / Kiosk / Captain / KDS of branch B
      │
      ▼
each device builds the same kitchen tickets from the order (KOT-QR-12, …)  ──▶  KDS shows them
      │
POS "New QR orders" inbox (status NEW):  [Accept]  [Decline]
      • Accept: records acceptedBy, order → PREPARING, syncs, then — only if this terminal still owns the claim — prints the tickets
      • Two counters pressing Accept together: the first claim wins on the server; the other terminal learns it lost and prints nothing
      • Decline: order → CANCELLED (the guest sees it cancelled)
KDS: PREPARING → READY  ──▶  status page: Order received → Preparing → Ready → Completed
Counter settles the bill (cash) ──▶ order COMPLETED, payment recorded once
```

## 4. Statuses

| Canonical order status | Guest sees |
|---|---|
| NEW, PENDING | Order received |
| PREPARING, CONFIRMED | Preparing |
| READY | Ready |
| SERVED, COMPLETED | Completed |
| CANCELLED, REFUNDED, VOIDED | Cancelled |

There is no separate QR status model: this is a view of the platform's own statuses. A restaurant can turn the status display off; the guest then sees "Order received".

## 5. Payment

Guests pay **at the counter**. The order is created unpaid and is not a sale until the counter (or, later, a verified gateway payment) settles it. Online payment for QR orders is deliberately not offered yet; the API refuses it and the setting cannot be turned on, so nothing can be shown as paid without a verified payment.

## 6. Menu-only codes

A code with no table (for menu cards) shows the menu and asks the guest to choose **dine-in with a table number, or takeaway**. A table is never assumed.

## 7. Changing a code

* **Regenerate**: the old code is revoked and a new one created in one transaction; there is never a moment with two live tokens for a table. The printed old card stops working immediately.
* **Disable / Enable**: reversible. **Revoke**: permanent.
* Every change is audited (who, when, which code).
