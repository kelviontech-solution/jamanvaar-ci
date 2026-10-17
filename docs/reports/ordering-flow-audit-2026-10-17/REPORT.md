# POS, customer Kiosk and scanned-QR ordering: flow audit

Date: 17 October 2026. Audit only; application fixes have not been applied in this task.

The basic ordering and collection path works, but the three channels do not enforce the same ordering rules. The most urgent issues are incomplete dish selections reaching the kitchen, carts being replaced without protection, checkout information being lost, and inconsistent loyalty/payment recovery behaviour. Adding more pages would not solve these problems.

## What was checked

- Production-mode Vite builds of POS, Kiosk and QR, opened in headless Chrome against an isolated, real local Nest API and test database.
- One disposable restaurant/branch, an activated POS and Kiosk, one real table QR, a cashier, a customer with 200 points, and an active ₹100-for-150-points reward.
- An 18-dish catalogue, including a meal with a required bread choice and a dish whose configured quantity is 2–3.
- POS menu, cart, notes, customer attachment, discounts, held orders, reload recovery, payment, shift opening, channel orders and receipt.
- Kiosk welcome, language, order type, search, menu, cart, coupon entry, cash checkout, confirmation and receipt email entry.
- QR menu, customization, quantity controls, cart, checkout, menu-change handling, quote failure, actual cash-at-counter order, status restoration and selected mobile states.
- POS desktop at 1440×1000 and payment at 1366×768; Kiosk portrait at 1080×1920; QR at 390×844 and a status view at 360×740.

There are **29 recorded scenario observations** in the six journey files below. They include working behaviour as well as failures; this is not a claim that every button, optional feature, device or integration was tested. The source review found additional paths that need targeted acceptance tests.

Baseline HEAD: `1fbe9342ffb31a9dbc61275ca65341bb0950fcb8`, with the pre-existing dirty working tree preserved. See [source locations and hashes](SOURCE_INDEX.md).

## Evidence and confidence

| Evidence | What it contains |
| --- | --- |
| [POS journey](evidence/POS_JOURNEY.json) | 8 observations: selection, quantity, manual discount, rewards, hold/recall, recovery, shift guard and channel orders |
| [POS additional checks](evidence/POS_EXTRA.json) | 4 observations: chef notes, shift opening and actual Kiosk cash settlement |
| [Kiosk journey](evidence/KIOSK_JOURNEY.json) | 6 observations: touch input, selection, quantities and actual cash order |
| [QR journey](evidence/QR_JOURNEY.json) | 7 observations: customization, checkout persistence, failure recovery, ordering and new-tab recovery |
| [QR additional checks](evidence/QR_EXTRA.json) | 2 observations: merged quantity and cancellation copy |
| [Final checks](evidence/FINAL_CHECKS.json) | 2 observations: dietary recommendations and POS offline/reconnect |

**Browser** below means reproduced through the UI. **Controlled browser** means an API response was deliberately changed to reproduce a failure or state; it does not mean the external provider or kitchen produced that state. **Source** means a concrete implementation path was inspected but its full runtime consequence was not exercised.

P1 = address before wider restaurant rollout because it can affect order correctness, customer information, work preservation or collection decisions. P2 = important functional/recovery issue. P3 = clarity or efficiency improvement. These are product priorities, not security vulnerability scores.

## Ordering rules: the same dish behaves differently

| Rule | POS main menu | Customer Kiosk | Customer QR |
| --- | --- | --- | --- |
| Required bread choice before adding meal | Bypassed by main card quick-add | Bypassed by quick-add | Picker blocks Add until a choice is selected |
| Minimum quantity 2 | Adds 1 | Adds 1; accepted counter order | Individual picker starts at 2 |
| Maximum quantity 3 | Store quantity changes have no equivalent configured limit | Direct add/merge lacks equivalent configured limit | Individual picker enforces 3, but repeated additions merge beyond 3 |

The Kiosk actually submitted the meal with no bread choice and the minimum-two dish with quantity one. Both lines reached the canonical order and appeared in POS. The resulting ₹280 bill was then collected through POS. This is an order-validation problem, not just a missing visual prompt.

