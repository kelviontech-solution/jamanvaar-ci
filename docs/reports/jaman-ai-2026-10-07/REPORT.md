# JAMAN AI access and application audit — 7 October 2026

The assistant had several independent failures. The owner visibility switch was being treated as proof of assistant entitlement, while the applications actually require a separate platform decision. There were also a Captain rendering crash, an origin-wide cache, missing KDS integration and a Kiosk helper tied to demo menu data.

These changes are local source changes. This report does not certify the currently deployed AWS build. Browser evidence uses compiled applications with the isolated API on port 4010, a proxy on port 5290, real authentication and disposable restaurant fixtures. External payment services and physical devices are not exercised.

## Confirmed problems and fixes

| Problem and evidence in source | Severity | Affected applications/files | Implemented fix and expected impact |
|---|---|---|---|
| Captain returned before calling its store and state hooks when closed or locked, then called those hooks when opened. That changes React's hook order. | High | Captain, `components/assistant/CaptainJamanAiModal.tsx` | All hooks run before conditional rendering. Opening, closing and access-state changes work without this crash. |
| `ai_config.ts` saved one raw localStorage key for the whole origin and eagerly read it before scoped storage booted. | High | All assistant consumers, `packages/business/src/ai_config.ts` | Cache keys include the application namespace and restaurant. Scope is resolved lazily after boot. Previous tenant/credential responses are rejected. Concurrent refreshes share a request. Old unscoped grants are not migrated. |
| React subscribed only to `ON/LOCKED/OFF`. Catalogue, thresholds and quota changes could leave the state string unchanged and the UI stale. Suggested questions were memoized without a configuration dependency. | High | POS, Restaurant Admin, Captain, shared `useAiAccess.ts` and `JamanAiAssistantModal.tsx` | Subscribe to a configuration revision. Catalogue and quota changes update the UI, and a removed category cannot leave the assistant stuck on an empty category. |
| POS and Admin could expose unconditional buttons, while an unknown/OFF assistant returned nothing. | High | POS sidebar, Restaurant Admin header, shared assistant | Visibility follows verified access and the owner preference. Unknown access has a connection explanation; locked access has a plan/Super Admin explanation and a refresh control. |
| The visibility preference is separate from plan/per-restaurant grants, but the settings screen showed no effective access state. Settings pushes swallowed unsuccessful responses and connection failures. | High | Restaurant Admin settings/cloud client, `packages/sync/src/restaurant_identity.ts` | Show effective platform access and explain the visibility switch. Explicit settings saves require a server acknowledgement; a failed visibility save rolls back and shows feedback. Repeated visibility saves are disabled while the request is pending. |
| Captain did not periodically pull restaurant identity, and KDS had no assistant or AI configuration integration. | High | Captain and KDS App/cloud client | Both pull the owner preference on startup and existing identity/heartbeat cadence. KDS has a kitchen assistant, device-authenticated configuration and usage reporting. Kitchen navigation actions return to the board; unsupported action buttons are hidden. |
| Kiosk menu help hardcoded demo category IDs, excluded every non-vegetarian dish and advertised payment methods not necessarily available. Jain requirements could lose to a category branch. | High | Kiosk App/cloud client, `packages/business/src/customer_chatbot.ts` | Use current category names, actual available items, channel visibility, diet and budget constraints. Checkout supplies available payment methods. Coupons respect dates/usage limits and correct percentage/rupee units. The helper avoids unsupported preparation/announcement promises. |
| Static question metadata ignored configured labels/priorities, while custom server formulas never entered the client registry. Free text could execute disabled or inappropriate intents. | Medium | Shared assistant and `jaman_ai_registry.ts` | Apply configured labels/priorities and supported custom formulas. Free text must resolve to an available question. KDS only offers kitchen questions and rejects financial questions. |
| Both query executors fell back to every historical order when the current business day contained no orders. | High | `pos_assistant.ts`, `dynamic_query_executor.ts` | Today questions use the current business-day orders even when empty. Previous-day orders cannot inflate today's answers. |
| A sales answer labelled unpaid order value as net revenue, without an explicit pending-collection amount. | Medium | `pos_assistant.ts` | Show order value, net collected and awaiting collection separately. Refunds are excluded from the unpaid amount. |

