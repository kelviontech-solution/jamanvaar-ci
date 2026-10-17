# Restaurant Admin, Kiosk Admin and QR Admin: gaps and flow improvements

Audited: 16 October 2026. **Audit only; application fixes were not made in this task.**

The consoles are substantially easier to navigate than the older screenshots. There are still important problems in restore safety, QR-only onboarding, reports and unfinished edits. The next priority should be making existing actions dependable and understandable before adding more pages.

This assessment records **30 findings: confirmed defects, source-confirmed limitations and usability gaps**. They are not 30 security vulnerabilities. It does not establish that every possible gap has been found.

## What was checked

| Experience | Browser coverage |
| --- | --- |
| Restaurant Admin | 36 route entries, each at 1440×1000 and 390×844 |
| Kiosk Admin | 28 route entries, each at both sizes, using a kiosk-only management plan with QR included |
| Dedicated QR Admin | 22 primary tabs plus seven Advanced sections, each at both sizes, using a QR-only plan |
| Integrated QR | Overview inside both owner consoles; shared implementation reviewed against the dedicated console |
| Failure handling | Controlled 503 responses for backup history, QR customers and QR analytics; additional failed-save and capability-loading probes |
| Deeper interactions | Nine targeted browser observations, six restore-dialog observations across the two owner consoles, and two controlled report-engine probes |

**190 page/viewport states** were captured in the broad scan. No JavaScript page crashes, document-wide horizontal overflow, unnamed visible buttons or broken loaded `<img>` elements were observed in those captures. Lazy/off-screen assets, CSS background images and populated long tables require additional checks.

These were fresh disposable QA restaurants. Most operational screens therefore showed their empty states. This is not a claim that every action, populated state, role, device or payment provider was tested. No real payment, refund, message delivery, production restore, printer or native-device operation was performed. Restore probes stopped before applying the file.

The latest admin frontend was built successfully for the audit. The API ran locally against the isolated test database using the available compiled API. Its startup warned that migration history was behind four migrations; this environment is not production acceptance evidence. The QR-only authorization failure below is also explained by the current source.

Baseline Git HEAD: `1fbe9342ffb31a9dbc61275ca65341bb0950fcb8`. Existing uncommitted changes were included. [Source snapshot and locations](SOURCE_INDEX.md) identify the actual reviewed files.

## Fix first

1. Protect restore: real validation, file-state clearing, restaurant/branch checks, review and recovery.
2. Unblock QR-only Guided Menu Setup without weakening tenant or role checks.
3. Correct reporting dates and make exports match the selected report.
4. Stop QR switches and navigation from discarding unfinished edits.
5. Align customer/loyalty behaviour and distinguish failed requests from empty data.

P1 means a significant data, reporting or launch risk; P2 means a functional or operational problem; P3 means a usability improvement. **Browser** means reproduced here; **source** means the current implementation demonstrates the limitation; **UX** means a design recommendation rather than a broken action.

## Shared recovery and backup gaps

These affect both Restaurant Admin and Kiosk Admin.

