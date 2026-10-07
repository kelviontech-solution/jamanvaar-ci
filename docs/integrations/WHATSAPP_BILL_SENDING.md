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