### Findings

| ID / priority | Gap and reproduction | Improvement and acceptance condition |
| --- | --- | --- |
| F01 · P1 · Browser | **Required choices can be bypassed in POS and Kiosk.** Tap “Build Your Thali” on the main POS card or Kiosk Add button. It enters the cart with no bread selection. The Kiosk submitted it this way. POS quick-service shortcuts already open customization, making the behaviour inconsistent even within POS. | Use one add-to-cart decision for every entry point. Open required choices automatically; validate again before KOT/payment/order ingestion. An incomplete dish must produce a clear action to finish its choices. Keep valid offline billing supported. |
| F02 · P1 · Browser + Source | **Configured quantity rules are not shared by POS/Kiosk.** A 2–3-portion dish enters both carts as quantity one; the Kiosk order was accepted. Direct-add/store paths also lack the matching configured cap. | Apply minimum, maximum and any supported increment rules consistently to add, merge, edit and submission. Show “Sold in quantities of 2–3” before the guest commits. Test both offline POS and server ingestion. |
| F03 · P2 · Browser | **QR repeated additions exceed the maximum.** Add three Twin Snack Plates twice. The merged line becomes six although its maximum is three. The server quote rejects it and disables checkout. | Clamp or block the merge using the dish limit, with an explanation. Preserve the server rejection as a final safeguard. A guest should not need to diagnose an invalid cart created by the Add buttons. |

Evidence: [POS selection](evidence/pos-required-choice.png), [Kiosk cart](evidence/kiosk-cart.png), [accepted Kiosk order](evidence/KIOSK_JOURNEY.json), [QR over-limit cart](evidence/qr-repeat-over-max.png).

## POS: cashier work preservation and collection

| ID / priority | Gap and reproduction | Improvement and acceptance condition |
| --- | --- | --- |
| F04 · P1 · Browser | **Recall replaces an unfinished cart without warning.** Hold a cart, start a second one, then recall the first. The second cart disappears with no save/hold/discard choice. | Automatically retain the current cart or offer “Hold current and open”, “Keep editing” and an explicit discard action. Never discard another guest's work merely by opening a held bill. |
| F05 · P1 · Browser | **Recall leaves the recovery draft pointing at the replaced cart.** After the sequence above, reload and Restore Order. The second cart returns rather than the recalled cart. | Persist the newly active cart and all context atomically after recall; retain the displaced one separately. Reload must restore the cart that was visibly being edited. |
| F06 · P1 · Browser storage + Source | **Order-wide chef notes are missing from recovery.** A saved note appears in the cart but is absent from the recovery snapshot; restore has no corresponding note field. | Include order-wide notes in the versioned draft, and persist when notes change. Test refresh, hold/recall and reconnect with the same instructions. |
| F07 · P1 · Browser | **Chef Notes editor carries an earlier guest's text into a new cart.** Save a note, clear the cart, add a new dish, and reopen Chef Notes. The old text remains in the textarea. | Reset/reinitialize editor state by active order/cart identity and open state. A new guest must start with a clean editor; an existing guest must retain their own note. |
| F08 · P1 · Source | **Opening another order for settlement can replace the active cart.** Live Orders and bill-request shortcuts call `loadOrderForSettlement`; it sets the cart directly without preserving unfinished work. The normal pending-payment guards do not protect the current cart. | Apply the same work-preservation guard to recall, table switching, bill requests and collection shortcuts. Test starting a walk-in bill, settling a QR bill, and returning to the walk-in bill. |
| F20 · P2 · Source | **Typing a partial tender can auto-allocate to a disabled payment method.** The direct amount editor chooses UPI after Cash, or Cash after another method, without checking enabled channels. Later settlement validation blocks an unsupported allocation. | Select an enabled alternative or leave an explicit remaining balance. In a cash-only branch, entering part of the cash must not invent a UPI allocation. |
| F21 · P2 · Source | **Printed receipt history is marked SENT before print completion.** Payment completion writes a PRINT receipt record with `deliveryStatus: 'SENT'`, then dispatches the print job. | Record queued/pending first and reconcile with actual print-job success/failure. A queue dispatch must not stand in for hardware success. Physical-printer acceptance is still required. |
| F22 · P2 · Browser + Source | **A POS receipt can label its terminal “Self-Order Kiosk”.** The offline POS sale's receipt did this. Shared receipt formatting maps any UUID terminal ID to that label, regardless of the app source. | Resolve the registered friendly terminal name and type. A POS sale should show its actual counter; a Kiosk sale should show its actual kiosk. Preserve internal IDs only for diagnostics. |
| F23 · P3 · Source | **Receipt auto-closes after six seconds unless a specific action handler marks interaction.** Reading or reviewing the receipt does not hold the screen open. | Make the timer clear/configurable, pause for focus or active tasks, and retain an obvious “Last receipt” shortcut. A cashier investigating printing should not lose their place. |
| F25 · P1 · Source | **A failed online-payment status check can fall through to manual settlement.** Live Orders checks a pending Kiosk UPI reference; a status-request exception is caught and the normal settlement screen is then opened. `completePayment` does not itself resolve that unknown external attempt. | Treat “could not verify” separately from “verified unpaid”. Provide retry/reconciliation and a controlled, audited exception path. Test a provider timeout followed by a late success before allowing another collection. **No duplicate charge was performed or demonstrated in this audit.** |

