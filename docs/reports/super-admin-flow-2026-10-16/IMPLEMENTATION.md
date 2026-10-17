# Super Admin workflow simplification

Scope: the twelve usability gaps and two correctness issues identified in the Super Admin review on 16 October 2026.

Implementation sequence:

1. Consolidate product access, persist branch context, and route readiness tasks accurately.
2. Improve task prioritization, navigation, plan review, device pairing and owner handover.
3. Add branch comparison and reviewed copying using existing allocation APIs.
4. Verify permission behavior, routing, async search, real builds and browser journeys.

Existing authorization, allocation impact review, activation quota checks and old deep links must remain in place. Do not deploy or push as part of this task.

## Implemented workflow

Daily work starts at **Today & attention**. Select a restaurant, choose its working branch, review **Products & access**, connect devices, complete channel checks with the owner, then record the receiving-user handover.

| Review gap | Change |
|---|---|
| Access controls scattered across screens | One Products & access workspace groups Products, Purchased plans, Usage & limits, Included features and Branch access. Existing tab URLs and permission checks remain valid. |
| Setup guide only opens unrelated tabs | Continue setup selects remaining configuration before verification. Task pages show a shorter guide. Readiness checks and owner handover have distinct controls and content. |
| Broad or incorrect readiness shortcuts | Product-specific actions distinguish menu publication, device connection, branch access and paid-channel acceptance. Table checks open table setup. Owner actions use the actual Operations task IDs. |
| Branch context lost between tasks | The restaurant URL retains its active branch across tabs and refresh. Device pairing defaults to that authorized branch, device/key lists are scoped to it, and branch/device detail links return to the restaurant context. An invalid explicit branch must be replaced by a user selection. |
| Dashboard metrics obscure daily problems | A live attention queue precedes financial metrics. It combines unresolved ticket previews, assignee/due information and restaurant health signals, with direct ticket actions and explicit links to full queues. Loading failures remain visible. |
| Operators must explain activation internals | Connect a device guides product/branch selection, capacity checks, one-time pairing code entry and connection verification. The result includes next-step instructions. Existing advanced key management remains available. |
| Too many sidebar choices | Daily work promotes attention, support and devices. Product configuration, platform operations and security groups start collapsed for users without saved preferences. Existing saved navigation preferences and authorized routes remain supported. |
| Technical naming | Primary controls use Products & access, Included features, Branch access, Devices and Pairing code. Detailed identifiers remain in advanced tools and audit/history views where useful. |
| Fragmented onboarding completion | Existing onboarding drafts are retained. The welcome-kit exit now opens branch setup/handover. A derived progress view combines restaurant creation, configuration, channel tests, owner invitation/activation timestamps and receiving-user acknowledgement. No manually ticked completion state replaces recorded evidence. |
| Unclear plan assignment | Assignment and change forms show the selected plan's actual default products, enabled features and quotas. Assignment shows its calculated expiry. Explicit review is required before confirmation; changing the selection resets review. The old promise that PRO automatically unlocks all advanced products was removed. |
| Repeating branch edits | An authenticated branch/product matrix exposes effective access. Copying selects a product and target branches, reloads source/target state, obtains server impact previews and requires acknowledgement before applying. Each target reports its own result. |
| Fragmented owner handover | One handover page links owner invitation/recovery, branch device connection, channel acceptance and receiving-user acknowledgement. Its copyable summary excludes passwords, invitation tokens and pairing codes. |

The shared admin console's readiness calculation now recognizes a branch's POS_ADMIN device for licensed KIOSK_ADMIN management, including legacy KIOSK_ADMIN device records. This changes reporting only; it cannot enable a product or use another branch's device.

## Correctness and authorization

- Header search discards results and completion callbacks from superseded requests, including when the query is cleared.
- Setup's Products shortcut uses the same operations permission as its destination, rather than subscription permission.
- Owner-console task links validate the linked branch against the signed-in account's active branch list before changing the persisted workspace. Foreign links do not mark the workspace ready or change its scope. The branch query is removed after successful selection while preserving the exact task.
- Branch copying uses the existing server revision, signed preview and impact acknowledgement contract. There is no bulk-write bypass and no automatic retry after a failed write.
- No schema migration, signing identity change, production deployment or GitHub push is introduced by this task. Earlier unrelated working-tree edits are preserved.

## Copy behavior and limits

Copying transfers one product's effective enablement, explicit device quota and disabled feature list. It does not copy order/payment data, activation codes or source expiry dates. Target allocations have no expiry and are scheduled two minutes after review; the review displays those values. A branch can only restrict restaurant rights. Each target is a separate transaction; partial failures are reported separately and need another review. The matrix must be refreshed after changes made elsewhere.

The attention preview considers the first 50 returned tickets and displays up to six unresolved tasks, alongside up to six unhealthy restaurants. It is labelled as a preview and links to the full existing queues. Health signals do not pretend to have an assigned support owner. Owner invitation timestamps are issuance records, not proof of email delivery.

## Verification

- Real Chrome acceptance: **20/20 scenarios passed** against built applications and an isolated API/database. Coverage includes full-suite and kiosk-only owners, retained branch context, unified access navigation, accurate readiness routes, device pairing, reviewed branch copying with persisted allocation, plan review gating, mobile handover layout, support-request key issuance, draft recovery, private rehearsal, branch quota refresh and an actual owner-console branch/task link.
- API regressions: **36/36 passed** across four files, including shared-console readiness and branch isolation. The runner is `../admin-flow-implementation-2026-10-16/verify.cjs` and explicitly requires the isolated test database.
- Focused client regressions: **36/36 passed** across four files. They include out-of-order search, setup permissions/action routing, plan content, impact review/acknowledgement, failed target write reporting, linked-branch authorization and existing owner router/draft behavior.
- API release build and both admin Vite builds passed. Super Admin and Restaurant/Kiosk Admin TypeScript checks passed. `git diff --check` passed, with existing line-ending warnings.
- Screenshots and machine-readable results are in `evidence/`. Pairing codes are masked in screenshots. The browser uses actual local authentication, API responses and persisted test fixtures; external payments, mail and device providers are disabled.

The QA database retains an existing migration-history mismatch warning because its schema was prepared separately. Existing build warnings concern large chunks and mixed printer-module imports. No production database or release was changed. Real delivery, physical devices, printers and payment-app behavior still require restaurant-device acceptance.

## Main implementation files

- `cloud/super-admin-web/src/pages/Restaurants/{RestaurantDetailPage,RestaurantSetupFlow,OwnerHandover}.tsx` and `setupActions.ts`
- `cloud/super-admin-web/src/pages/Branches/{BranchDetailPage,BranchAccessWorkspace}.tsx`
- `cloud/super-admin-web/src/pages/Dashboard/{DashboardPage,AttentionQueue}.tsx`
- `cloud/super-admin-web/src/pages/Subscriptions/{AssignSubscriptionModal,ChangePlanModal,PlanReview}.tsx`
- `cloud/super-admin-web/src/pages/ActivationKeys/GenerateActivationKeyModal.tsx`
- `cloud/super-admin-web/src/{layout/ProtectedLayout.tsx,hooks/usePlatformSearch.ts}`
- `cloud/super-admin-web/src/pages/{Devices/DeviceDetailPage,Onboarding/OnboardRestaurantPage}.tsx` and `Restaurants/restaurants.css`
- `apps/restaurant-system/pos-admin/src/components/header/AdminBranchWorkspace.tsx`
- `cloud/api/src/modules/operations/admin-workflow.service.ts` and its API regression test
- `tests/{super_admin_workflow,admin_linked_branch}.test.tsx`
