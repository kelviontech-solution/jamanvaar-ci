# Super Admin: remaining feature and workflow gaps

Date: 16 October 2026, Asia/Calcutta. Assessment of the current local working tree, including the latest flow improvements. This is an audit, not an implementation or production deployment.

**The improved setup/navigation flow does not make Super Admin gap-free.** The larger remaining weaknesses concern whether a successful action really changed authoritative data, whether an error is being presented as a healthy empty state, and whether commercial operations preserve subscription rules.

## Evidence and limits

- Opened **43 authenticated routes at two viewport sizes**: 1440×1000 desktop and 390×844 mobile, **86 page visits** in actual Chrome against built applications and the isolated API/database. There were **zero captured JavaScript page errors** and no detected document-level horizontal overflow in these initial views.
- Those visits verify initial page rendering, not every nested editor, populated table, button or business transition. Tables with internal scrolling can still put controls outside the initial viewport. Automated geometry findings are not all layout defects.
- Checked ten pages as a temporary **READ_ONLY** account. Two attempted writes were rejected with HTTP 403; this audit does not claim those enabled UI controls bypass backend authorization.
- Injected four local HTTP-failure cases. Three exposed misleading or missing section feedback; the Plans page correctly showed its load error.
- Ran four targeted browser probes covering unsaved settings, release-channel reuse, saving after settings-load failure, and report date filtering.
- Ran five domain probes using a newly created, disposable QA restaurant. They reproduced ineffective merged-product changes, duplicate product-family subscriptions, renewal reactivation, conflict metadata-only resolution and acceptance of an invalid conflict strategy. Fixture restaurant/plans were removed afterward.
- Inspected the corresponding frontend/backend code for other findings. **Source-confirmed** means the implementation path exists; it does not mean every effect was reproduced against a live restaurant.
- Existing reports already contain 20 browser acceptance scenarios for the recently changed flows. They do not substitute for this audit or establish exhaustive coverage.
- Real email/WhatsApp delivery, bank transfers, provider refunds, native installers, off-site backup storage, destructive live restores and physical terminals were not exercised. Production credentials/configuration were not inspected. No production data, release or deployment was changed.

Evidence: [page visits and injected failures](evidence/browser-results.json), [role checks](evidence/role-results.json), [targeted browser checks](evidence/targeted-results.json), [domain probes](evidence/domain-results.json). Reproduction scripts are in this folder; they require the existing ignored, isolated QA configuration and do not print credentials.

## Highest-priority remaining work

1. Implement real, validated conflict resolution instead of marking a decision as applied.
2. Correct subscription ownership, product-family invariants, downgrade impact checks and renewal/suspension semantics.
3. Repair onboarding values that are collected but not applied, and resumed handovers that can display an unassigned password.
4. Make report date filters affect both the query and the exported report.
5. Stop turning payment, incident and payout failures into healthy-looking empty results.
6. Separate backup inspection, isolated recovery tests and live recovery before relying on the recovery UI.

## Additional confirmed gaps

H = high operational/correctness priority; M = medium; L = low. These are priorities for fixes, not CVSS security scores. Source references and exact line locations are in [SOURCE_INDEX.md](SOURCE_INDEX.md).

### Data correctness, access and subscriptions