Evidence: [held-cart observations](evidence/POS_JOURNEY.json), [notes observations](evidence/POS_EXTRA.json), [offline POS receipt](evidence/pos-offline-receipt.png). Source anchors are in [SOURCE_INDEX.md](SOURCE_INDEX.md).

### What makes POS harder than necessary

- At 1366×768 the payment dialog's confirm action requires scrolling past the payment cards and amount sections. The open-shift message and loyalty panels add height. The action is reachable, but a busy cashier has too much to scan. Use a stable total/remaining/change summary and a sticky confirm footer; put split-by-guest and uncommon tenders behind clear secondary actions. [Screenshot](evidence/pos-payment-1366x768.png).
- Reward selection is offered in both cart and checkout. Keep the offer, but show one consistent selected/not-selected state and cost in points everywhere.
- The activated terminal can display its UUID and table T1 can appear as T-T1. Use the registered terminal label and normalize table labels once. [Channel orders](evidence/pos-channel-orders.png).
- Distinguish “Offline — saved here”, “Waiting to sync”, “Sync failed” and “Received by kitchen”. During the successful offline sale, the header showed SYNC ERROR while the footer said Local-first billing. That combination makes a working cashier question whether the bill was saved.

## Customer Kiosk: touch, loyalty and payment clarity

F01/F02 above also affect Kiosk.

| ID / priority | Gap and reproduction | Improvement and acceptance condition |
| --- | --- | --- |
| F15 · P1 · Source | **The guest phone-login code is generated and displayed on the same kiosk.** The current handler explicitly says no SMS gateway is configured and exposes the code in a toast. Entering it does not establish ownership of the phone number. | Use a real configured verification provider, or clearly offer staff-assisted/unverified contact entry without granting verified-account access. Staff approval currently protects redemption; that is useful but does not verify the guest's phone ownership. No points-draining exploit was tested. |
| F16 · P1 · Source | **Kiosk loyalty uses a different monetary rule from the reward catalogue.** It presents points as equal rupees and redeems up to `min(points, subtotal)`. The configured POS reward is ₹100 for 150 points. | Use the same server-authorized reward/valuation contract across channels, with explicit opt-in, eligible rewards, points cost and remaining points. Test earning, redemption, cancellation, refund and replay. Actual Kiosk redemption was not exercised here. |
| F17 · P2 · Source | **Online payment changes discount eligibility late in the journey.** The Kiosk online quote clears coupon/points/staff discounts and resets the order's discount amount. It warns in a toast, but the benefit the guest selected is no longer available after choosing online payment. | Decide eligibility before payment selection or present a blocking price-change review. Prefer one quote contract across supported tenders. Keep the current safeguard that avoids consuming an unapplied reward. No real online charge was tested. |
| F18 · P2 · Source | **Any online-order creation error can turn into “online unavailable”.** Transient failures and payment-account setup failures share the unavailable state; the catch path has no equivalent safe retry. | Separate connection failure, provider outage, account-not-ready and an existing attempt with unknown status. Retry using the same reference; reconcile before proposing counter collection. |
| F19 · P2 · Browser + Source | **Touch keyboard coverage is incomplete.** Search and receipt email have in-app keyboards, but coupon entry did not open one. Customization instructions are also a regular textarea without the matching keyboard integration. | Provide the themed keyboard for every guest-entered text field, appropriate numeric/email layouts, visible focus, clear/backspace and a Done action. Keep the field visible above the keyboard. The operating system's own touch keyboard was not tested. |

