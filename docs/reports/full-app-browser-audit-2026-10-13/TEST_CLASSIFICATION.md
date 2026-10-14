# Interpreting the raw test log

`evidence/tests.jsonl` preserves failed attempts as well as corrected runs. Do not use its raw FAIL count as a defect count or its raw PASS count as a certification score.

| Failed attempt | Classification / final evidence |
| --- | --- |
| Connect admin after login | Harness selected the wrong auth-screen state; subsequent owner login/activation succeeded |
| Initial CSV/search/table/staff operations | Branch overview/session gate was still active. Scoped operations subsequently succeeded in `ADMIN_FEATURES.log` |
| Initial POS first-dish checks | POS was on table selection or the previous tab, rather than the menu. The final POS walkthrough and menu snapshots show all 100 dishes |
| Kiosk Call Staff after Need Help | AI panel had not been closed by the harness. Subsequent request flow succeeded |
| Kiosk add dish after Jain/combos filters | Partly a usability finding: the two All Menu controls clear different filter dimensions. After explicit reset, cart/payment worked. See F10 |
| POS pending collection expects dish text on list | Order list shows token/amount/source; item detail is available after selecting the order. Collection and settlement were subsequently verified |
| KDS urgent option clicked as button | Harness error. Priority is a select control; correct selection subsequently succeeded |
| KDS served expected top-level `SERVED` | Wrong invariant. Kitchen line reached `SERVED`; financial order status remained separate until collection. Cross-device verification succeeded |
| POS expected `Settle Cash` | Stale action label. Actual payment dialog uses `Confirm and settle payment` |
| KDS priority selected after serving | No active ticket at that point; a later active QR ticket was prioritized successfully |
| Reprint order count changed | Another script created a QR order concurrently. This comparison was inconclusive; see the idle recheck in `KDS_FINAL.log` |
| POS expected payment state `PAID` | Canonical collection state is `SUCCESS`; total and collection were subsequently verified across devices |
| Early simulated payment callback | Malformed test payment ID was correctly rejected. A later valid simulated provider ID/signature produced confirmed payment |
| Simulated collection text assertion | Shell encoding changed the rupee symbol in the expected literal. Final amount/heading assertion passed in `QR_ONLINE_FINAL.log` |
| Email receipt not captured | Actual local runtime failure: HTTP 500 due to missing PDFKit font module. See F28; production packaging has not been verified |
| QR completed state on ordinary menu URL | The normal route intentionally returns to the menu for completed orders. The explicit `#status` route displayed completed preparation and outstanding balance; see `QR_STATUS_LINK.log` |

No raw error was erased to make the run appear clean. The main report uses corrected browser observations and backend assertions where available, and explicitly retains unverified coverage.
