# QR restaurant landing page: plan setup and navigation fix

Implemented and verified locally on 15 October 2026. No production changes or GitHub push performed. The user declined providing a deployment connection; server state was left unchanged.

## What caused the confusion

1. **The normal QR Admin navigation hid Restaurant Page.** `QrConsole.tsx` omitted `RESTAURANT_PAGE` from its daily-page allowlist, despite the page existing in the navigation catalog. It appeared only after Show advanced tools, or when opened with `?tab=RESTAURANT_PAGE`. This affected the shared standalone/integrated QR console.
2. **The plan option was buried at the bottom of the feature matrix.** It appeared only among dynamically loaded catalog features. A missing page feature produced no dedicated explanation or visible page option. Saved plan detail/list views also omitted the page add-on.
3. **Catalog registration needed a recovery path.** The original migration inserted the page feature with an `INSERT ... SELECT` from `QR_ADVANCED`. If that category was absent, it inserted zero rows. The seed did not register the page feature either. This is a reproducible deployment edge case, not a claim that this production database has that condition.
4. **Standalone QR plan presentation was inconsistent.** The pricing tier picker lacked QR, and the preview described a standalone QR plan as POS/restaurant management.

Read-only inspection of public production assets confirmed that the deployed Super Admin, standalone QR Admin and Restaurant Admin bundles already contain restaurant-page code. It is not simply an absent frontend implementation. See `evidence/public-deployment.json`. No authenticated production catalog, subscriptions, rollout settings or branch overrides were inspected, so their current values are not asserted here.

## Fixes

- Restaurant Page is visible in normal QR Admin navigation, including mobile and the shared integrated console.
- Create/Edit Plan has a prominent **Restaurant landing page** card at the top of Feature Entitlements. It works with standalone QR, Restaurant and Kiosk plans.
- Checking it includes QR ordering, menu and table management. It grants access only; it does not publish content or redirect scans.
- Missing catalog entries and failed catalog loads show separate actionable messages with a Feature Catalog link. The unavailable option stays visible and disabled. Platform inactivity/partial rollout is explained without bypassing it.
- Plans list and plan detail show whether the landing page is included.
- QR appears in the pricing tier picker; selecting standalone QR uses the Restaurant commercial family and accurate description/preview text.
- Backend plan create/update rejects a landing-page grant without base QR in the same plan.
- A new idempotent migration registers the feature even if its category is absent, repairs its legacy entitlement bridge, and preserves an existing feature's activation, rollout, name and dependencies. It does not grant access to any existing plan or restaurant.
- The seed registers the page feature and its base-QR dependency, preserving activation and rollout controls on reruns.

## Correct setup flow

1. Super Admin → **Plans & Entitlements → Create Plan** or **Edit**.
2. Choose the tier first; for a QR-only customer choose **Standalone QR**.
3. Check **Include restaurant landing page and page builder**. Configure pricing/limits and save.
4. Assign that plan to the restaurant. Existing explicit restaurant or branch restrictions still apply; a plan does not silently override them.
5. Owner → **QR Ordering → Restaurant Page**. Standalone QR Admin exposes the same page directly in its navigation.
6. Choose a design, enter details/photos/contacts, enable the page and select **Show restaurant page first** if scans should open it before the menu.
7. **Save & review → acknowledge → Publish reviewed page.** Saving the plan alone does not publish restaurant content.

Existing-deployment shortcut: `https://system.kelviontech.in/qr/admin/?tab=RESTAURANT_PAGE`. Sign in first. This bypasses the hidden navigation, but does not bypass licensing. The existing Show advanced tools button also reveals the page.

## Verification

| Check | Result |
| --- | --- |
| Browser using real local API and built bundles | **7/7 passed**: missing catalog guidance; catalog request failure; plan creation with dependencies; saved plan display; QR-only owner inherits page access without a restaurant override; mobile normal navigation; revoke page access while retaining QR ordering |
| API page integration | **17 passed**, including a new purchased-plan inheritance/revocation scenario and rejection of a page-only flag without QR. Existing tenant/branch isolation, publication, privacy and page tests passed. |
| Migration acceptance | **3/3 passed** against isolated PostgreSQL transactions: absent feature; absent category; existing inactive/zero-rollout feature with a missing entitlement bridge. Repeat registration is idempotent. |
| Focused client regressions | **20 passed**, six files covering page renderer/setup/enhancements, capability labels and existing payment/session recovery |
| TypeScript | Super Admin and Restaurant Admin passed |
| Production builds | API, Super Admin and Restaurant Admin passed. Existing Vite chunk-size/mixed printer-import warnings remain. One API rebuild encountered a transient Windows file-lock error; the retry succeeded. |

Browser screenshots and final results are in `evidence/`. Tests use isolated QA data and captured/blocked external transports. No real order, collection, customer message or production plan change was made.

Reproduce using the existing local QA environment:

```powershell
node docs/reports/qr-page-access-fix-2026-10-15/verify.cjs
node docs/reports/qr-page-access-fix-2026-10-15/browser.cjs
```

## Deployment required

Deploy the updated source before expecting the new controls on the public website. For the repository's Docker Compose setup:

```sh
docker compose up -d --build backend frontend pos-admin qr-guest
docker compose exec backend npx prisma migrate status
```

The backend entrypoint runs `prisma migrate deploy` before starting. The new migration is `20261015180000_qr_page_catalog_registration`, after the original `20261015160000_qr_restaurant_page`. For a non-Compose deployment, run the normal API migration/build/restart process and rebuild both admin bundles. The guest app already implements the renderer; deploying all relevant bundles together avoids mixed versions. No broad production seed is required for this repair.

After deployment, check **Feature Catalog → QR_RESTAURANT_PAGE** for activation/rollout, then create/assign the plan and publish from QR Admin. If the editor remains locked, inspect its displayed capability reason and the restaurant/branch's explicit overrides. A production database diagnosis requires authenticated access and was not performed in this run.

## Files

- `apps/restaurant-system/pos-admin/src/components/qrconsole/QrConsole.tsx`
- `cloud/super-admin-web/src/pages/Plans/{QrLandingPagePlanSection,PlanFormModal,PlanDetailPage,PlansListPage}.tsx`
- `cloud/super-admin-web/src/pages/QrOrdering/QrEntitlementEditor.tsx`
- `cloud/super-admin-web/src/api/types.ts`
- `cloud/api/src/modules/plans/plans.service.ts`
- `cloud/api/prisma/seed.ts`
- `cloud/api/prisma/migrations/20261015180000_qr_page_catalog_registration/migration.sql`
- `cloud/api/test/qr-restaurant-page.e2e.spec.ts`
- Verification scripts and evidence in this report directory.

Earlier kiosk language-screen work remains in the workspace and is separate from this fix.