### What makes Kiosk harder than necessary

- The confirmation exposes kitchen ticket IDs, “Not printed”, reprint actions and “Add a printer in Restaurant Admin”. Those are staff tasks on a customer screen. Keep the token, collection location, amount due/paid and receipt actions prominent; route faults to Call Staff and a staff-only diagnostics view. [Screenshot](evidence/kiosk-confirmation.png).
- Welcome → language → order type → menu is usable but repetitive for a single-language takeaway-only restaurant. Let administrators skip irrelevant choices while keeping a visible language switch and clear order context.
- Use an intentional compact layout when a restaurant has not supplied photos. The test catalogue intentionally omitted photos; the Kiosk showed placeholders. **This audit does not establish a production image-loading regression.**
- Keep contact collection optional and after the order unless the restaurant genuinely needs it. Retain visible sending/sent/failed confirmation and a deliberate Done action for receipt delivery. Email entry keyboard worked; actual email/WhatsApp sending was not tested here.

## Customer QR: cart recovery, payment state and mobile clarity

F03 above also affects QR.

| ID / priority | Gap and reproduction | Improvement and acceptance condition |
| --- | --- | --- |
| F09 · P1 · Browser | **Reviewing the cart loses checkout details.** Enter name, phone and kitchen note, go back to Cart, then Checkout. All three are blank. | Keep a scoped checkout draft alongside the cart. Preserve fields when reviewing dishes; clear guest details after completion/expiry. Do not put personal details into shareable URLs. |
| F10 · P2 · Controlled browser | **MENU_CHANGED reload loses the same details again.** A controlled 409 triggers automatic reload after 1.8 seconds. Cart lines survive; name/note do not. | Refresh prices/availability in place, highlight changed lines, preserve guest input and ask for review. An automatic reload is not a complete recovery flow. |
| F11 · P2 · Controlled browser | **Quote failure leaves checkout disabled without a direct retry.** With a controlled quote 503, the cart still says “Checking price...” and has no Retry button. | Show a definite error and “Retry price check”; retry safely on reconnection. Preserve the cart and never enable payment with an unverified stale quote. |
| F12 · P2 · Browser | **A fresh tab cannot restore a locally remembered order.** Same-tab reload works. A fresh tab sharing localStorage but not the original sessionStorage proof shows “Order not found / Could not restore your order”. | Provide secure order recovery for legitimate guests, such as a scoped recovery credential or verified-contact recovery. Explain when the original tab is required. **Do not weaken ownership checks or treat a public order number as authorization.** |
| F13 · P2 · Controlled browser | **Cancelled status can still ask for counter payment.** A CANCELLED/PENDING response with outstanding balance zero showed the cancellation heading together with “Payment due at counter” and “Please pay our team”. | Derive payment copy/actions from settlement and order state together. Cancelled/refunded/zero-balance orders need appropriate final messaging. This was a presentation test, not a real cancellation/refund transaction. |
| F14 · P2 · Controlled browser | **Recommendations ignore the selected dietary filter.** With Paneer Bowl configured as a recommendation, select JAIN. The main list hides Paneer Bowl, but “Add recommended Paneer Bowl” remains actionable. | Apply the active dietary rules to all add surfaces, including recommendations. Test vegetarian, Jain and any configured restrictions. Preserve restaurant-entered declarations; do not infer dietary suitability from a dish name. |
| F24 · P2 · Source | **Service-help discovery silently disappears when options fail to load.** `ServiceRequests` swallows the initial error and returns nothing when options remain null. | Distinguish disabled from temporarily unavailable. Keep an appropriate help/contact fallback and retry for an enabled feature. Do not silently remove a guest's route to assistance. |

