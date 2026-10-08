# CRM, loyalty rewards and manual POS discounts — 8 October 2026

The reported Admin → customer → POS → reward → payment → repeat purchase flow is implemented and verified locally. Production has not been deployed or changed by this work.

## Root causes

1. POS rendered the discount dialog both globally and inside the payment dialog. This created two competing inputs. Payment shortcuts also remained active underneath the discount dialog.
2. POS used a separate `one point = one rupee` redemption path. It ignored Admin's rewards catalog and immediately deducted points before the customer paid.
3. Client apps requested `LOYALTY_TIER`, `LOYALTY_REWARD` and `LOYALTY_PROGRAM_SETTINGS`, but the backend did not recognize those entity types. The settings never reached the counter.
4. Customer balances were synced as last-write-wins snapshots. Concurrent purchases could overwrite each other's points and visit totals.
5. Creating a new customer with zero points produced 50 points because the repository used `value || 50`. Running bills could also retain an old customer when someone attached a customer after sending the KOT.

## Resulting behavior

- There is one discount dialog. Manually entered decimal percentages work. Blank values are rejected, the preview uses the same tax calculations as settlement, and one verified manager approval applies a high discount without requesting another PIN.
- Restaurant Admin configures the earn rate, program pause state, reward points cost and actual rupee benefit. Rewards can be edited. A free-item reward supports an eligible category and a value cap covering one item.
- POS exposes **Use loyalty rewards** on the cart and in the payment summary. The cashier can choose a reward or keep the customer's points. Paused rewards, insufficient balances and unconfigured benefits have explicit explanations.
- Selecting a reward changes the bill but does not deduct points. Settlement validates the current reward and balance, deducts its configured cost once and credits points on the actual discounted paid amount.
- Unpaid orders and abandoned selections do not spend points. Changing customers, removing the reward or replacing it with a manual discount retains the points. Held orders, draft recovery, running bills and instant billing retain the relevant customer/reward data.
- A fully covered reward can settle a zero-payable bill. The reward cap uses gross line prices so a tax-inclusive dish does not incorrectly leave a small amount due.
- Repeat purchases update points, spend, visits and order history. Full refunds reverse earned points and restore redeemed points; partial refunds reverse proportional earnings. Refunded/cancelled bills cannot be settled again.
- Customer point changes use uniquely keyed events. Browser and backend merges retain concurrent earnings/adjustments, deduplicate retries and keep current totals. Actual local CRM edits trigger sync immediately.
- Orders carry reward and earnings metadata through the cloud bridge. Thermal receipts show points used and earned. CRM no longer labels every point as ₹1.
- The backend permits Admin to write loyalty configuration and POS to read it. POS cannot overwrite the owner's reward settings. Invalid rewards are rejected.

## Verified example

The browser test used a real isolated restaurant, activated Admin/POS devices, real staff PIN authentication, compiled applications and the local API/database:

| Step | Points | Spend | Visits |
|---|---:|---:|---:|
| Daksh's opening balance | 200 | ₹0 | 0 |
| ₹500 bill, choose ₹100 off for 150 points, pay ₹400 | 90 | ₹400 | 1 |
| Repeat purchase, keep points, pay ₹500 | 140 | ₹900 | 2 |

At 90 points, POS explained **Need 60 more points** and disabled the 150-point reward while allowing normal payment. Admin reflected both payments and the updated balance.

The reward in the user's screenshot is **Paused**. A paused reward is deliberately unavailable until the owner activates it in Loyalty Program Settings.

## Validation and artifacts

- Passed **108 automated tests**: 83 client/runtime/UI tests and 25 backend integration tests. Passed **5 browser scenarios**. API, POS and Restaurant Admin builds passed.
- Regression suites cover configured redemption, retaining/removing rewards, insufficient points, changed/paused settings, zero balances, full/partial refunds, duplicate settlements, free items, zero-payable settlement, KOT/customer attachment, instant bills, held orders, recovery, concurrent earnings and replay after reload.
- Backend integration tests exercise loyalty configuration push/pull, authority, invalid settings, concurrent customer events and existing entity sync behavior.
- Five browser scenarios exercise Admin settings, typed **17.5%**, optional redemption, settlement reaching CRM and an actual repeat purchase.
- API, POS and Restaurant Admin production builds were checked.
- Browser results: [BROWSER_RESULTS.json](./BROWSER_RESULTS.json).
- Screenshots: [manual discount](./evidence/manual-discount.png), [reward at payment](./evidence/reward-at-payment.png), [Admin earned points](./evidence/admin-earned-points.png).
- Reproduce browser checks: `node tooling/qa/browser-crm-loyalty.cjs`. This harness uses dedicated QA credentials privately, refuses occupied ports and removes only its own test fixtures.

## Boundaries

No real customer records, production payments or production settings were changed. Deploy the API, POS and Restaurant Admin together; older POS versions still contain the old points-to-rupees path. Existing descriptive free-item rewards need their value/category configured before they can discount a bill.

The event merge protects concurrent earnings; it is not a central reservation for two disconnected terminals spending the same balance simultaneously. That distributed redemption scenario remains a separate limitation. Public QR/legacy kiosk loyalty selection and deferred house-account collection were not certified by this POS-focused browser audit.
