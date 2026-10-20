# Super Admin onboarding: product access, review layout and welcome links

Date: 20 October 2026

## Reported problems and fixes

1. **QR-only onboarding advertised unrelated products.** The feature list displayed every true flag in `Plan.entitlements`, regardless of the products selected for the restaurant. Both onboarding steps now use the same product-scoped review. Shared menu tools remain visible for QR; POS, Captain, Kiosk and other unrelated flags appear in a separate, collapsed configuration warning. The warning links to the plan's settings rather than claiming those products are included.
2. **The review was a small paragraph of configuration.** Replaced it with selected-product cards, a readable feature grid and separate branch/device/staff limits. Credential values use normal text, wrap long addresses and retain accessible copy controls. Mobile layouts remove nested padding and use a single feature column.
3. **Hosted welcome kits used localhost and the wrong console.** Links now default to the current deployed origin: `/restaurant-admin` or `/qr/login`. Publicly hosted consoles reject loopback, malformed, credential-bearing and insecure HTTP URL overrides. Explicit HTTPS cross-domain overrides are supported. Local development keeps its existing ports. QR-only kits and copied greetings say QR Admin, use its login URL and give QR-specific setup instructions.
4. **Related mismatches found during verification.** The Plans API used tier-only product defaults while provisioning also consulted feature flags and the live catalogue. They now use the same authoritative resolver. The response also supplies feature names and product metadata for the review. Key selection excludes unrelated hardware, avoids duplicate QR management keys, and retries with the restaurant's selected products rather than a hardcoded POS/Captain/KDS fallback.

## Existing plan configuration needs review

The supplied screenshot shows POS, Captain and Kiosk flags stored as true on a plan called JAMANVAAR QR. A plan name alone does not restrict access. Hiding those flags would not repair the stored configuration.

After deploying the API and Super Admin frontend:

1. Open **Super Admin → Plans → edit the QR plan**.
2. Select **Use QR-only feature set**. Review the draft, QR capabilities and price/limits, then **Save Changes**. This explicit action clears known unrelated flags while preserving configured QR capabilities and shared menu tools.
3. For new onboarding, confirm **QR ordering** is the selected product. Its welcome kit should show **QR Admin** and the deployed `/qr/login` address.
4. Review existing restaurants under **Products & access**. Existing explicit application grants are not silently revoked by this UI fix. Remove unwanted grants only after checking affected devices/subscriptions.

No production database or subscription was changed in this session. No migration is required. Rebuild/redeploy both API and Super Admin frontend; environment-only changes cannot alter an already built Vite bundle.

Optional build settings for separate-domain deployments: `VITE_RESTAURANT_ADMIN_URL` and `VITE_QR_ADMIN_URL`. Leave them unset for the normal deployment where all apps share the same public origin. Retired Kiosk Admin URL overrides do not revive the separate old console.

## Verification

- Frontend regression tests: **21 passed across 3 files**. Covers QR-scoped summaries, shared AI labels, explicit cleanup, dynamic feature labels, key selection, production/local/cross-domain URL behavior and prior URL/step-layout regressions.
- Backend tests: **21 passed across 2 files**. Covers plan default consistency with the provisioning resolver, standalone QR, dynamic entitlement validation and existing owner-console/QR authorization scenarios.
- Production builds: Super Admin `npm run build` and API `npm run build` passed. Vite reports the existing large-chunk warning.
- Chrome browser fixture: real onboarding and plan-editor components, at **1440 px and 390 px**. Verified module selection → key selection → review → welcome kit, copied handover URL, no horizontal overflow and no uncaught page errors. Also verified saving the explicit QR-only cleanup.
- Hosted-origin simulation deliberately supplies stale localhost build settings and verifies the output is `https://control.example.test/qr/login`.
- Browser HTTP mutations are intercepted by fixture adapters. They do not create real restaurants, subscriptions, keys, orders or payments. These checks do not claim that the production server has been deployed or tested.

Reproduce:

```powershell
# Repository root
npx vitest run tests/onboarding_access_and_links.test.tsx tests/super_admin_app_urls.test.ts tests/super_admin_onboard_steps_wrap.test.ts
node docs/reports/onboarding-access-2026-10-20/browser-check.cjs

# cloud/api
npx vitest run test/plans-dynamic-entitlements.e2e.spec.ts test/owner-console-plans.e2e.spec.ts
npm run build

# cloud/super-admin-web
npm run build
```

Browser evidence: [results](browser-results.json), [desktop review](review-1440.png), [mobile feature review](review-features-390.png), [desktop welcome kit](welcome-1440.png), [plan editor](plan-editor-1440.png). Fixture reproduction uses port 5544 and an installed Chrome browser.

## Files

- API: `plans.module.ts`, `plans.service.ts`, `plans-dynamic-entitlements.e2e.spec.ts`.
- Super Admin: `api/types.ts`, `lib/appUrls.ts`, new `lib/planAccess.ts`, `vite-env.d.ts`, onboarding component/CSS, `PlanFormModal.tsx`, `PlanReview.tsx` and new `plan-review.css`.
- Regression tests: `tests/onboarding_access_and_links.test.tsx`.
- Reproducible browser fixture, screenshots and results in this report directory.
