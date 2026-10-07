# QR payment recovery and kitchen completion — 7 October 2026

The QR guest page now shows **Order completed** when KDS serves every remaining dish, independently of counter settlement. Anonymous online checkout omits the empty customer object rejected in the supplied Razorpay screenshot. The existing pending order can retry online checkout or switch to counter payment, without creating another order.

## Confirmed causes and changes

| Problem | Evidence | Change |
| --- | --- | --- |
| Razorpay rejects anonymous checkout | Screenshot reports faulty key `customer`; the gateway sent `customer: {}` when optional guest fields were blank. A request-level regression test verifies the actual outgoing JSON. | Omit an empty customer object; trim supplied names and normalize phone spacing. |
| Retry loses the distinction between rejection and an unknown provider result | Payment creation stored both cases as failed attempts with no link. | Record definite request rejection, retry the same payment reference, and recover ambiguous results before creating anything. Provider server errors remain ambiguous. |
| Cash fallback was unavailable after selecting online | The public API had only an online retry endpoint. | Add counter-payment conversion for the same order, gated by restaurant settings. Close an existing provider link before admitting the order to POS/KDS. An unreadable or unknown provider result blocks conversion. |
| Served order stays Ready for the guest | Kitchen updates sync each line to SERVED, but the guest response used only the overall order status. That status may remain READY until financial settlement. | Derive guest completion from all non-cancelled dish states. Financial settlement alone does not mark unserved food completed. |
| Guest status can be overwritten by an older response during payment changes | Status refresh and payment actions could overlap. | Guard payment actions synchronously and ignore a refresh started before a payment-method change. |

Counter conversion reserves the order while provider checks run outside a database transaction. Admission uses the existing sync sequence and branch realtime notification. A captured webhook racing the conversion wins: the payment stays verified and the order cannot be changed back to unpaid cash. Counter conversion preserves prices, quantities, QR reference and order identity.

## Verification

- **123 API tests**, using an isolated database, real auth/RLS/pricing and simulated provider responses: QR ordering, retry, provider JSON, cancellation, payment/webhook race, channel-payment and receipt regressions.
- **29 Playwright browser scenarios** using compiled QR, KDS and POS applications. These include Ready → Served → guest Completed, reload, counter conversion, online admission only after verified payment, cashier settlement, mobile widths, images and reconnect.
- **98 focused frontend/shared tests** passed; a further **54 Captain/service-message/kitchen checks** passed for the concurrent guest-help changes included in this push (some coverage overlaps).
- Production builds passed for API, QR Guest, POS, Restaurant Admin and Captain. Existing large-bundle warnings remain.

GitHub received the WhatsApp receipt update `94b0a337` during this work. It was merged without conflicts. The combined revision passed a further **51 payment/receipt API checks** and **17 e-bill/print-queue checks**, with backend, POS and Kiosk production builds checked again. These additional checks overlap the earlier suites. See [MERGED_API_RESULTS.json](MERGED_API_RESULTS.json).

See [API_RESULTS.json](API_RESULTS.json), [BROWSER_RESULTS.json](BROWSER_RESULTS.json), [completed guest screen](evidence/kds-served-guest-completed.png) and [counter conversion](evidence/online-switched-counter.png).

The guest screen retains its existing five-second status refresh plus focus/visibility refresh. Expected kitchen-status visibility is therefore up to one refresh interval plus network latency; these local checks do not measure AWS latency. The failed initial browser attempt used the normal production API configuration with a disposable QA QR token; the passing run used the documented isolated API build setting. The normal QR build was restored afterward.

## Deployment and live-payment limits

These changes require the backend and QR Guest frontend to be deployed from this revision. Keep the existing HTTPS public origin and QR return URL, configured Razorpay credentials, verified webhook secret, active restaurant collection connection and online-payment setting. No production configuration or customer payment was changed during testing.

The flow continues through Razorpay hosted checkout. The guest chooses UPI and an available payment app there; the app never fabricates a payment result or marks payment paid from a redirect. Real merchant-account UPI availability and a physical Android/iOS app switch were **not verified** by desktop browser automation.

Provider references: [standard payment-link payload](https://razorpay.com/docs/api/payments/payment-links/create-standard/), [cancel an unpaid link](https://razorpay.com/docs/api/payments/payment-links/cancel-standard/), [UPI intent on mobile web](https://razorpay.com/docs/payments/payment-methods/upi-intent/mobile-web/).