Evidence: [checkout observations](evidence/QR_JOURNEY.json), [quote failure](evidence/qr-quote-failure.png), [cancellation copy](evidence/qr-cancelled-payment-copy.png), [dietary recommendation](evidence/qr-jain-recommendation.png).

### What makes QR harder than necessary

- Keep table/branch identity and the active order easy to find, while giving the food and cart the visual emphasis. An optional restaurant landing page should retain the table context and give a direct Menu action.
- Separate “Order recorded, payment pending” from “Paid and accepted”. For online payment, move directly to the supported checkout, verify on the server, then show the confirmed result. A cancelled or interrupted attempt should resume the same order rather than encourage another order.
- Extend localization beyond item names/descriptions if offering a fully localized customer experience. Current menu translation support is useful; many surrounding instructions remain English. This is an improvement proposal, not a claim that translation entitlement is broken.
- Mobile image quality needs a separate asset-enabled check. This local QR host did not have the shared image-serving setup available; missing logo/fallback pictures in its screenshots must not be treated as proof of a production CDN bug.

## Behaviour that worked in these checks

- Manual **7% typed POS discount** changed ₹280 to ₹260 after rounding. The previously reported manual-entry failure was not reproduced in this build.
- Attaching the customer in POS offered the configured reward with a **Use reward** action and an explicit option to keep points. The offer itself is present; final redemption/earning/refund accounting was not part of this test.
- QR required-choice validation and the individual minimum/maximum picker worked.
- The real QR cash-at-counter order was created, restored in the same tab and visible in the same branch's POS.
- The real Kiosk cash order was visible in POS; collection changed its canonical payment status to SUCCESS for ₹280.
- POS blocked collecting cash without a shift, preserved the cart, and offered **Open Shift & Cash**. Opening the shift then allowed collection.
- POS billed ₹80 while browser networking was offline, displayed a local receipt, and synchronized **one** new canonical paid POS order after reconnection.
- Kiosk search and receipt email entry opened themed touch keyboards.
- Saved snapshots reported no document-wide horizontal overflow at their tested sizes. This does not certify every responsive state or imply that internal scrolling is ideal.

## Simpler recommended journeys

### Cashier

1. Open shift if necessary; show printer/connection issues without blocking valid offline billing.
2. Find dish → complete required choices automatically → edit quantity within the dish's rules.
3. Optionally attach customer → choose a reward or continue without it.
4. Review one checkout with a stable total, amount collected/change and enabled payment methods.
5. Confirm collection → show receipt and print state → start next order. Keep last receipt and unfinished carts easy to reopen.

Switching to a held order, table bill or QR collection must preserve the current guest's cart first.

### Kiosk guest

1. Start → only the relevant language/order-type choices → browse menu.
2. Finish dish choices before adding → review cart with reliable totals.
3. Choose payment with benefit eligibility already clear.
4. Online: complete and verify payment before showing paid confirmation. Counter: say “Pay at counter ₹X” and retain the same token/reference.
5. Show token, collection instructions and receipt choices. Provide touch input for every field and explicit sending/sent/failed feedback.

Customer screens should contain customer actions. Printing setup, technical ticket repair and device diagnostics belong behind a staff entry.

### Guest scanning a table QR

1. Scan → restaurant/table context → direct Menu, or an optional branded landing page with an obvious Menu action.
2. Configure dish → cart → persistent checkout details.
3. Recheck current price and availability; explain changes without losing work.
4. Pay online and verify, or choose an allowed counter option. Resume a failed attempt with the same reference.
5. Show preparing → ready → served/completed, payment balance and receipt. Provide secure recovery and help when the browser or connection changes.

## What to implement first

