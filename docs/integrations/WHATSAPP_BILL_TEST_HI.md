# WhatsApp bill test: "hi" -> sample bill (temporary testing aid)

Purpose: see exactly what a customer receives, without placing an order, without a Meta payment
method, and without the POS/kiosk. A listed phone sends **hi** to the business number and gets a
sample bill as plain text. Everything is **off by default** and removable in one step.

## What the customer receives (exact reply)

```
_KelvionTech Restaurant_
- - - - - - - - - - - -
Order  TEST-0001
10 Oct 2026, 03:30 PM
- - - - - - - - - - - -
Paneer Tikka x2  -  ₹500.00
Masala Dosa x1  -  ₹150.00
- - - - - - - - - - - -
Subtotal  -  ₹650.00
Tax  -  ₹32.50
_Total  -  ₹682.50_
- - - - - - - - - - - -
Paid via UPI
_Thank you, visit again_
```

`_text_` renders as italic in WhatsApp. The restaurant name is the restaurant's name in the WhatsApp
dashboard; the date is "now" in Asia/Kolkata. Real bills use the same layout (see below).

## Turn it ON (WhatsApp backend)

1. Set on the WhatsApp backend's environment (`backend/.env`, or the VM's compose env):
   ```
   JAMANVAAR_BILL_TEST_PHONES=<your own phone, 10 digits, e.g. 9XXXXXXXXX>
   ```
   Comma-separate several phones. Use the phone you will type "hi" **from** - not the business number.
2. Restart the WhatsApp backend.
3. From that phone, send `hi` to the business number (9428521735).
   The reply is the sample bill above instead of the industry menu. Free: it is a reply inside the
   customer-service window the "hi" just opened.

Only an exact `hi` (any case, spaces ignored) as a *text* message from a *listed* phone is intercepted.
Every other message and every other phone still reaches the normal bot unchanged.

## Turn it OFF / undo (any one of these)

| Way | How |
| --- | --- |
| Config only (preferred) | Delete `JAMANVAAR_BILL_TEST_PHONES` (or set it empty) and restart the WhatsApp backend. The hook is inert; nothing else changes. |
| Remove the code | `git revert 0c0743a` in the `whatsapp` repo (removes the hook, the sample formatter and its test). |
| Surgical | Delete `_answer_bill_test_hi` and its 3-line call in `backend/app/api/v1/routers/webhook.py`, and `JAMANVAAR_BILL_TEST_PHONES` in `backend/app/core/config.py`. |

Reverting does **not** touch real bill sending, the admin number setting, or the minimal layout of
real bills.

## Where it lives

| File | What |
| --- | --- |
| `whatsapp/backend/app/api/v1/routers/webhook.py` | `_answer_bill_test_hi`, called right after unsubscribe handling, before the demo/real bot |
| `whatsapp/backend/app/services/bill_sender.py` | `format_bill_text`, `sample_bill_text`, `is_bill_test_sender` |
| `whatsapp/backend/app/core/config.py` | `JAMANVAAR_BILL_TEST_PHONES` (default empty) |
| `whatsapp/backend/app/tests/test_bill_test_hi.py` | listed number gets the bill; others/other words untouched; off by default; non-text untouched |
| `kiosk/cloud/api/src/modules/notifications/receipt-whatsapp.service.ts` | `formatBill` - the real bill uses the same layout (keep the two in step) |

## Reproduce the exact reply later

1. Set `JAMANVAAR_BILL_TEST_PHONES`, restart (above).
2. Send `hi`.
That is all. To change the wording or layout, edit `format_bill_text`/`sample_bill_text` in
`bill_sender.py` (and `formatBill` in `receipt-whatsapp.service.ts` for real bills).

## Related

- `WHATSAPP_BILL_SENDING.md` - the real kiosk/POS bill flow, costs, the admin "send bills from" number.
- Real bills are plain text inside the 24h window (free) and fall back to the approved Utility template
  outside it (paid, needs a Meta payment method).