| ID | Priority / evidence | Finding and practical improvement |
| --- | --- | --- |
| A01 | P1 · Browser + source | **Unrelated JSON is called a validated backup.** Uploading `{"unrelated":"This is not a JAMANVAAR backup"}` displays “Snapshot Contents Validated” and enables Apply. Validate a versioned backup schema, required sections, field types and relationships before enabling restore. `RestoreModal`, SRC01. |
| A02 | P1 · Browser + source | **A bad replacement file leaves the earlier parsed file actionable.** After selecting an accepted object, selecting malformed JSON shows an error but Apply remains enabled. Cancel/reopen also retains the old selection. Clear parsed state on each file selection, parse failure and dialog close; bind the reviewed contents to the exact selected file. SRC01. |
| A03 | P1 · Source | **Restore lacks a safe scope and impact review.** It can copy supplied restaurant/outlet fields and replace arrays without checking backup identity or showing additions/deletions. Menu/category/table removals are queued for synchronization. Show source/destination restaurant and branch, reject accidental foreign restores, require reviewed counts and take a recovery snapshot. This is an accidental import/overwrite risk; it does **not** demonstrate bypassing server tenant isolation. SRC01. |
| A04 | P1 · Source | **“Complete database” export is not a complete restore round trip.** Export serializes `db`, but restore applies a selected set of properties and omits settings such as tax/modifier groups, receipt configuration, loyalty configuration and combos. Dependent records can become inconsistent. Define supported backup sections explicitly, restore relationships atomically and verify totals/settings after restore. SRC01–02. |
| A05 | P2 · Browser + source | **Backup-history loading failure is hidden.** A controlled 503 leaves the normal “Cloud Backup Enabled” screen without a history error or Retry action. Show loading, empty, unavailable and successful-history states separately. SRC02; `restaurant-failure-backup-desktop.json` and kiosk equivalent. |
| A06 | P2 · Source | **The last-backup reminder is shared and ambiguous.** One unscoped localStorage key tracks both local downloads and cloud uploads. It does not identify restaurant, branch or backup destination. Keep separate scoped timestamps, show verified cloud completion separately from a downloaded local copy, and avoid presenting one restaurant’s browser reminder as another’s. SRC02. |

Restore should also stage all changes before commit: the current function mutates fields and queues deletions sequentially, then catches errors. A mid-commit failure has no compensating rollback. Include this in A03/A04 rather than treating a confirmation dialog alone as sufficient protection.

## Restaurant Admin gaps

| ID | Priority / evidence | Finding and practical improvement |
| --- | --- | --- |
| R01 | P2 · Browser + source | **Reports → Filters does nothing visible.** The click toggles state, but no filter drawer renders. The browser control count stayed at five with zero dialogs. Implement the drawer and its real filter semantics, or remove the inactive button until ready. SRC03. |
| R02 | P1 · Controlled engine probe + source | **Reports use the device’s date boundary instead of the restaurant’s configured time.** With a UTC device and Asia/Kolkata restaurant, Today starts at `00:00Z` rather than restaurant midnight `18:30Z` on the preceding date. The engine also does not consult the configured business-day cutoff. Use the same defined date semantics as billing/dashboard, or explicitly label calendar-day reports and offer business-day reports separately. SRC04. |
| R03 | P2 · Browser + source | **Exports do not consistently represent the selected report.** Top Selling Dishes produces a CSV named for that report but containing Order # / Payment Status transaction columns, without Quantity Sold. The shared document preview also receives generic sales data rather than a report-specific dataset for every catalogue report. Use one typed dataset per report for screen, CSV and PDF. CSV mismatch was downloaded and checked here; PDF completeness was reviewed in source, not printed end to end. SRC03, SRC05. |
| R04 | P2 · Controlled engine probe + source | **Kitchen reports assume six fixed station names.** A configured “Pizza Oven” with two ordered items and a completed KOT returns no station row and zero counted items. The calculation also consults today’s menu station assignment when evaluating old orders. Derive stations from the registry and historical KOT/order snapshots; calculate delays from timestamps and configured thresholds. SRC04. |
| R05 | P2 · Source | **“Live reconciled” reports can remain stale while open.** Local report calculations are memoized by dates/filters, without a database revision dependency. Cloud payment summary loads once on mount. Add a deliberate refresh/revision mechanism and show a truthful “updated at” indicator; include midnight rollover handling. SRC03. |
| R06 | P2 · Source | **CRM spend and visits can disagree with paid customer history.** `richCustomers` counts all matching orders as visits, including cancellations, and adds any non-cancelled order amount to derived spend without requiring confirmed collection. This can affect VIP classification and AOV. Distinguish placed orders, paid visits, net paid spend and refunded visits using the authoritative ledger. SRC06. |
| R07 | P2 · Source / workflow | **CRM “Redeem a Reward” deducts points without applying a bill benefit or recording fulfilment.** The repository action creates a point adjustment, not an order redemption. Keep POS checkout redemption as the normal flow; label a CRM action as manual fulfilment/adjustment and require a reason and fulfilment reference. Show bill discount redemption separately. SRC06, SRC08. |
| R08 | P2 · Source | **Campaign recipients are marked sent when WhatsApp opens.** Closing the chat or a blocked popup still allows the queue to regard that recipient as processed. Track Draft → Opened → Staff confirmed sent, or provider-confirmed delivery when integrated. Opening a chat cannot establish delivery. SRC07–08. |
| R09 | P2 · Source / parity gap | **Restaurant CRM campaigns do not use QR CRM’s consent-aware segmentation.** The campaign matcher filters tags/spend/tier/inactivity/birthday without a channel-consent filter; the customer export includes email/phone without the QR console’s separate marketing scopes. Reuse the consent-aware customer export and campaign targeting rules across consoles. This is a product/data-handling gap, not a legal compliance determination. SRC06–08, SRC18. |
| R10 | P2 · Browser + source | **Unfinished restaurant identity edits disappear on navigation.** Changing the restaurant name, opening Orders and returning restored the original name with no warning. Extend the existing Save draft / Keep editing / Discard mechanism to this settings form. SRC09. |
| R11 | P2 · Source | **Some local audit entries identify a generic “Manager,” not the signed-in person.** Examples include manual loyalty awards, price changes and restore. Use the actual actor ID/name plus device, branch, reason and synchronization state. Preserve the distinction between local audit entries and authoritative server audit records. SRC01, SRC06, SRC08. |

