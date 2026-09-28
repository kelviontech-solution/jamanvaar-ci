# WhatsApp ordering: how the chatbot connects to JAMANVAAR POS, KDS and Restaurant Admin

Written 28 Sept 2026. This is a design and a prompt. **No endpoint has been built in this repo for it yet.** Section 9 lists exactly what this repo will need, so you can say "go" when the chatbot side is ready.

Related: [WHATSAPP_API_KEY_GUIDE.md](WHATSAPP_API_KEY_GUIDE.md) (how a restaurant gets the WhatsApp key, in plain language) and [URBANPIPER_ZOMATO_SWIGGY_FLOW.md](URBANPIPER_ZOMATO_SWIGGY_FLOW.md).

---

## 1. What you want, in one paragraph

A restaurant owner opens **Restaurant Admin**, goes to *Online ordering → WhatsApp*, types in the WhatsApp key for their number, and presses **Connect**. From then on:

- a customer who messages that number sees the restaurant's real, current menu (the same menu as POS, so a dish that is sold out is not offered);
- they build a cart, pay, and get a confirmation **inside WhatsApp**;
- the paid order appears on the **POS** (with a "WhatsApp" badge and a sound) and as a ticket on the **KDS**, like any other order;
- when the kitchen marks it ready, the customer gets a WhatsApp message.

## 2. The three parts, and who owns what

| Part | Where it lives | Owns |
| --- | --- | --- |
| **Restaurant Admin / POS / KDS / Cloud API** | this repo | menu, prices, tax, orders, payments, who the restaurant is |
| **Chatbot service** | your other repo | the WhatsApp conversation, talking to Meta |
| **Meta WhatsApp Cloud API** | Meta | delivering messages to and from the customer's phone |

Rule that keeps this simple and safe: **this repo is the source of truth for the menu, the price and the order. The chatbot never invents a price and never keeps its own menu.** It asks this repo, shows what it is told, and passes the customer's choices back.

## 3. How "enter the key in Restaurant Admin and it connects" works

There are **two different secrets**. People mix them up, so keep them apart.

| Secret | Who makes it | Where it is typed | Where it is stored |
| --- | --- | --- | --- |
| **A. WhatsApp token** (plus Phone Number ID and Business Account ID) | Meta, for that restaurant's number | Restaurant Admin, once, by the owner | The chatbot service's database, **encrypted**. Nowhere else. |
| **B. Service secret** between this repo and the chatbot | You, once | Nobody types it. It is an environment variable on both servers | Server env only |

### The connect flow (secret A)

1. Owner opens *Restaurant Admin → Online ordering → WhatsApp* and pastes **Phone Number ID**, **WhatsApp Business Account ID** and the **token**.
2. Restaurant Admin sends it over HTTPS to **this repo's cloud API** (`POST /api/v1/restaurant/whatsapp/connect`, later). The browser never talks to Meta and never keeps the token.
3. The cloud API forwards it, signed with secret B, to the chatbot service (`POST /internal/tenants/connect`).
4. The chatbot service **checks it with Meta** by calling `GET https://graph.facebook.com/<version>/<phone-number-id>?fields=display_phone_number,verified_name,quality_rating` with the token. If Meta says no, the owner sees a plain reason ("That token does not belong to this number", "The token has expired") and nothing is saved.
5. If Meta says yes, the chatbot service: encrypts and stores the token; subscribes the app to that business account (`POST /<waba-id>/subscribed_apps`) so Meta sends this number's messages to the chatbot's webhook; records `phone_number_id → restaurantId`.
6. It replies with only safe facts: `{ connected: true, displayPhone: "+91 98xxx xxx12", verifiedName: "Sharma Dhaba", quality: "GREEN" }`. **The token is never sent back.** Restaurant Admin shows "Connected to +91 98xxx xxx12" with **Disconnect** and **Send a test message** buttons.

Later, replace the paste step with Meta's **Embedded Signup** (a "Connect WhatsApp" button and a Facebook login pop-up, no copying of keys). It needs your company to be a Meta Tech Provider, so start with paste and move later. Nothing else in this design changes.

### Why the token lives only in the chatbot service

