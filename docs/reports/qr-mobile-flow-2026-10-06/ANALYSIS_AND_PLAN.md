# QR mobile flow investigation before implementation

2026-10-06. The supplied documents describe the requested end-to-end flow; their suggested examples are not proof of current behaviour.

Confirmed live blank-page cause (read-only production GETs): `/q/qa_readonly_token_12345` returns the QR customer HTML, whose script is `/assets/index-BqaCms6k.js` and stylesheet is `/assets/index-CcsfJAOu.css`. Both root asset URLs return HTTP 404 HTML. The same files under `/q/assets/` return HTTP 200 JavaScript/CSS. Vite currently builds with base `/`, while nginx routes only `/q/` to the QR customer container and routes `/` to Super Admin. The QR customer React app therefore never mounts on a scanned URL. The public API itself responds correctly to an unknown token with JSON 404 QR_NOT_FOUND. No production orders/payments were created to investigate this.

Confirmed functional gaps: QR order schema accepts CASH_AT_COUNTER only; QR settings explicitly reject online payment; customer checkout hardcodes counter payment. Existing Razorpay PaymentsService already supports hosted payment links for WhatsApp and verified webhook/reconciliation settlement, and must be reused. Current public status hides payment state and shows no receipt/items; page restoration deletes an existing order reference on any network error. Browser navigation does not represent screens. Item pricing is authoritative and published QR menus already exist; existing order synchronization generates branch KOTs and realtime wake-ups, so those mechanisms should be retained.

Implementation plan:

1. Correct QR asset base and deep-link deployment; add visible boot/error fallbacks and validate production-like /q/ paths with built assets.
2. Reuse the payment service/gateway for a QR hosted mobile payment link. Store pending online orders as DRAFT in the existing SyncedOrder pipeline. Release them into the existing POS/KDS lifecycle only after verified payment. Reuse existing Order/PaymentTransaction tables; QR carries no kiosk-only 3% fee. Preserve manual settlement and Route-pending policy.
3. Add configured cash/online choices, payment return/status/retry handling, refresh recovery, receipt and explicit loading/error states to the existing mobile app. Fix request races, browser navigation and distinct customisation line identities. Keep public capabilities and server tenant/table/price checks.
4. Test mobile widths 360/375/390/412/430 and landscape, QR decode/deep-link/refresh, shared menu/modifiers/cart/quote, failed/pending/signed payment/webhook retries, POS/KDS/customer status, table/receipt and security against isolated test fixtures. Never use real payment credentials in automated tests.
5. Record exact evidence, results and deployment requirements. A physical Android/iPhone and real gateway transaction cannot be claimed without performing them; local browser emulation is labelled accurately.

Provider reference for hosted links and callbacks: https://razorpay.com/docs/api/payments/payment-links/ and Razorpay's official SDK reference https://github.com/razorpay/razorpay-node/blob/master/documents/paymentLink.md. Browser callback parameters are not payment proof; the server remains authoritative.