| ID | Priority / evidence | Finding and operator impact | Recommended fix / acceptance condition |
|---|---|---|---|
| SA-01 | H · API reproduced | **Conflict resolution does not apply the chosen data.** LOCAL_WINS returned success and changed the conflict record to resolved while the stored dish price stayed 100 instead of the chosen local 120. The service only updates conflict metadata and audit history. | Apply a validated, entity-specific change transactionally, increment sync versions/sequences, propagate it, then mark resolved. Test the canonical record and a receiving client, not just the conflict status. [S01] |
| SA-02 | H · API reproduced | **Conflict decisions lack runtime validation and transition protection.** An already resolved conflict accepted `QA_INVALID_STRATEGY` and changed its resolution again. Manual Merge has no edited merge payload in the UI/request. | Validate the strategy with a schema, require expected revision/current pending state, reject repeat conflicts, and require validated merged content for manual merge. [S01, S02] |
| SA-03 | H · API reproduced + source | **Merged Products can edit the wrong subscription.** The page reads grants combined across subscriptions but writes through the single newest/primary `activeSub.id`. In the two-family probe, disabling POS through the newer Kiosk subscription returned 200 while effective POS remained enabled by the Restaurant subscription. | Show which subscription grants each product. Review and edit the granting row(s), then refetch effective restaurant and branch access. Do not announce disabled while another grant keeps it enabled. [S03, S04] |
| SA-04 | H · API reproduced | **Changing plan can violate one-active-subscription-per-family.** Assign checks product family; change-plan does not. Changing a Kiosk subscription to a Restaurant plan produced two ACTIVE Restaurant-family subscriptions. The plan picker lists active plans across families. | Constrain normal changes to the current family. A deliberate family migration needs a server-validated migration transaction and duplicate-family checks. Reject inactive destination plans as well. [S05, S06] |
| SA-05 | H · source | **Changing plan lacks the reviewed service-impact protection used for branch licensing.** It can reset app access without a server preview of active devices, pending orders or overridden rights. The new plan review shows plan contents, but does not calculate the downgrade's operational impact. | Add server-issued impact preview, affected-device/channel list, expected subscription version, acknowledgement and optional effective time. Test a downgrade during service. [S05, S06] |
| SA-06 | H · API reproduced | **Renew reactivates a suspended subscription.** A suspended QA subscription became ACTIVE through Renew, even though the adjacent Reactivate action is a separate decision and Extend explicitly refuses suspended subscriptions. | Preserve suspension during renewal or explicitly review a combined renew-and-reactivate action with reason and impact. Make UI/API semantics match. [S05, S07] |
| SA-07 | M · source | **Included-feature/usage views are not the combined effective entitlement view.** They use one active plan's entitlements/limits even when Restaurant and Kiosk subscriptions coexist; effective grants and branch restrictions can differ. | Present purchased-plan details per subscription and a separate authoritative effective-access summary. Clearly label aggregated limits and their resolution rule. [S03, S04] |
| SA-08 | H · source | **Bulk subscription selection can include hidden rows.** Search/status/tier changes leave `selectedIds` intact; Suspend Selected/Reactivate Selected operate on those IDs without listing the affected restaurants in a review. | Clear selection when filters change or show an explicit persistent selection tray, hidden count, target list and confirmation. Test changing filters before a bulk suspend. [S07] |
| SA-09 | M · source | **Product cards can misstate usage and omit a zero quota.** Device counts use all matching device rows rather than only non-revoked devices, yet label them active. `row?.deviceQuota` hides an explicit quota of zero. | Use the shared authoritative capacity projection; display zero distinctly from inherited/unlimited. [S03] |

### Onboarding and owner support

| ID | Priority / evidence | Finding and operator impact | Recommended fix / acceptance condition |
|---|---|---|---|
| SA-10 | H · source | **Some wizard inputs have no provisioning effect.** Primary branch name/code, edited branch/device limits and monthly/yearly choice are collected; `runOnboarding` does not send them to the corresponding server operations. Subscription assignment accepts neither those overrides nor a billing cycle. | Implement supported values server-side, or remove/label non-editable plan-derived values. Review must show the authoritative created branch, limits and billing term. Test non-default entries end to end. [S08, S09] |
| SA-11 | H · source | **Resuming an already partially provisioned onboarding draft can display a password that was never assigned.** Resume generates a fresh `initialPassword`; an existing restaurant is skipped, but the welcome kit later displays that new local value. Keeping passwords out of local storage is correct; claiming the replacement is the account password is not. | For an existing account show “existing password unchanged” and offer audited recovery. Only display a freshly assigned one-time credential after a confirmed assignment response. [S08] |
| SA-12 | M · source | **Copied welcome text uses the internal restaurant UUID as the Restaurant ID.** The visible kit uses `restaurantCode`, but `getHandoverWhatsAppText` uses `restaurantId`. The two handover paths disagree. The old greeting also includes passwords/invitation tokens by default, unlike the newer safe handover summary. | Generate all welcome outputs from one reviewed handover model using the public restaurant code. Separate sensitive activation material from the ordinary greeting and explain secure delivery. [S08, S10] |
| SA-13 | M · source | **Partial provisioning lacks a durable recovery checklist.** AI override failures are swallowed; key failures become warnings and the wizard still reaches Done. The warning/one-time-key state is not a durable per-step server result. Wizard keys also omit an explicit branch. | Record successful/failed/skipped steps, preserve IDs, make retries idempotent and branch-bound, and keep “created” separate from “ready.” Existing warnings should become actionable tasks. [S08] |
| SA-14 | M · source | **Invitation fallback can claim copying succeeded when it did not.** Owner list/detail and Support start an unawaited clipboard write, swallow rejection, then announce the token was copied. | Use the existing checked CopyButton helper; show a copyable activation link with success only after completion. Do not lose the recovery result if clipboard access fails. [S11, S12] |
| SA-15 | M · source | **Support diagnostics can show stale restaurant data.** Selecting a restaurant does not clear old diagnostics or discard an earlier in-flight response. A slow response for A can replace the panel after B was selected. | Cancel/discard superseded responses, clear previous content while loading, and bind every privileged action to the loaded restaurant ID and selection generation. Test reversed response arrival. [S12] |