The chatbot is the only thing that talks to Meta, so it is the only thing that needs the token. Every extra place a token is stored is another place it can leak. This repo keeps only the status ("connected", the display number). If this repo is ever breached, no WhatsApp token is in it.

## 4. The order flow, step by step (with the reason for each step)

```
Customer's WhatsApp            Chatbot service                  This repo (Cloud API)              POS / KDS
      |  "Hi"                        |                                   |                             |
      |----------------------------->|  Meta webhook (signed)            |                             |
      |                              |-- which restaurant? (phone_number_id)                            |
      |                              |-- GET menu (versioned) ---------->|                             |
      |  menu list / buttons         |<------ menu + live availability --|                             |
      |<-----------------------------|                                   |                             |
      |  picks dishes                |                                   |                             |
      |----------------------------->|-- POST quote (cart) ------------->|                             |
      |  "Total Rs 428, Pay?"        |<-- exact server price ------------|                             |
      |<-----------------------------|                                   |                             |
      |  taps Pay                    |-- POST checkout ----------------->|-- create Cashfree order     |
      |  payment link                |<-- payment link ------------------|                             |
      |<-----------------------------|                                   |                             |
      |  pays in UPI app             |                                   |                             |
      |                              |                Cashfree webhook ->|-- verify signature + amount |
      |                              |                                   |-- create the order (once) ->| appears, beep
      |  "Order #W-104 confirmed"    |<-- order.confirmed (signed) ------|                             |
      |<-----------------------------|                                   |            kitchen taps Ready
      |  "Your order is ready"       |<-- order.status (signed) ---------|<----------------------------|
      |<-----------------------------|                                   |                             |
```

### Reasons for the design choices

1. **The menu is pulled from this repo, not copied.** The restaurant already edits the menu in one place. If the chatbot kept a copy, the two would drift apart, and a customer would pay for a dish that is finished. The chatbot asks for the menu with a version number, keeps it for reuse, and this repo tells it "menu changed" (a signed `menu.published` call) so it fetches again. Sold-out is checked at **quote** time as well, so a dish that ran out while the customer was deciding is caught before they pay.
2. **The price is computed here, in whole paise, from the published menu.** The customer's phone and the chatbot only say "2 of dish A, with option B". This is the same rule the QR ordering already follows, and it is why nobody can pay ₹1 for a ₹400 dish.
3. **The payment is created and confirmed here, not in the chatbot.** Reasons: (a) this repo already has the verified Cashfree webhook, the amount check and crash-safe order creation; (b) the restaurant's money goes through **Cashfree Easy Split** to that restaurant's own vendor account, which only works from the platform's Cashfree account; a separate Cashfree account in the chatbot cannot split to the restaurant; (c) the order is created only after this repo has verified the payment itself, so a wrong or forged "paid" message from the chatbot cannot create a free order. If you keep the chatbot's own Cashfree for now, see section 8, "Option B", and its risks.
4. **The order is created exactly once**, keyed on the payment id. Cashfree and the chatbot may both retry; a repeat changes nothing.
5. **The order reaches POS and KDS through the same path a QR order uses** (server order, sequence number, live push to devices). That is why it shows up on the counter within a second and needs no special screen.
6. **Status goes back to the customer through a signed call from this repo to the chatbot.** The kitchen taps Ready on the KDS, this repo sees the change, tells the chatbot, the chatbot sends the WhatsApp message.

## 5. What the customer experiences in WhatsApp

Meta's rules shape the design:

- A customer's message opens a **24-hour window** in which the chatbot can reply freely. Outside it, only **pre-approved templates** can be sent. Order-ready and order-confirmed messages are usually inside the window, but design **utility templates** for "order confirmed", "order ready", "refund issued" anyway, and submit them early because approval takes time.
- A **list message** shows up to 10 rows, and **reply buttons** up to 3. A menu with 80 dishes must be shown as category, then dishes, page by page. The chatbot should render the categories from the menu response, not from a fixed list.
- Meta also offers a **product catalogue** with a native cart. It is a good later upgrade (this repo would push the menu to the catalogue). Start with lists; it works with no catalogue approval.
- Confirm current pricing on Meta's pricing page before you promise a price to restaurants. Charges depend on the message category and have changed over time.