R01–R05 also affect the reports shared with Kiosk Admin where those reports are exposed.

## Kiosk Admin gaps

| ID | Priority / evidence | Finding and practical improvement |
| --- | --- | --- |
| K01 | P2 · Browser + source | **The combo editor loses unfinished work.** Typing a combo name, visiting Orders and returning clears the name with no confirmation. Selecting New Combo or another combo also replaces the current draft directly. Apply the existing scoped kiosk draft guard to navigation, selection and refresh. SRC10. |
| K02 | P2 · Controlled browser response + source | **A connected payment account can show the online ledger twice.** The page mounts `OnlinePaymentsPanel`, and its nested `KioskPaymentSettingsPanel` mounts another for a non-NOT_CONNECTED status. A controlled PENDING_VERIFICATION response produced two “Online payments” headings. Render one connection summary and one ledger with clear branch/restaurant scope. SRC11–12. |

Other kiosk-specific improvements are included below as design recommendations. The welcome/language background editor, terminal overrides, saved presentation drafts, private journey preview and delivery-acknowledgement mechanisms already exist; they should be retained.

## QR Admin gaps

| ID | Priority / evidence | Finding and practical improvement |
| --- | --- | --- |
| Q01 | P1 · Browser + source | **A QR-only customer is blocked by Guided Menu Setup.** `/api/v1/menu/draft-status` returns 403 “Your subscription does not enable this application resource,” despite QR being active. The product-access matcher includes preview/publish/branch-overrides for QR, but omits draft-status. Review version/readiness endpoints too, authorize QR management deliberately, and add QR-only onboarding regression coverage. Do not broadly bypass the guard. SRC13–15; `qr-ONBOARDING-desktop.json`. |
| Q02 | P2 · Browser + source | **An immediate switch silently discards unsaved rules.** Changing Preparation estimate from 20 to 37, then toggling “Send accepted orders straight to the kitchen,” restores 20 and disables Save ordering rules. The optimistic `settings.setData` and reload overwrite the rules draft. Use one explicit save transaction, or preserve the rules draft while separately saving a switch. SRC16. |
| Q03 | P2 · Browser + source | **A failed QR switch can display the unsaved state as active.** With a controlled PUT failure, Accept QR orders changed visually from checked to unchecked and stayed there alongside the error. Revert optimistic state on failure or show a clear unsaved/retry state tied to the server value. SRC16. |
| Q04 | P2 · Browser + source | **A capability-fetch outage is misreported as a plan restriction.** Failing the operations capability request makes Customer Branding say “QR Branding is not included in this license” even for a licensed fixture. Represent loading, unavailable and not purchased separately; offer Retry access check. SRC17. |
| Q05 | P2 · Browser + source | **CRM failure also renders a false empty result.** During a controlled customer-list outage, the page shows an error together with “0 matching customers / No customers match.” Retain a labelled previous snapshot or replace the list with a retry panel. Do not assert zero from a failed request. SRC18. |
| Q06 | P2 · Source | **Catalog refresh errors are swallowed inside a save workflow.** `load()` catches errors rather than rejecting; `run()` then continues to set its success notice. A saved record followed by a failed refresh can leave stale rows and mixed messages. Distinguish “saved, refresh failed” from “save failed,” expose Retry list, and add an initial loading state. SRC19. |
| Q07 | P2 · Source / workflow | **Feature requests have no durable customer-facing progress.** The request button remembers “sent” only while mounted and does not show the created ticket/reference. QR’s dedicated navigation has no support-request inbox. Reuse the existing ticket system to show Pending / Needs information / Enabled, return its reference and prevent accidental duplicate requests. SRC20–22. |

