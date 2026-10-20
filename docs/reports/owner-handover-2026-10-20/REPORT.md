# Owner handover links and layout

20 October 2026

## Why the two actions exist

- **Channel tests** record whether each enabled ordering channel works. Online-payment and printer checks are separate acceptance checks.
- **Branch handover** prepares a record of outstanding work for a named receiving owner/manager, who signs in to acknowledge it. This is not the same as recording channel tests or completing payments/orders.

The old panel presented two unexplained buttons under a dense text summary. Both always targeted Restaurant Admin, including for QR-only restaurants. The displayed localhost URLs are development addresses and are invalid handover links from a hosted console.

## Fixes

1. Task URL construction revalidates the base address against the current browser origin. A hosted console rejects stale loopback overrides and falls back to its hosted routes. Local development ports and deliberate secure cross-domain configurations remain supported.
2. Enabled branch products select the workspace: QR-only uses `/qr/admin/?tab=OPERATIONS`, while Restaurant/Kiosk management uses `/restaurant-admin/operations`. Both retain `branchId` and `opsTask=acceptance` or `opsTask=handover`. Table setup goes to the corresponding table page.
3. QR sign-in preserves the destination through its `next` parameter, using the existing restricted same-site destination validator.
4. QR workspace checks linked branches against the authenticated account's accessible, active branches before switching. It blocks foreign/inactive branches and preserves the operation across a required workspace reload. The Operations Hub receives the validated selected branch rather than opening its own unrelated/default branch selector.
5. An invalid branch link offers **Open my current workspace**. The accessible branch picker also clears a stale linked branch, so the error does not trap the user in a reload loop.
6. Redesigned the panel with branch identity, four readable status cards, access/device actions and two explanatory task cards. Touch controls wrap, and mobile uses a single task column. Owner-task links remain disabled until branch/product access is known.
7. Found an additional real bug while exercising **Copy safe summary**: `onResult?.(await copy(text))` skipped the copy operation when the optional callback was absent. The shared CopyButton now always performs the copy and only then invokes the optional callback. Copied summaries use the same corrected workspace link.

No tenant authorization bypass or Super Admin impersonation was added. Owners still sign in with their own accounts; backend branch/product permissions remain authoritative. No production data was changed.

## Verification

- **56 tests passed in 6 files**: new hosted/deep-link routing, QR branch selection and rejection, safe next destinations, handover rendering, copy invocation without a callback, existing operator workflow tests, Restaurant Admin linked branches, prior onboarding URL regressions and clipboard behavior.
- **Chrome at 1440 px and 390 px**: two hosted task URLs, QR-only vs combined routing, copied summary, access/device callbacks, mobile overflow, new-tab navigation, QR sign-in return, requested branch selection, foreign-branch refusal and recovery to the current workspace.
- Super Admin and Restaurant Admin/QR production builds passed, including TypeScript checks. Both retain their existing large-chunk warnings.
- Browser checks use the real handover and QR authentication/workspace components. Network calls and the final Operations content are isolated fixtures. They demonstrate navigation and branch selection, not a production login, payment, printer test or a real handover acknowledgement.
- No production deployment was performed in this session.

Reproduce from the repository root:

```powershell
npx vitest run tests/owner_handover_links.test.tsx tests/super_admin_workflow.test.tsx tests/admin_linked_branch.test.tsx tests/admin_flow_controls.test.tsx tests/onboarding_access_and_links.test.tsx tests/clipboard.test.ts
node docs/reports/owner-handover-2026-10-20/browser-check.cjs
```

The browser fixture needs port 5546 and Chrome. Evidence: [results](browser-results.json), [desktop layout](handover-1440.png), [mobile layout](handover-390.png).

## Deployment

Rebuild and deploy **Super Admin** and **Restaurant Admin**, including its QR frontend entry. Updating only the API will not replace these compiled frontend links or layouts. Refresh the deployed web apps after the new frontend artifacts are served.

On the normal shared-domain deployment, expected destinations are:

- Combined restaurant: `https://system.kelviontech.in/restaurant-admin/operations?branchId=…&opsTask=acceptance`
- QR-only restaurant: `https://system.kelviontech.in/qr/admin/?tab=OPERATIONS&branchId=…&opsTask=acceptance`

The handover action uses `opsTask=handover` instead.

## Files

- `cloud/super-admin-web/src/pages/Restaurants/OwnerHandover.tsx`
- `cloud/super-admin-web/src/pages/Restaurants/owner-handover.css`
- `cloud/super-admin-web/src/pages/Restaurants/setupActions.ts`
- `cloud/super-admin-web/src/components/CopyButton.tsx`
- `apps/restaurant-system/pos-admin/src/qr/QrWorkspace.tsx`
- `apps/restaurant-system/pos-admin/src/qr/qrRoutes.ts`
- `apps/restaurant-system/pos-admin/src/components/qrconsole/QrConsole.tsx`
- `tests/owner_handover_links.test.tsx` and the updated structured-limit assertion in `tests/super_admin_workflow.test.tsx`.

The existing shared URL resolver is documented in [the onboarding report](../onboarding-access-2026-10-20/REPORT.md). Earlier password-recovery changes remain separate in [its report](../password-recovery-2026-10-20/REPORT.md).