Conversation states the chatbot needs:

`GREETING → CHOOSE_TYPE (pickup / delivery / dine-in with table number) → BROWSE → CUSTOMISE (options) → CART → ADDRESS (delivery: WhatsApp location or typed address) → CONFIRM (server quote) → PAY → PAID → STATUS UPDATES → FEEDBACK`

Cases to handle on purpose:

| Situation | What should happen |
| --- | --- |
| Restaurant is closed, or online orders are paused in Restaurant Admin | Polite message with opening time; no cart |
| A dish sold out while in the cart | Quote says which dish; offer to remove it or pick another |
| The menu changed price after they started | Quote returns `MENU_CHANGED`; show the new price and ask again |
| Payment link expires unpaid | "Your link expired"; the cart is kept for a while |
| Customer pays after the link expired, or twice | This repo accepts the first, refunds the rest automatically |
| Customer wants to cancel before the kitchen starts | Cancel and refund (Restaurant Admin already has refunds) |
| Customer wants a person | "Talk to staff" sends a message to POS; the chatbot stops replying for that chat |
| Same WhatsApp message delivered twice by Meta | Ignore repeats (dedupe on the message id) |
| Customer writes Hindi, Gujarati or English | Detect and reply in the same language; keep dish names as the restaurant wrote them |

## 6. Security rules (short and non-negotiable)

- **Verify every Meta webhook** with the app secret (`X-Hub-Signature-256`) on the raw request body before doing anything else. Reject anything unsigned.
- **Tenant is decided by `phone_number_id` in Meta's own payload**, never by anything the customer types.
- **The token is encrypted at rest** (AES-256-GCM, key in the server environment or a secrets manager), never logged, never returned by any API, never sent to a browser, kiosk, POS or KDS. Rotation = paste a new one.
- **Calls between this repo and the chatbot are signed** (HMAC-SHA256 over method, path, timestamp and body, secret B). Reject anything older than 5 minutes or already seen. Keep an allow-list of the other side's IP if hosting allows.
- **Idempotency everywhere**: WhatsApp message id, payment id, order id.
- **Personal data**: store only what the order needs (name, phone, address), keep a retention period, honour "delete my data".
- **Rate limit per customer number** so one number cannot flood the kitchen.

## 7. How the menu stays in sync (and stays live)

- Source: the restaurant's **published** menu in this repo. Publishing is already how QR ordering gets its menu, so WhatsApp gets the same, with the same branch rules and prices.
- Chatbot reads `GET /api/v1/channels/menu?branchId=…` (later). The response has a **menu version** and an **ETag**; the chatbot sends `If-None-Match` and gets `304` when nothing changed.
- **Live availability** (a dish running out of stock, sold-out by the kitchen) is a small extra list in the same response, refreshed every few seconds, so the chatbot hides a finished dish even between publishes. (In this repo, the QR menu has the same gap today: it reads the published snapshot only. Fixing it for QR fixes it for WhatsApp too; it is on the work list in section 9.)
- Push, not just poll: on publish, this repo calls the chatbot's `POST /webhooks/menu-published` so it refreshes at once.

## 8. Payment options