1. **One shared order validator:** required options, quantity limits, availability and channel rules, used by every add surface, offline submission path and authoritative ingestion path. This addresses F01–F03.
2. **One protected working-cart/draft model:** guard every order switch, restore notes/contact/rewards correctly, and version recovery data. This addresses F04–F10.
3. **One payment/benefit decision model:** consistent reward valuation, explicit eligibility, unknown-payment recovery and authoritative collection state. Address F15–F18 and F25 before relying on live-payment acceptance.
4. **Recovery actions where the failure occurs:** quote retry, secure status restoration, correct cancellation copy, service-help fallback, actual print-state feedback.
5. **Simplify customer and cashier screens:** sticky checkout action, task-based receipt messages, complete touch keyboard coverage and readable offline/sync labels.

Useful additions after those fixes: an order-specific recovery drawer, securely resumable guest order status, a private whole-journey kiosk preview, and automated cross-channel acceptance tests using the same configurable dish/reward fixtures. These extend the existing tools rather than introducing another dashboard for staff to learn.

## Limits and required acceptance work

- No production restaurant, payment account, real card/UPI debit, WhatsApp/email send, physical printer, cash drawer or customer device was used. A live payment attempt and late-success/refund acceptance remain outstanding.
- Browser networking was disabled for one POS sale; this is not a Tauri SQLite/restart, LAN mesh or prolonged outage acceptance test.
- Actual KDS Ready → Served propagation was not exercised in this audit. Cross-channel order appearance and POS collection were exercised; a complete kitchen lifecycle still needs a separate device test.
- This fixture has one branch. It does not establish cross-branch isolation, concurrent-terminal safety or production load behaviour.
- The test API reported four pending migration-history entries: `20261015120000_branch_product_licenses`, `20261015130000_inventory_cost_snapshot`, `20261015160000_qr_restaurant_page`, and `20261015180000_qr_page_catalog_registration`. Used order/menu endpoints worked, but this environment is not production-schema acceptance evidence.
- The three Vite builds completed. This task did not run or claim a complete TypeScript, unit-test, native-build or repository-wide security suite. Existing chunk-size/import warnings remained.
- Controlled responses covered MENU_CHANGED, quote failure, cancellation presentation and dietary recommendations. They do not establish a gateway outcome or change production data.
- The disposable fixture is cleaned up after evidence capture. Existing application changes are preserved; this audit creates documentation and local QA scripts only.

## Reproduction

Use the existing isolated test-database/bootstrap procedure in the earlier admin-flow harness, then start its API on port 4017. Never point fixture creation or cleanup at a production database.

```powershell
$env:JAMANVAAR_QA_SKIP_PUBLIC='1'
$env:JAMANVAAR_QA_API_BASE='http://localhost:4017'
node docs/reports/full-app-browser-audit-2026-10-13/build-apps.cjs pos kiosk qr
node docs/reports/ordering-flow-audit-2026-10-17/serve-apps.cjs
```

In another terminal, run setup once, then journeys sequentially because they share one fixture and browser profiles:

```powershell
node docs/reports/ordering-flow-audit-2026-10-17/audit.cjs setup
node docs/reports/ordering-flow-audit-2026-10-17/qr-journey.cjs
node docs/reports/ordering-flow-audit-2026-10-17/kiosk-journey.cjs
node docs/reports/ordering-flow-audit-2026-10-17/pos-journey.cjs
node docs/reports/ordering-flow-audit-2026-10-17/pos-extra.cjs
node docs/reports/ordering-flow-audit-2026-10-17/qr-extra.cjs
node docs/reports/ordering-flow-audit-2026-10-17/final-checks.cjs
node docs/reports/ordering-flow-audit-2026-10-17/source-snapshot.cjs
node docs/reports/ordering-flow-audit-2026-10-17/audit.cjs cleanup
```

Activation state and credentials are kept in ignored local QA storage, not in this report. Journey scripts record observations; a successful process exit does not mean all observed behaviours passed. Inspect the result values and any harness errors. Fresh isolated browser profiles are needed for a clean repeat of the full sequence.