## Access and synchronization behavior

1. Super Admin decides restaurant access: explicit ON/LOCKED/OFF overrides the plan; otherwise the existing plan policy applies.
2. Restaurant Admin's “Show JAMAN AI Assistant” is an owner visibility preference. It cannot grant a feature the platform has locked.
3. Each terminal fetches `/api/v1/devices/me/ai-config` using its own device credential. Access checks remain enforced by the existing device guard.
4. Answers use the application's synced restaurant data and the local rules/formula engine. **There is no general language-model provider in this implementation.** Enabling the setting does not connect a model or require a provider API key.
5. Existing heartbeats recheck configuration at most once per minute. Opening an assistant or choosing its refresh control explicitly rechecks access. Owner identity changes follow the existing approximately 15-second identity cadence when connected.
6. Offline terminals keep their own last verified policy. Configuration and owner-setting changes require connectivity. Usage reporting is best effort offline; it is not a strict billing-grade cross-device quota reservation.

Restaurant Admin includes the merged Kiosk Admin product. It uses the same owner assistant; a separate retired Kiosk Admin application was not recreated. Super Admin retains the platform control centre rather than exposing a restaurant's private ledger through a public chat. QR guest ordering does not currently contain a JAMAN AI assistant, so no staff/financial assistant was added to the public QR route.

## Verification

- 118 regression tests passed across nine files. The new tests cover app/tenant isolation, stale tenant and credential responses, concurrent refreshes, quota updates, acknowledged settings saves, kitchen-only suggestions, custom formulas, zero-order-day accuracy, pending-versus-collected amounts and real-menu recommendations.
- Production compilation passed for POS, Restaurant Admin, Captain, KDS and Kiosk against the isolated QA API. Captain, KDS and Kiosk TypeScript checks also passed; POS/Admin builds include TypeScript checks.
- 28 browser checks cover application assistants, platform access transitions, quota enforcement, owner visibility synchronization, operational flows and responsive layouts. Results and screenshots are in `BROWSER_RESULTS.json` and `evidence/`. The harness is `tooling/qa/browser-jaman-ai.cjs`.
- Browser checks include real staff sign-in, assistant opening/answers, role restrictions and the existing Captain/Kiosk → backend → KDS → ready/serve → POS flow. The final machine-readable result is authoritative for the browser check count.

## Likely production explanations

- A deployed build containing the old conditional Captain hooks can reproduce the opening crash directly.
- A stale origin-wide cached OFF decision or a platform LOCKED decision can explain why the visibility toggle appears enabled while no assistant opens.
- Old compiled bundles or a service-worker cache may continue showing old behavior until the updated application assets are deployed and loaded. This was not verified on the live host.

## Needs further verification

- Actual live restaurant AI grant, subscription/plan entitlement, owner visibility value and `/devices/me/ai-config` response.
- Deployed asset/version consistency across all application paths and service-worker clients.
- AWS response latency, reconnection timing and synchronization lag under real production load.
- Offline multi-device quota accounting. The existing telemetry endpoint counts completed queries; strict authoritative limits would need a dedicated reservation/ledger design.

## Recommended improvements

1. Show the answer timestamp and last synchronization time, with a clear stale/offline indicator. Automatically refresh an open operational answer when its underlying orders or tickets change.
2. Give each role a short relevant starting screen: cashier pending collections, Captain food/bills/service requests, chef station queue/delays, owner collections and stock.
3. Add Hindi and Gujarati intent vocabulary, with the same structured calculations and item/diet checks.
4. Expand customer recommendations using category translations, restaurant-defined dietary metadata and published menu availability. A public QR menu assistant should use only public menu/session data.
5. If broader natural-language understanding is needed, add a model only as an intent/tool selector over authorized calculations. Keep money/order calculations deterministic, show the source of answers and require confirmation before operational changes.
6. If daily usage becomes billable, enforce it centrally with an atomic per-restaurant usage ledger and define the offline allowance explicitly.