**Option A (recommended): this repo owns the payment.** The chatbot calls `checkout`; this repo creates the Cashfree order (with Easy Split to the restaurant's vendor), returns a payment link; Cashfree's webhook comes to this repo; this repo creates the order. Strongest: server price, verified webhook, split works, refunds work from Restaurant Admin and Super Admin.

**Option B (works today, weaker): the chatbot keeps its own Cashfree** and calls this repo with "paid" plus the payment reference. Then this repo cannot verify the payment by itself (the money is in a different Cashfree account), so it would have to trust the chatbot's word. If you choose B: authenticate the calls with secret B, require the amount to equal the server quote to the paisa, refuse when the payment reference has been used before, and keep a daily reconciliation list. You lose Easy Split and the shared refund screen. Treat B as a stepping stone.

## 9. What this repo needs (built after you say go)

Nothing below exists yet. It is listed so the two projects agree on the contract.

Cloud API (all signed with secret B, except the first group):

- Restaurant Admin (device login): `POST /api/v1/restaurant/whatsapp/connect`, `GET …/status`, `POST …/disconnect`, `POST …/test-message`, `PUT …/settings` (pause online orders, prep time, delivery radius and charge, auto-accept).
- Channel: `GET /api/v1/channels/menu`, `POST /api/v1/channels/quote`, `POST /api/v1/channels/checkout`, `GET /api/v1/channels/orders/:id`.
- Payments: reuse the Cashfree order, webhook and fulfilment code, extended so the order can come from a channel rather than a kiosk.
- Outbound to chatbot: `menu.published`, `order.confirmed`, `order.status` (accepted, preparing, ready, out for delivery, completed, cancelled, refunded).

POS and KDS:

- New source **ONLINE** (WhatsApp) with a badge, sound, and the customer's name, phone and, for delivery, address.
- Pending desk: a paid order goes straight to the kitchen if *auto-accept* is on; otherwise it waits for a counter person to accept or reject (reject = automatic refund).
- Ticket identity for these orders is derived from the order (as it already is for QR), so two KDS screens never make two different tickets.
- KDS shows pickup time / delivery and a "WhatsApp" label.

Not started, and worth deciding early: **entitlement** (which plan includes WhatsApp ordering) and **usage limits**. Same pattern as QR ordering's plan entitlement.

## 10. The chatbot repo's build plan (phases)

1. **Foundation**: webhook receiver with signature check, tenant table (`restaurantId`, `phoneNumberId`, encrypted token, status), message dedupe, send-message helper, health endpoint.
2. **Connect flow**: `POST /internal/tenants/connect` (validate with Meta, subscribe, save), disconnect, test message. Signed-call verification for secret B.
3. **Menu**: fetch, ETag cache, category and dish lists, options, cart in a session store (Redis or the database), language.
4. **Quote and checkout**: call this repo, show the exact total, send the payment link.
5. **Order updates**: receive `order.confirmed` and `order.status`, send templates or in-window messages, feedback ask after completion.
6. **Edge cases and staff handoff**: the table in section 5.
7. **Hardening**: rate limits, retention, alerting (token expired, quality rating dropped, webhook failing), load test.

Acceptance tests to insist on: a forged webhook is rejected; a repeated webhook creates one message; a dish that is sold out cannot be ordered; a wrong amount never creates an order; a paid order appears in POS and KDS within 2 seconds; a token that Meta rejects is reported to the owner in words.

---

## 11. Prompt to paste into the chatbot repo

> You are working in the WhatsApp ordering chatbot project. It is a multi-tenant service: many restaurants, each with their own WhatsApp number, all served by one deployment. It works with the JAMANVAAR restaurant platform, which owns the menu, prices, orders and payments. Read the whole task before writing code. Do not change how the existing conversation works until you have read it; extend it.
>
> **Ground rules**
> 1. The JAMANVAAR Cloud API is the only source of the menu, the price and the order. Never keep a menu of your own and never compute a price. The customer's chat only says which dish ids and option ids and how many.
> 2. Store each restaurant's WhatsApp token **encrypted at rest** (AES-256-GCM, key from environment). Never log it, never return it from any endpoint, never put it in a message or an error.
> 3. Verify every Meta webhook with `X-Hub-Signature-256` (HMAC-SHA256 of the raw body with the app secret) before parsing it. Reject unsigned or wrongly signed requests with 401 and do no work.
> 4. Decide the restaurant from `entry[].changes[].value.metadata.phone_number_id`. Never from customer text.
> 5. Deduplicate incoming messages on the WhatsApp message id and outgoing work on an idempotency key. Meta retries; a retry must change nothing.
> 6. Calls to and from JAMANVAAR are signed with HMAC-SHA256 over `METHOD\nPATH\nTIMESTAMP\nSHA256(BODY)` using `JAMANVAAR_SERVICE_SECRET`, sent as headers `X-Signature` and `X-Timestamp`. Reject a request older than 5 minutes or one whose signature was already seen.
>
> **Build, in this order (commit after each)**
> 1. Tenant store: table `tenants(restaurant_id, phone_number_id UNIQUE, waba_id, token_encrypted, display_phone, verified_name, status, connected_at)`. Encryption helper with tests.
> 2. `POST /internal/tenants/connect` (signed by JAMANVAAR). Body: `{restaurantId, phoneNumberId, wabaId, accessToken}`. Steps: call `GET /{phoneNumberId}?fields=display_phone_number,verified_name,quality_rating` with the token; on any Meta error return `{ok:false, reason}` with a plain-language reason and save nothing; on success call `POST /{wabaId}/subscribed_apps`, save the tenant, and return `{ok:true, displayPhone, verifiedName, quality}`. Never return the token. Also `POST /internal/tenants/disconnect`, `POST /internal/tenants/test-message`.
> 3. Meta webhook: `GET /webhooks/meta` answers the verification challenge with `WHATSAPP_VERIFY_TOKEN`; `POST /webhooks/meta` checks the signature, resolves the tenant, dedupes on message id, hands the message to the conversation engine, and answers 200 quickly (do the work in a queue).
> 4. Conversation engine as an explicit state machine with sessions stored outside process memory (Redis or the database, key = `phone_number_id + customer_wa_id`, expiry). States: GREETING, CHOOSE_TYPE, BROWSE, CUSTOMISE, CART, ADDRESS, CONFIRM, PAY, PAID. Every state must accept "cancel", "menu", "help", "talk to staff".
> 5. Menu client: `GET {JAMANVAAR}/api/v1/channels/menu?restaurantId=…` with `If-None-Match`; cache by ETag; refresh on `POST /webhooks/menu-published` (signed). Render categories then dishes as WhatsApp list messages (max 10 rows per list, paginate with a "More" row); reply buttons for at most 3 choices. Skip any dish the response marks unavailable. Support veg/non-veg labels and options (required groups must be answered before "Add").
> 6. Quote and pay: `POST {JAMANVAAR}/api/v1/channels/quote` with the cart, show the exact `total` returned; on `MENU_CHANGED` or an unavailable dish show the change and ask again. Then `POST …/channels/checkout` with an idempotency key; send the returned payment link. Do not create an order and do not mark anything paid yourself.
> 7. Status: `POST /webhooks/order-confirmed` and `POST /webhooks/order-status` (signed). Send "confirmed" with the order number and estimated time, then updates for accepted, preparing, ready (pickup) or out for delivery, completed, cancelled and refunded. Use free-form replies inside the 24-hour window and approved **utility templates** outside it (create the template definitions in a file and a script that submits them).
> 8. Edge cases: closed or paused restaurant (the menu response says so), expired payment link, customer cancels before acceptance, customer wants staff (send the signed "handoff" call and stop auto-replies for that chat), languages English/Hindi/Gujarati, location messages for delivery.
> 9. Hardening: per-customer rate limit, retention and deletion of personal data, alert when Meta reports the token invalid, a health endpoint, structured logs without personal data or secrets.
>
> **Configuration** (environment only): `META_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `TOKEN_ENCRYPTION_KEY`, `JAMANVAAR_BASE_URL`, `JAMANVAAR_SERVICE_SECRET`, `GRAPH_API_VERSION`.
>
> **Tests you must write**: unsigned webhook rejected; repeated message id handled once; token never appears in any response or log line; a Meta 401 during connect saves nothing and returns a plain reason; the state machine handles every state with "cancel"; a dish flagged unavailable is never offered; a total shown to the customer equals the `total` from the quote; signed-call replay is refused.
>
> Where JAMANVAAR's endpoints are not built yet, code against the contract above with a stub server in tests, and list every assumption you made so it can be compared with the real endpoints later. Report back with: what was built, what was stubbed, the exact request and response shapes you used, and anything in the contract that you found unworkable.

## 12. Answers to your earlier questions, in short

- **How do I make the API key?** You do not invent it. Meta issues it; see [WHATSAPP_API_KEY_GUIDE.md](WHATSAPP_API_KEY_GUIDE.md).
- **How does the restaurant "enter the key and get connected"?** Section 3.
- **How does the menu stay in sync?** Section 7.
- **How does the paid order reach POS and KDS?** Sections 4 and 9.
- **How does the customer see it in WhatsApp?** Sections 4, 5 and step 7 of the prompt.
