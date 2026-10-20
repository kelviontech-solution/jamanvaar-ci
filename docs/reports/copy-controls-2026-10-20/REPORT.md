# Super Admin copy controls

20 October 2026

## What was wrong

- The shared CopyButton previously skipped copying when its optional callback was absent. That bug was fixed during the handover work; this pass adds consistent animated feedback and covers the remaining custom copy implementations.
- Several custom handlers returned silently when copying failed. The license-certificate control used the Clipboard API directly, without the common fallback.
- Restaurant list cards copied an internal UUID rather than the customer-facing Restaurant ID used at sign-in.
- Clicking a nested copy control must not navigate its restaurant card or submit an enclosing form. Keyboard activation also needs to stay within the copy control.

**Copying text is a browser operation. It does not require a request to the server.** Generating an activation key, invitation or certificate may require a server request first; copying an existing value does not.

## Changes

- Unified the **27 explicit copy-control call sites across 12 Super Admin files** on the shared CopyButton. See [inventory.json](inventory.json).
- Each control shows **Copying…**, followed by an animated green tick and **Copied** for three seconds, only after the clipboard operation succeeds. Reduced-motion settings retain the tick and text without animation.
- A failed copy shows **Copy blocked** and a dialog with selectable text and keyboard/touch instructions. It never reports a false success.
- The common helper supports native Clipboard API and legacy selection/copy fallback. DOM failures are caught, temporary fields are cleaned up and focus is restored.
- Restaurant card copy controls now copy `restaurantCode` when available. A legacy restaurant without one explicitly labels the fallback as its internal UUID. Card copying does not navigate to restaurant details.
- Migrated onboarding/welcome-kit fields, owner/branch IDs, restaurant creation credentials, activation keys, team invitation links, support tokens and license certificates. Existing Restaurant Detail and handover controls inherit the same feedback.
- Automatic clipboard attempts after an invitation-resend server action retain their existing delivery/error toasts. These are server workflows rather than standalone copy buttons.

## Verification

- **84 tests passed across 8 files**, including copy-without-callback, progress/success/reset, blocked copying/manual recovery, form/card event isolation, clipboard fallback, existing handover/onboarding/workflow and source-import regressions.
- **Chrome desktop 1440 px and mobile 390 px:** used the real Clipboard API, then **read the clipboard back** to verify the exact copied values. Tested the actual restaurant card and handover summary, plus shared variants for IDs, keys, links, tokens, certificate text, email and icon-only controls.
- Confirmed the success tick, animation, no extra server request for copying, no card navigation and no horizontal overflow.
- Confirmed fallback copying with `navigator.clipboard` unavailable. When both automatic methods are blocked, the manual-copy dialog appears without success feedback.
- Re-ran the onboarding browser journey at both widths after migrating its welcome-kit copy controls; it passed.
- Super Admin TypeScript/production build passed. Existing large-chunk warnings remain.
- Browser tests use isolated read-only fixture data; no real activation keys, passwords or certificates are issued. Clipboard contents are restored after the native browser test when the browser permits it. No real customer data is sent to a clipboard test service.

Evidence: [browser results](browser-results.json), [desktop copied controls](copied-1440.png), [mobile copied controls](copied-390.png), [blocked-copy recovery](manual-copy-390.png).

Reproduce:

```powershell
# Repository root
npx vitest run tests/super_admin_copy_feedback.test.tsx tests/clipboard.test.ts tests/owner_handover_links.test.tsx tests/onboarding_access_and_links.test.tsx tests/super_admin_workflow.test.tsx tests/super_admin_app_urls.test.ts tests/super_admin_css_classes.test.ts tests/super_admin_onboard_steps_wrap.test.ts
node docs/reports/copy-controls-2026-10-20/browser-check.cjs

# cloud/super-admin-web
npm run build
```

Browser reproduction needs installed Chrome and port 5547. The copy fixture has its own Vite cache to avoid interference from other running fixture servers.

## Deployment

This session changed and verified repository code, not the production deployment. Deploy the rebuilt **Super Admin frontend** and refresh it. The supplied screenshot still shows the prior handover layout; an API-only deployment cannot replace these frontend copy controls or their animation.

The clipboard helper is shared by other apps, but its public `copyText(text): Promise<boolean>` contract is unchanged. Other app frontends receive the helper update when rebuilt.

## Core files

- `cloud/super-admin-web/src/components/CopyButton.tsx`
- `cloud/super-admin-web/src/components/copy-button.css`
- `packages/utils/src/clipboard.ts`
- Page migrations listed in [inventory.json](inventory.json).
- `tests/super_admin_copy_feedback.test.tsx` and `tests/clipboard.test.ts`.

Earlier handover and password-reset changes remain documented separately in their respective report directories.