## UI and flow findings

| ID | Priority / evidence | Finding and practical improvement |
| --- | --- | --- |
| U01 | P2 · Browser + source | **Several settings fields lack programmatically associated labels.** Restaurant identity inputs have visible text/placeholder guidance but empty label associations in the browser capture. Add stable input IDs with `htmlFor`, accessible error descriptions and required-state announcements. `restaurant-settings-desktop.json`; SRC09. |
| U02 | P3 · Browser measurements | **Touch controls remain inconsistent.** Sixty-three phone route states contain rendered buttons below the audit heuristic of 40px height or 30px width, including shared header controls. Reports had 27 and Menu 24 flagged controls. This is a triage heuristic, not a formal accessibility-compliance result. Aim for 44px touch targets or sufficient spacing and validate actual tap paths. `SUMMARY.json`. |
| U03 | P3 · UX | **QR configuration is split across overlapping destinations.** QR Settings, Ordering Rules, Payment Settings, Advanced Features and Operations each expose part of readiness/service behaviour. Keep quick service controls in one place, and group configuration under Guest experience, Menu, Payments and Service rules. Clearly identify restaurant defaults versus branch overrides. SRC16, SRC22. |
| U04 | P3 · Browser + source / UX | **A new full-suite owner sees empty business charts before launch guidance.** Restaurant Admin renders the launch/handover section after the business dashboard; Kiosk Admin places it first. For an unlaunched branch, show a compact next-step card above the dashboard, then switch to daily service tasks once ready. Do not show all setup tools permanently. SRC11; `restaurant-dashboard-desktop.png`. |

## Easier flows to implement

### Restaurant owner

**First launch:** Select branch → Review included products → Add/import menu → Review and publish → Connect only the required devices → Test an order → Start service.

**Daily use:** Today → Exact task/order → Complete action → Return to Today. Keep Orders, Menu, Customers and Devices prominent. Put occasional configuration under Setup.

For a full-suite restaurant, retain one owner console. Do not make the owner change admin applications to edit shared prices or customers.

### Kiosk owner

**Launch:** Menu → Customer experience → Payment readiness → Connect kiosk → Private preview → Real device test.

Within Customer experience, retain the existing Welcome, Language, Menu/checkout, Payments and Receipt tools. Make this the canonical destination; direct legacy links can open its relevant section. Show “Published version,” “Received by terminal” and “Tested on device” separately using the mechanisms already present.

Make kiosk-only customer/loyalty availability explicit. Its current route map has no general Customers page. If the plan includes customer management, expose the permitted common CRM experience; otherwise explain the product boundary rather than requiring the owner to discover it through another console.

### QR owner

**Launch:** Menu → Ordering mode (table / takeaway / menu-only) → Payments → QR code → Phone test → Open ordering.

**Daily use:** Orders, Service requests and Customers. Keep page design, branding, codes and launch checks in Setup. A menu-only restaurant should see checks appropriate to its mode; a cash-only restaurant should not appear broken because an online provider is unconfigured.