### Payments, reporting and communication

| ID | Priority / evidence | Finding and operator impact | Recommended fix / acceptance condition |
|---|---|---|---|
| SA-16 | H · browser reproduced + source | **Report date selector is cosmetic.** Changing Last 7 Days to All-Time reruns the same five API URLs without date parameters. No client-side date filtering follows. Export sends only report type. | Define metric-specific period semantics and send a common date filter to applicable queries and exports. Test orders/invoices on both sides of the boundary; label point-in-time counts separately. [S13] |
| SA-17 | H · injected browser failure | **Payment exceptions disappear on an API error.** HTTP 503 from `/payments/attention` becomes `[]`, and the UI says “Nothing needs attention.” This can hide customers who paid without fulfilment. | Keep error/empty/loading distinct, retain last known data with a stale label, retry visibly and show last successful refresh. [S14] |
| SA-18 | M · injected browser failure | **Incident history claims a clean history when loading fails.** HTTP 503 produces “No incidents on record.” | Show an unavailable state and Retry; only show clean history after a successful empty response. [S15] |
| SA-19 | M · injected browser failure + source | **Payout overview/reconciliation failures are silent.** A failed overview hides the summary without an explanation; reconciliation also swallows errors. | Give each independently loaded section its own error, age and retry state. Never replace unknown totals with zero. [S16] |
| SA-20 | M · source | **Payout search searches only the current page.** API loads 25 rows without the search string, then local filtering searches only those rows while the total remains fleet-wide. | Send search to the server and reset page; distinguish matched total from overall total. Test a matching restaurant present only on page two. [S16] |
| SA-21 | M · source | **Notification acknowledgement failures are ignored.** Mark-all-read discards errors; opening a notification also ignores failed acknowledgement. | Keep navigation possible, but tell the user when read status could not be saved and allow a retry. [S17] |
| SA-22 | M · source | **Some commercial labels remain hardcoded or incomplete.** Subscription tier options and restaurant feature text still state CORE ₹5,000 / PRO ₹7,000. The status selector omits a dedicated Expired choice and tier options omit QR, despite supporting those values elsewhere. | Derive labels/options from the live catalog and supported lifecycle states. Distinguish a tier from a particular priced plan. [S03, S07] |
| SA-23 | M · source | **Manual invoice setup assumes monthly pricing and a 30-day period.** It initially selects a PRO/first plan, uses monthly price, sets a tax hint at 18%, and submits a fixed 30-day period. The server computes its tax breakdown, so the editable tax hint is not an authoritative tax setting. | Select the relevant subscription/period, derive commercial values, show the server-computed tax preview and require an explicit period/override explanation. This is a product-flow finding, not an assessment of legal tax compliance. [S18, S19] |
| SA-24 | L · source | **Report export bypasses the shared authenticated request/retry path.** It calls raw `fetch` with the current access token, so normal token-refresh recovery is not automatically reused. | Use the common authenticated download helper and preserve filters; test an export after access-token expiry. [S13] |

### Operations, settings and releases

