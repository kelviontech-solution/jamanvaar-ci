# Role-focused UX friction

Findings come from automated browser interaction and observed UI, not interviews with restaurant staff. Timing combines browser action/assertion overhead; it is not a human time-and-motion study. No numeric usability score is invented.

| Role | Useful observed workflow | Practical friction / risk | Priority improvement |
| --- | --- | --- | --- |
| Cashier | Hold/recall, cash settlement of a running order, short offline KOT, zero-float shift close and guest QR acceptance worked. | Instant Bill after KOT creates a second order; configured GST is ignored; refund approval can be bypassed server-side. | One sale identity, accurate tax, server refund approval, truthful printer feedback and known recovery/shift state. |
| Kitchen Staff | POS/QR tickets, ready→cashier visibility, tabs/station selection and 30-ticket recovery worked. | Paid kiosk orders disappear while unpaid QR checkout can appear. Staff cannot infer payment acceptance safely. | Reliable paid/cash-accepted admission; stable ticket identity and explicit recovery state before more display options. |
| Captain / Waiter | Mobile table/menu selection, role PIN rejection, ready notification, final table release and offline navigation worked. | Original full timed flow was interrupted; quantity/modifier/amendment/transfer/service request workflows remain unverified. | Fast repeat ordering, clear send acknowledgement, safe amendments and an end-to-end table lifecycle backed by the same order id. |
| Restaurant Owner | Menu price propagation, menu CSV, staff/customer creation, stock delivery/count ledger and collection labels worked in selected paths. | Idle request storm; inventory disappears on another device; false reconciled cash float; auth errors hide modules. | Trustworthy numbers, immediate save feedback, cross-device stock and explicit login/module state. |
| Customer | Guest QR correctly quoted GST18, double-submit/refresh retained one order and status became Ready. | Kiosk payable differs from charged amount; paid confirmation may not reach kitchen; no-printer runtime error. | One accurate payable amount and confirmation that represents actual order acceptance and kitchen delivery. |
| Super Admin / Finance | OTP, A/B onboarding, payment approval, negative commission authorization and unverified-bank EOD protection worked. | Most admin actions only rendered; positive commission edit, payout fulfilment, full statements and provider operations not certified. | Actionable exceptions based on durable fulfilment, immutable fee snapshots, accountable refunds and verified payout audit. |

## Click sequences actually exercised

- Kiosk: Start Order → English → Takeaway → Add dish → Proceed to Payment: at least five primary actions before scanning. Language/order-mode choices may be useful; their necessity for returning guests was not studied. The amount mismatch matters more than reducing a click.
- Captain: My Tables → choose table → add dish → send KOT. Notification and final table release were observed; amendments and multi-course work remain untested.
- Cashier: add dish → SEND KOT → Instant Bill appears quick but creates a second order (B004). The same sequence must preserve identity before it can be promoted as a speed feature.
- Owner: after stock creation the summary changes while the table does not, forcing navigation away/back to see success (B008). A valid save needs immediate consistent feedback.
- Payment settings: a direct-bank request stays MANUAL while Route is pending; this correctly needs explanatory status. Gross Collection → Fee → Net Payable → Pending correctly differentiates collected and transferred money.

## Layout/error observations

390×844 unauthenticated gates and mobile Captain/QR flows were sampled. Full authenticated responsive/accessibility coverage was not performed. Super restaurant 503 showed an error and Retry recovered after corrected fault injection. Owner session 401 lacked a useful sign-in recovery message (B010). Printer queue entries failed without hardware, which is expected; calling a queued receipt printed would require hardware proof. Sounds/autoplay permission, physical restaurant readability and touch ergonomics require real staff/device sessions.