Keep `/qr/` for the product, `/qr/login/` for administrator sign-in, `/qr/admin/` for management and `/q/…` for guests. The dedicated QR console and integrated QR tools should continue to share the same backend and capabilities.

## Additional improvements worth building

These extend the existing features; they are not claims that all underlying tools are missing.

| Improvement | Useful behaviour |
| --- | --- |
| **Restore rehearsal** | Review a backup without changing service data; show scope, schema version, dependencies, validation failures and estimated impact. Produce a restore verification receipt after an approved operation. |
| **One configuration change receipt** | Combine existing publication/version acknowledgements into “What changed, who changed it, affected branches, received devices, outstanding offline devices.” Link directly to retry. |
| **Unified customer activity** | Show paid visit, point earn, redemption, refund reversal, adjustment and consent change together, with their order and actor references. Reuse the existing ledgers. |
| **Report definitions beside totals** | Explain sales vs collections vs outstanding vs payouts, chosen time basis and data freshness. Provide the exact selected dataset in each export. |
| **Persistent request tracking** | Owners can follow activation, feature and payment-approval requests without leaving their console. Reuse current tickets rather than a second support system. |
| **Reviewed high-impact edits** | Before bulk price changes, loyalty-rule changes or payment-destination changes, show the exact before/after and affected scope. Existing approval controls can handle the actions requiring approval. |
| **Saved work across editors** | Apply the established presentation-draft pattern consistently, including settings and combos; show when a newer server version exists before restoring an old draft. |
| **Mode-aware readiness** | One branch checklist adapts to purchased products, table/takeaway service, paperless receipts and enabled tenders. Reuse existing launch/acceptance evidence. |
| **Task-first mobile view** | Show the owner’s urgent orders, collections and device issues first, with setup collapsed. Retain detailed reports as drill-downs. |
| **Short owner handover** | Generate a branch summary with admin URL, permitted products, device labels, recovery/support path and remaining test results. Never include full passwords or activation keys. |

## Implementation sequence and acceptance

1. **Recovery and QR-only launch:** A01–A04 and Q01. Prove malformed/foreign/stale files are blocked, rollback preserves state and a QR-only owner can finish setup.
2. **Trustworthy reports and customers:** R01–R09. Compare date ranges, station totals and export datasets against controlled orders. Include unpaid/cancelled/refunded orders and consent exclusions.
3. **Consistent saving and failures:** R10, K01–K02, Q02–Q07. Test navigation, refresh, failed requests, retries and concurrent edits; ensure a switch does not erase another field’s draft.
4. **Simplify presentation:** U01–U04 and the flows above. Test an unfamiliar owner completing launch without help, and a manager handling one busy shift on a phone/tablet.

Acceptance still needed after implementation: two branches with different product grants, manager versus owner, a populated large menu, offline/reconnect, multiple terminals receiving configuration, actual UPI/provider cancellation/retry, printers, real email/WhatsApp delivery and restoration over an existing installation. The present browser scan does not replace those checks.

## Evidence and reproduction

- [Broad browser matrix, errors and restore probes](evidence/SUMMARY.json)
- [Targeted workflow observations](evidence/TARGETED.json)
- [Station and restaurant-time probes](evidence/SOURCE_PROBES.json)
- [Source files, locations and hashes](SOURCE_INDEX.md)
- [Broad browser script](browser.cjs), [targeted browser script](targeted.cjs), [report-engine probes](source-probes.cjs)
- Representative images: [Restaurant dashboard](evidence/restaurant-dashboard-desktop.png), [Restore accepting unrelated JSON](evidence/restaurant-restore-unrelated-json.png), [QR capability outage](evidence/qr-branding-capability-outage.png), [QR CRM on phone](evidence/qr-crm-phone.png).

The scripts use an existing ignored QA configuration, isolated database, local mail capture and blocked external integrations. They create disposable fixtures and clean them up. They are not intended to run against production. Test credentials and session tokens are not included in the report.