| ID | Priority / evidence | Finding and operator impact | Recommended fix / acceptance condition |
|---|---|---|---|
| SA-25 | M · role browser reproduced | **Read-only users see enabled write controls.** Confirmed on Releases, Backups, Payouts, Billing, Incidents, Sandboxes, AI and device details. For example, Publish Version, Run EOD, Dispatch Command and Remote Wipe appear usable. Release publication and backup trigger writes returned 403 in the explicit API probes. | Gate controls using the same area permissions as the server and explain the required role. Add a role × action test matrix. This finding is misleading UX, not a demonstrated authorization bypass. [S20, S21, S22, S23] |
| SA-26 | M · browser reproduced; wider source pattern | **Unsaved platform edits can disappear.** Editing branding, opening Billing & Legal, and returning to General lost the edit with no dialog. QR entitlement/AI editors and other local forms also lack a common departure policy. | Add consistent Keep editing / Discard / Save draft behaviour where appropriate. Scope drafts to user/restaurant/branch and exclude passwords, payment secrets and pairing codes. [S24, S25] |
| SA-27 | H · injected browser failure | **Settings editors remain writable after loading fails.** A failed settings GET shows an alert but mounts default Branding and Quotas forms with enabled Save buttons. An operator could overwrite unknown current values with defaults. | Block saving until authoritative values load; distinguish explicit Create defaults from failed load. Add revision/conflict protection for shared settings. [S24] |
| SA-28 | H · source | **Sandbox creation is not a complete usable training environment.** It writes a `RestaurantSandbox` record containing selected restaurant/branch configuration and hardcoded demo feature flags. This path does not provision a runnable isolated restaurant/order/payment environment, and the UI has no launch action. Destroy acts immediately without a review. | Either label it as a configuration template, or implement isolated runtime identity, authorized launch, test-only integrations, expiry enforcement and a reviewed destruction flow. Do not present it as a completed full clone. [S26] |
| SA-29 | M · source | **Remote command polling can stop before completion.** Polling checks only PENDING/SENT, not ACKNOWLEDGED/RUNNING, although those are valid states. Silent poll failures are also suppressed. Unknown `syncStatus` renders as a green “nominal.” | Poll every nonterminal state, show stale/unknown feedback and only claim successful sync from a real success report. Test transitions through acknowledged/running and a poll outage. [S22] |
| SA-30 | M · browser reproduced | **Release channel carries across apps.** Choose BETA for one app, cancel, and start publishing another app: it remains BETA because modal initialization does not reset `newChannel`. | Initialize channel explicitly for each new operation and show a final app/version/platform/channel confirmation. [S20] |
| SA-31 | M · source | **Beta-to-stable promotion has no clear supported flow.** Releases are unique by app/version; publishing that version in another channel conflicts. The exposed management path publishes or pauses, without a promotion action. | Add an audited promotion of the already verified artifact, or clearly document the alternative versioning workflow. Keep signatures/hashes unchanged and review target fleet. [S20, S27] |
| SA-32 | M · source | **Some health metrics overstate what they measure.** “Fleet Sync Rate” is computed as online devices / total devices, not successful syncs. “PLATFORM ONLINE” is based on database-UP alone; unknown sync is called nominal in device details. | Name online ratio correctly, separate connectivity/replication/provider health, and use Unknown/Last checked rather than inferred success. DeploymentHealthPanel already explains a narrower scope and can be the model. [S20, S22, S28] |
| SA-33 | M · source | **Branch copy has a fixed short scheduling window and drops expiry.** It schedules two minutes after preparation and writes `expiresAt: null`; the UI does explain this, so it is not hidden data loss. Long reviews or copying temporary restrictions still require care. | Let the operator choose effective time and expiry policy, show a before/after diff for each target, expire stale reviews and retain the existing signed impact/revision guards. [S29] |

## Previously identified backup gaps still open

These seven items repeat the backup-specific review; they are **not seven newly discovered unrelated defects**.

| ID | Priority | Current gap | Better behaviour |
|---|---|---|---|
| BK-01 | H | Preview uses STAGING_PREVIEW / “Isolated Staging Sandbox” labels, but confirming runs writes against the live restaurant. No isolated target execution is selected in the restore implementation. | Inspect contents, test restore in a genuinely isolated environment, and live recovery must be distinct operations with explicit target confirmation. |
| BK-02 | H | Recovery upserts selected synced entities/orders; it is not a full database rewind and does not restore staff, devices, subscriptions or all related ledgers. | Display recovery coverage, conflict rules, retained newer records and excluded data. Separate operational recovery from full disaster recovery. |
| BK-03 | H | Missing/invalid application backup encryption key allows unencrypted storage; off-site storage is optional. | A production protection policy should fail closed or explicitly refuse a protected backup when encryption/off-site prerequisites are missing. Show safe health details. |
| BK-04 | M | Fleet UI fetches the default first 100 rows and searches locally. | Server-side filtering and pagination across the complete backup history. |
| BK-05 | M | Schedule, retention and verification jobs exist but their policy/next-run/overdue coverage are not managed clearly in this screen. | One recovery-policy view with actual scheduler execution evidence and per-restaurant recovery objectives. |
| BK-06 | M | Write/download controls do not consistently mirror backend permissions. | Disabled controls and precise permission explanations, with download access treated as sensitive. |
| BK-07 | M | Restaurant backup controls and fleet recovery controls differ in labels and capability. | One context-preserving recovery workspace and job history. |

Sources: [S30, S31, S32]. No destructive restore, production encryption inspection or off-site recovery drill was performed in this audit.

