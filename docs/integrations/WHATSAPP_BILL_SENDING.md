# WhatsApp bill sending (POS + kiosk)

A customer can get their bill on WhatsApp from the kiosk's post-order screen ("WhatsApp Bill") or from the POS receipt modal ("WhatsApp"). The guest/cashier only types a 10-digit mobile number (digits only, enforced in the UI and on the server).

## Flow

```
kiosk / POS  --POST /api/v1/receipts/whatsapp {orderId, phone}-->  cloud/api (device-authenticated)
cloud/api    builds the bill from its OWN order rows (never client text)
cloud/api    --signed POST /api/v1/webhooks/jamanvaar/send-bill-->  product/whatsapp
product/whatsapp  sends from the restaurant's own connected Meta number
```

Signing is the same HMAC scheme as the rest of the connector (`JAMANVAAR_SERVICE_SECRET`, identical on both servers).

## Behaviour a person will meet

| Situation | Result |
| --- | --- |
| Valid number, customer messaged the restaurant in the last 24h | Plain-text bill, **free** |
| Valid number, customer never messaged / window closed | Approved **template** is sent (see below); if no template is configured: "no bill message template is set up" |
| Letters / short number / not starting 6-9 | Refused in the UI; also refused by the API (400) |
| Order placed seconds ago, not synced yet | Client retries up to 4 times, ~2.5s apart, then shows "wait a few seconds and try again" |
| Restaurant turned "WhatsApp receipts" off in receipt settings | 400 "WhatsApp bills are turned off by this restaurant" (tile also hidden on kiosk) |
| Online order that never paid / cancelled cash order | 400, nothing sent |
| WhatsApp service down / not configured | 503 with a plain message |
| Restaurant has no Meta number connected | "This restaurant has no WhatsApp number configured yet" |

## Cost (Meta, India, per delivered message - verify on Meta's current rate card)

- Inside the 24h customer-service window: free-text bill = **free**.
- Outside it: a **utility** template, about **Rs 0.115** per message (volume tiers reduce this).
- Do **not** create the bill template as *Marketing* (about Rs 0.86 each) - choose category **Utility**.

## Production setup

1. cloud/api: `WHATSAPP_CONNECTOR_BASE_URL` = URL of the WhatsApp backend; `JAMANVAAR_SERVICE_SECRET` identical on both servers.
2. WhatsApp backend: `JAMANVAAR_SERVICE_SECRET`; the restaurant connected (key pasted) with its Meta number + token saved.
3. For customers outside the 24h window, create this template in Meta (category **Utility**, language `en`), name it e.g. `bill_receipt`, and set `JAMANVAAR_BILL_TEMPLATE_NAME=bill_receipt` (and `JAMANVAAR_BILL_TEMPLATE_LANGUAGE` if not `en`) on the WhatsApp backend:

   ```
   Thank you for dining with us! Your bill for order {{1}} (ref {{2}}) is {{3}}. Show this message at the counter if you need your invoice.
   ```
   Body takes exactly three variables, in this order: order number, reference, total.

## Choosing the sending number (Receipts tab)

Restaurant/Kiosk Admin → **Receipts** → *WhatsApp number for customer bills*. The admin types a 10-digit mobile number (digits only) and presses **Save & check**.

- The number is stored server-side only (one `SyncedEntity` row of type `WHATSAPP_BILL_SETTINGS`, deliberately not in `SYNCABLE_ENTITY_TYPES`, so no device can read or write it).
- The cloud API asks the WhatsApp service (`POST /webhooks/jamanvaar/bill-number`) whether that number is a real sender on **this restaurant's own** Meta account. Typing a number cannot create a Meta sender; it can only select one that Meta already knows.
- On every bill, the saved number is sent as `fromNumber`; the WhatsApp service re-resolves it (10-minute cache) and refuses another business's sender.
- No number saved = the restaurant's default connected number (previous behaviour).
- Only an owner or manager can change it.

| Status shown | Meaning / what to do |
| --- | --- |
| Ready | Number found on the restaurant's Meta account; bills go from it |
| Not on your WhatsApp Business account yet | Add + verify the number in Meta WhatsApp Manager, press *Check again* |
| Not fully connected / token rejected | Reconnect the restaurant's WhatsApp account in the WhatsApp dashboard |
| Belongs to another business | Use a number under the restaurant's own account |
| Could not check right now | WhatsApp service/Meta unreachable; *Check again* later |

The panel also shows the bill template state (approved / pending / missing / rejected) with a one-click **Create bill template** (submits the Utility template below to Meta).

## Making it painless for future customers to connect their number

What is already done: pasting the key connects the restaurant; typing a number verifies it against Meta; the bill template is created with one button.

What removes the remaining headache (in order of payoff):

1. **Meta Embedded Signup** (become a Meta *Tech Provider*). The customer clicks "Connect WhatsApp", logs in with Facebook, picks or creates their WhatsApp Business Account, verifies the number by OTP, and our platform receives the WABA id, phone number id and a token automatically. This replaces every manual Meta step (WABA creation, number add, token copy-paste). Needs a one-time Meta app review: Business Verification plus `whatsapp_business_management` / `whatsapp_business_messaging` advanced access. Not built yet.
2. **Coexistence** (offered through Embedded Signup): a restaurant can keep using the WhatsApp Business *app* on its phone with the same number while the API sends bills. Without it, a number used on the app must be removed from the app first, which is the most common customer objection.
3. **Automatic template**: create the Utility bill template the moment a number turns READY (today it is one click).
4. **Fallback sender**: until a restaurant connects its own number, bills can go from a platform-owned number (shows the platform's name). Good for first day, not for branding.
5. **Pre-flight checklist in the dashboard**: number not already on another WABA, display name approved, payment method on the Meta account, two-step PIN known.
