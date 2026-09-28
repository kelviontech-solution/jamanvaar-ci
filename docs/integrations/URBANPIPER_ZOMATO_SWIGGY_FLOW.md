# Zomato and Swiggy through UrbanPiper: the best flow for JAMANVAAR

Written 28 Sept 2026. **Suggestion only; nothing is built.** Field names below are the general shape of UrbanPiper's POS integration. Confirm every name against their documentation during onboarding, because it is shared under their partner programme and can change.

Sources: [UrbanPiper POS API overview](https://api-docs.urbanpiper.com/downstream/getting-started/overview), [Partner programme](https://api-docs.urbanpiper.com/downstream), [Testing and validation](https://api-docs.urbanpiper.com/downstream/integration-certification/testing-and-validation), [Order relay webhook](https://urbanpiper.helpjuice.com/55452-faqs/order-relay-webhook), [POS Integration Handbook](https://urbanpiper.helpjuice.com/55451-ordering/pos-integration-handbook).

## Why UrbanPiper and not Zomato and Swiggy directly

Zomato and Swiggy each have their own partner programmes and approvals, mostly closed to a small POS vendor. UrbanPiper already holds those connections and offers one integration in return. You build **one** integration, and each restaurant enables Zomato, Swiggy and others through its UrbanPiper account.

## What UrbanPiper says the integration is

- UrbanPiper is a "middle layer" between the aggregators and your POS. "Downstream" means your POS side.
- **Orders arrive by webhook.** Your system exposes a public endpoint; UrbanPiper posts every new order for all stores to it, and you tell which restaurant it is by the **store code** in the body.
- **Your POS sends back** order status updates (acknowledged, food ready, dispatched, completed, cancelled) and receives status updates that come from the aggregator (rider assigned, customer cancelled).
- **Your POS also pushes** the catalogue (menu), and store and item availability (switch a dish or a whole store on or off).
- Onboarding: a **sandbox**, the webhooks they need from you, a **self-validation checklist**, then you email their POS support to review and schedule a **testing demo call** before they certify you.

## The flow, end to end

```
Zomato / Swiggy customer -> aggregator -> UrbanPiper -> [webhook] -> JAMANVAAR Cloud API
                                                                     |  verify, find restaurant by store code
                                                                     |  map dishes to our menu
                                                                     |  create the order once (idempotent)
                                                                     v
                                                     POS badge "Zomato" / "Swiggy", KDS ticket, beep
Kitchen taps Accepted / Ready -> Cloud API -> UrbanPiper status call -> aggregator -> customer and rider
Restaurant sells out a dish   -> Cloud API -> UrbanPiper item-availability call -> hidden on the apps
```

## Setup, step by step

### A. Business and paperwork (start now, it is the slow part)
1. Apply to UrbanPiper's POS partner programme, as a **downstream POS partner**. Ask for sandbox access.
2. Agree the commercial terms: who pays UrbanPiper (usually the restaurant, per store per month) and whether JAMANVAAR takes a share.
3. Restaurants need their own aggregator listings on Zomato and Swiggy. UrbanPiper's team connects them.

### B. Build (this repo), in this order
1. **Aggregator settings in Restaurant Admin**: *Online ordering → Zomato / Swiggy*. The owner enters the **UrbanPiper store code** (and any API credentials UrbanPiper issues). Stored only on the server, encrypted, never in the browser or a terminal.
2. **Inbound webhook**: `POST /api/v1/aggregators/urbanpiper/orders`. Verify the request as UrbanPiper specifies (a shared secret or signature; use whichever they give, and reject anything else). Find the restaurant and branch from the store code. Reject an unknown store code.
3. **Menu mapping**: give every JAMANVAAR dish a stable **reference id** and use it as the item id in the catalogue push. Incoming order lines are matched by that id. A line that matches nothing must not be silently dropped: the order is created flagged **"needs attention"**, with the line's own name and price, and the counter is told.
4. **Create the order once**: key on the aggregator order id. Repeats change nothing. The order goes through the same server-order path QR orders use, so it reaches POS and KDS in about a second.
5. **Money**: the aggregator collects payment, so the order is marked **paid** with method *Aggregator (Zomato/Swiggy)* and the aggregator's commission is recorded separately, so the daily cash and card totals are not inflated by it. Reports show aggregator sales as their own line.
6. **Accept quickly**: aggregators cancel orders that are not accepted within a few minutes. Offer **auto-accept** (default on for aggregators) with a prep-time setting, and a sound and red badge if manual.
7. **Status back to UrbanPiper**: acknowledged when accepted, food ready when the KDS marks it ready, dispatched or completed as your flow allows. Handle their failures with a retry queue and an alert; never lose a status.
8. **Cancellations and changes from the customer**: the aggregator status webhook cancels the order. If the kitchen has already started, show it loudly on POS and KDS and record the loss (this feeds the loss report).
9. **Menu and availability push**: publishing the menu pushes the catalogue; a dish going out of stock (manual or automatic) pushes an item-off call. A **Pause online orders** switch in Restaurant Admin turns the store off at UrbanPiper.
10. **Reconciliation**: a daily list of aggregator orders received vs completed vs cancelled, per store, so the owner can compare it with the aggregator's payout statement.

### C. Certify
1. Run the checklist in the sandbox (new order, accept, ready, cancel by customer, cancel by restaurant, item off, store off, duplicate webhook, bad store code).
2. Book the demo call. Fix what they find.
3. Go live with **one pilot restaurant**, watch it for a week, then open it to others.

## Risks to plan for
- **Late acceptance** loses orders and hurts the restaurant's ranking: make acceptance automatic by default.
- **Unmapped dishes**: the most common real-world failure. Show a clear "unmapped items" screen and warn at publish time.
- **Tax and packaging charges** on aggregator orders differ from dine-in: record them as given by the aggregator instead of recalculating.
- **Duplicated or delayed webhooks**: idempotency and a status-retry queue are not optional.
- **Support load**: a restaurant that cannot see why an aggregator order failed will call you. Keep a per-order log of what was received and sent.

## What to decide with UrbanPiper on the first call
1. Sandbox access and the exact webhook list they require from you.
2. How webhooks are authenticated.
3. Whether the catalogue push is per store or shared, and the reference-id rules.
4. Their pricing for the restaurant and for you.
5. Their retry behaviour when your endpoint is down.