## Feature and flow coverage

| Area | What was checked | Main result / remaining acceptance |
|---|---|---|
| Login, activation, profile, team | Actual owner/read-only OTP login, profile/team pages, source role/session/activation paths | Login worked locally; keep delivery and root-account recovery acceptance separate. Role descriptions still need permission precision. No brute-force or penetration test was performed here. |
| Restaurants, owners, branches, onboarding | All list/detail initial views, wizard source, owner support flow, new context model | SA-03–15, SA-22, SA-25–27. Wizard has seven steps; only initial view was visited in this broad pass. Partial provisioning requires dedicated regression cases. |
| Plans, entitlements, feature catalog, subscription | Initial views, schemas/services, live isolated product-family/renewal probes | SA-03–10, SA-22. New review panels help; they do not repair commercial lifecycle invariants. |
| QR, WhatsApp, AI, master menu | Initial pages, representative detail/editor source and permissions | QR's explicit unavailable states and diff patching are useful. AI overrides and draft protection still need completion/receipt feedback. Real connector delivery was not tested. |
| Billing, payment connections, platform payments, payouts | All initial views, read-only controls, injected failure states, query/settlement source | SA-16–25. Actual bank transfers/refunds and daily external reconciliation remain unverified. |
| Devices, keys, releases, offline policy | Initial list/detail pages, role controls, pairing/release initialization and command source | SA-25, SA-29–32. Offline-policy warnings in QA reflected unconfigured signing, not a proven production defect. Native installation acceptance remains separate. |
| Sync, sandboxes, backups | Initial pages, controlled conflict probe, implementation inspection | SA-01–02, SA-28, BK-01–07. Successful metadata updates do not establish actual recovery or synchronization. |
| Dashboard, health, reports, margins, audit, notifications | Initial pages, report filter requests and error/metric semantics | SA-16–21, SA-24, SA-32. Margin page correctly labels its cost assumptions as estimates. |
| Settings, announcements, incidents, support | Initial pages, section-change draft probe, 503 probes and selected action/source inspection | SA-12–15, SA-18, SA-25–27. Inspect nested dialogs and populated edge states during implementation. |

## Improvements worth adding after the defects

These are recommendations, not claims of hidden bugs:

1. **One authoritative access explanation:** show each granting subscription, branch restriction, expiry and capacity rule together; include a plain “why unavailable” explanation.
2. **A durable provisioning job:** resume onboarding from server-owned step results, handle partial success, and record owner acceptance without inventing completion.
3. **A service-impact review:** preview downgrade/suspension effects and schedule disruptive changes outside trading hours.
4. **A financial close checklist:** connect collections, refunds, fee snapshots, payout batches, bank references and unresolved exceptions, preserving their separate states.
5. **Recovery drills with measurable goals:** record last successful isolated restore, recoverable scope, expected data-loss window and recovery time; include uploads and encryption-key recovery.
6. **Controlled release rollout:** start with selected test devices/restaurants, observe installation results, then expand; pausing a published release is not rolling back an installed application.
7. **A simpler diagnostics session:** restaurant/branch always visible, clear read-only or audited support mode, expiring access and links to the exact issue instead of copying a raw token.
8. **Account recovery independent of ordinary sign-in:** define an audited Platform Owner recovery path and test loss of email access. Do not bypass MFA or expose reusable credentials.
9. **A common error/draft/confirmation standard:** Unknown is not Empty; Queued is not Applied; Sent is not Received; Saved draft is not Published.
10. **A regression matrix for each role and channel:** permission × action, pending/success/failure, duplicate/retry, branch switch, expired session, slow response, mobile, offline reconnect and populated high-volume lists.

## Suggested implementation sequence

**Batch 1 — correctness:** SA-01–06, SA-10–11, SA-16–17 and BK-01. Include actual canonical-data assertions and strict transition tests.

**Batch 2 — trustworthy operation:** remaining failure states, settings-load protection, role-aware controls, onboarding recovery and accurate effective access/usage.

**Batch 3 — scale and usability:** server-side discovery, safe bulk actions, draft protection, command completion feedback, release promotion and complete sandbox/recovery tooling.

**Batch 4 — production acceptance:** isolated restore drill, real payment/refund reconciliation, signed native upgrades, actual email/WhatsApp delivery and offline device convergence. Document evidence without claiming every future gap is eliminated.

No 10/10 score is assigned: the confirmed data and workflow defects need correction first. A clean initial page load is useful evidence, but not proof that every feature is complete.
