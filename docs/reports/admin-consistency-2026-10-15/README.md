# JAMANVAAR admin consistency audit — 2026-10-15

Implemented 11 groups of confirmed presentation defects in the existing admin implementations. Production changes are limited to 23 files in the two admin applications. No shared package implementation was changed. Protected-page visual coverage remains incomplete because an automation-accessible signed-in session was unavailable.

## A. Audit coverage

The structural inventory covers all 335 TypeScript/TSX/CSS files under Super Admin (125), Restaurant Admin (150), and shared UI (60). It records imports, exports, JSX elements, route declarations, utility classes, and CSS collision candidates: [source-inventory.json](source-inventory.json). This is a source inventory, not a claim that every page was visually exercised or every source line was manually reviewed.

Detailed review followed both entries, app shells, navigation definitions, auth/entitlement gates, theme configuration, global CSS, shared buttons/forms/dialogs/feedback, and the affected page and modal implementations. Dashboard/list/detail/report styles and table containers were compared by source. Existing UI, auth, access-parity, product-context, navigation, CRUD, and reporting tests were inspected and run as listed below.

- Super Admin: all 47 route declarations inventoried in `src/app/App.tsx`, including public login/activation, dashboard, restaurants/onboarding/details, owners, branches, SaaS/plans, connector consoles, catalog/features/entitlements, subscriptions/billing/payments/payouts, reports, applications/devices/keys, sync/backups/sandboxes/offline policy, team/support/tickets/notifications/audit/system health/settings/profile, redirect and fallback routes. Route-area mapping and `ProtectedLayout` were reviewed without edits.
- Restaurant Admin: all 35 tab identifiers inventoried, with product routes from `adminProducts.ts` and navigation from `navSections.ts`. Review included the Restaurant/Kiosk product boundary, entitlement filtering, QR console entry, operations/dashboard, menu/options, billing/orders/kitchen, tables/reservations, stock/purchasing, customers/staff, payments/shifts/reports, printers/receipts, sync/settings/subscription/audit/backup/support/downloads, and kiosk management tabs exposed by the existing console. Navigation, product mapping, and entitlement implementations were preserved.
- Actual local public screens rendered: `http://localhost:5180/login` and the signed-out Restaurant Admin entry at `http://localhost:5176/`. No credentials were submitted. Each was captured before and after at **390×844, 424×755, 768×1024, 1366×768, and 1440×900**.
- Isolated real components: Super Admin `FeatureFormModal`, standard `Modal`, `ErrorState`, `Card`; Restaurant Admin `CategoryModal`, `ConfirmModal`, `OrderDetailModal`, and `RestoreModal`. Props are inert test inputs; no application user, role, token, entitlement, or authenticated route is seeded.
- Style probes: settings-grid geometry, onboarding active-step contrast and dark surfaces/text, configured font stacks, and reduced-motion pulse. These are explicitly component/style checks, not authenticated page screenshots.

Both localhost apps were running. The available automation could not attach to the user's signed-in browser, and the in-app browser execution runtime was unavailable. A separate installed Chromium used a fresh temporary profile. API and external requests were rejected in that profile, preserving authentication and preventing business writes. External web-font downloads were blocked: font checks verify the configured stack and fallback behavior, not successful Google Fonts delivery. Authenticated dashboards, full data tables, role-specific menus, and production datasets were **not** visually verified.

Intentional differences retained: platform-level versus restaurant-level information architecture, Super Admin's optional dark theme versus Restaurant Admin's light theme, 260px versus 256px desktop sidebars, different shell density, dataset-specific columns, role-specific actions, and printable welcome-kit/invoice paper styling. Duplicate selectors across separate bundles and print-only selectors were not treated as accidental cascade conflicts.

## B. Inconsistencies found

| ID | Application / affected area | File / root cause and original inconsistency | Severity | Result |
|---|---|---|---|---|
| ADM-001 | Both; typography | Both `tailwind.config.js` files omitted `fontFamily.sans`. Existing `font-sans` utility replaced the declared Plus Jakarta Sans stack with Tailwind defaults. | Medium | Corrected existing utility configuration in both apps; computed stacks verified. |
| ADM-002 | Super Admin; Feature Catalog dependency picker | `components/ui.css`: `.field input` applied text-field height and padding to native checkboxes. Actual dependency checkboxes measured 40px high. | Medium | Excluded checkbox/radio inputs from text-field size, focus, and disabled selectors. Actual checkbox component verified at all five sizes. |
| ADM-003 | Super Admin; standard dialogs and confirmation footers | `components/shared.css`, `components/ui.tsx`: generic modal scrolled the whole card; footer had no padding. Actions touched edges and could scroll with content, unlike the existing shared Restaurant Admin dialog pattern. | Medium | Added a presentation class on the existing standard dialog; body scrolls independently, footer is padded and can wrap. Custom `ModalShell` flow preserved. |
| ADM-004 | Super Admin; modal close/title row | `components/shared.css`: close control was 32×32px and could shrink; long titles lacked a shrink/wrap constraint. | Medium | Existing close control is 44×44px and cannot shrink; title can wrap. Close target and keyboard behavior verified. |
| ADM-005 | Super Admin; platform settings mobile grid | `pages/Settings/settings.css`: fixed 380px minimum track exceeded the available 350px at 390px viewport. Body overflow hiding masked clipping from a document-width-only check. | Medium | Bounded the existing minimum by 100% of the container. Actual style geometry verified, including card width versus grid width. |
| ADM-006 | Super Admin; onboarding theme states | `pages/Onboarding/onboarding.css`: active pill combined theme-dependent primary background with fixed white text; dark mode produced near-white on white. Interactive cards and text also retained light-only colors. | Medium | Reused existing foreground, surface, border, accent, and text tokens. Active-pill contrast ≥4.5:1 verified in both themes; dark card/text probes verified. Printable welcome-kit styling retained. |
| ADM-007 | Super Admin; error feedback | `components/ui.tsx`: hardcoded pale background and dark-red paragraph conflicted with the existing themed icon/title and other error states. | Medium | Reused existing error background, foreground, and border tokens. Both themes verified. |
| ADM-008 | Super Admin; Feature Catalog table | `pages/FeatureCatalog/FeatureCatalogPage.tsx`: existing enclosing Card used `overflow: hidden` around a multi-column table, leaving wide content inaccessible on narrow screens. | Medium | Existing Card now permits horizontal scrolling. Columns, content, rollout inputs, buttons and handlers preserved. **Source-verified; authenticated data-table rendering remains pending.** |
| ADM-009 | Restaurant Admin; native modal action buttons | Fourteen modal files: manually styled primary/destructive actions used 12px labels beside shared 14px Cancel controls. Some relied on surrounding layout for target height. | Low | Existing primary actions use `text-sm` and explicit `min-h-11`; variants and handlers unchanged. Category/confirmation pairs verified at five sizes; order/restore action bounds checked at five sizes. Other affected dialogs were source-verified. |
| ADM-010 | Restaurant Admin; non-destructive confirmation | `components/ConfirmModal.tsx`: non-danger state used amber icon but unconditional rose error panel. | Low | Existing `isDanger` presentation now selects the matching existing amber/rose palette. Warning state verified; no confirmation behavior changed. |
| ADM-011 | Restaurant Admin; reduced motion | `src/index.css`: reduced-motion selector omitted the existing `animate-pulse-subtle` class despite covering other page animations. | Low | Included that existing animation in the reduced-motion rule; computed animation becomes `none`. Indicator content remains. |

## C. Changes implemented

### Existing common primitives within each app

No files in `packages/ui` were edited. The following application-owned primitives affect their existing consumers:

| Exact path from repository root | Correction |
|---|---|
| `cloud/super-admin-web/tailwind.config.js` | Brand `sans` font stack. |
| `cloud/super-admin-web/src/components/ui.tsx` | Theme error colors and standard-modal presentation class. |
| `cloud/super-admin-web/src/components/ui.css` | Checkbox/radio exclusion from text-field styling. |
| `cloud/super-admin-web/src/components/shared.css` | Standard-dialog scrolling/footer, close dimensions, title wrapping. |
| `apps/restaurant-system/pos-admin/tailwind.config.js` | Same brand `sans` stack. |
| `apps/restaurant-system/pos-admin/src/index.css` | Reduced-motion pulse coverage. |

### Page- and component-specific changes

| Exact path from repository root | Correction |
|---|---|
| `cloud/super-admin-web/src/pages/Settings/settings.css` | Container-bounded existing grid minimum. |
| `cloud/super-admin-web/src/pages/Onboarding/onboarding.css` | Theme-aware interactive surfaces and text. |
| `cloud/super-admin-web/src/pages/FeatureCatalog/FeatureCatalogPage.tsx` | Horizontal overflow on existing Card. |
| `apps/restaurant-system/pos-admin/src/components/ConfirmModal.tsx` | Action typography/height and warning palette. |
| `apps/restaurant-system/pos-admin/src/components/CashDropModal.tsx` | Existing action typography/height. |
| `apps/restaurant-system/pos-admin/src/components/CategoryModal.tsx` | Existing action typography/height. |
| `apps/restaurant-system/pos-admin/src/components/CustomerModal.tsx` | Existing action typography/height. |
| `apps/restaurant-system/pos-admin/src/components/InventoryModal.tsx` | Existing action typography/height. |
| `apps/restaurant-system/pos-admin/src/components/ItemModal.tsx` | Existing action typography/height. |
| `apps/restaurant-system/pos-admin/src/components/OrderDetailModal.tsx` | Existing void/refund/reprint action typography/height. |
| `apps/restaurant-system/pos-admin/src/components/PrinterModal.tsx` | Existing action typography/height. |
| `apps/restaurant-system/pos-admin/src/components/RecipeModal.tsx` | Existing action typography/height. |
| `apps/restaurant-system/pos-admin/src/components/RestoreModal.tsx` | Existing action typography/height. |
| `apps/restaurant-system/pos-admin/src/components/StaffModal.tsx` | Existing action typography/height. |
| `apps/restaurant-system/pos-admin/src/components/StockAdjustModal.tsx` | Existing action typography/height. |
| `apps/restaurant-system/pos-admin/src/components/TableModal.tsx` | Existing action typography/height. |
| `apps/restaurant-system/pos-admin/src/components/inventory/WastageLogModal.tsx` | Existing action typography/height. |

Audit-only files added: `tooling/qa/admin-consistency-inventory.cjs`, `tooling/qa/browser-admin-consistency.cjs`, the two entries under `tooling/qa/admin-consistency-fixtures/`, and this report directory. These add no product UI. Existing unrelated workspace edits were retained. No dependency manifests or lockfiles changed.

## D. Preservation verification

[preservation-before.json](preservation-before.json) and [preservation-after.json](preservation-after.json) compare the current task's initial source with the final source. All 16 changed TSX files retain their complete parsed program after removing **only JSX `className` and `style` attributes** for comparison. JSX element sequence and all other JSX props are checked separately. This verifies unchanged user-facing content, controls, fields, route declarations, handlers, conditionals, validation, imports, API calls and business logic in those files. CSS and the two Tailwind configuration diffs were reviewed separately.

No pages, fields, actions, navigation items, routes, role checks, permissions, calculations, workflows, or product functionality were added, removed, reordered, or hidden. No authentication bypass or production data mutation was used. The intentional interaction change is presentational scrolling: standard modal bodies scroll while actions stay visible, and the existing Feature Catalog card can scroll horizontally. There were no observed accidental functional changes in the executed tests; authenticated end-to-end business workflows remain outside this verification.

## E. Test results

Commands below ran from repository root unless a working directory is stated. Production build commands deliberately call Vite directly after explicit typechecks to avoid unrelated image-generation prebuild hooks.

| Command | Actual result |
|---|---|
| `node tooling/qa/admin-consistency-inventory.cjs` | Inventoried 335 files / 47 Super Admin literal routes; captured initial preservation snapshot. |
| `node tooling/qa/admin-consistency-inventory.cjs --verify` | Passed: all 16 changed TSX files preserve structure, non-presentation props, and non-presentation program. |
| `node tooling/qa/browser-admin-consistency.cjs --before` | Completed 105 baseline checks: 60 failures reproduced the targeted defects; zero uncaught exceptions. Repeated checks across sizes/themes are not separate issue counts. |
| `node tooling/qa/browser-admin-consistency.cjs` | **105/105 passed**, zero uncaught exceptions. Five sizes, both public screens, real components and explicit style probes. |
| `node tooling/qa/browser-admin-consistency.cjs --extra` | **17/17 passed**, including order/restore action bounds at five sizes, dark onboarding probes, checkbox interaction, initial focus, visible focus and Tab containment. |
| `node ../../node_modules/typescript/bin/tsc --noEmit` (cwd `cloud/super-admin-web`) | Passed. |
| `node ../../../node_modules/typescript/bin/tsc --noEmit` (cwd `apps/restaurant-system/pos-admin`) | Passed. |
| `node ../../node_modules/vitest/vitest.mjs run` (cwd `cloud/super-admin-web`) | **45 tests / 5 files passed**: access parity, impersonation identity/safety, draft secret exclusion, CSV safety. |
| `node node_modules/vitest/vitest.mjs run tests/ui_dialog_and_settings_primitives.test.tsx tests/pos_admin_nav_gating_real_data.test.ts tests/pos_admin_entitlements.test.ts tests/admin_product_context.test.ts tests/pos_admin_active_tab_persistence.test.ts tests/jamanvaar_auth_layout_shows_restaurant_name.test.ts tests/pos_admin_item_modal_kiosk_fields.test.ts tests/admin_crud_and_reports.test.ts` | **53 tests / 8 files passed**. Includes real navigation gating, token refresh outcomes, product context, tab persistence, dialog keyboard/focus behavior and existing CRUD/report checks. |
| `npm run lint -- --no-cache` | **Blocked**: `eslint` executable is absent from the installed dependency tree. No dependency installation was performed. |
| `node ../../node_modules/vite/bin/vite.js build` (Super Admin cwd) | Initial existing `dist` build failed with EPERM removing existing `dist/app-icon.png`. |
| `node ../../../node_modules/vite/bin/vite.js build` (Restaurant Admin cwd) | Initial existing `dist` build failed with EPERM writing existing `dist/sw.js`. |
| `node ../../node_modules/vite/bin/vite.js build --outDir ../../.jamanvaar/admin-consistency-build/super --emptyOutDir` (Super Admin cwd) | **Passed**, including production CSS and JS. |
| `node ../../../node_modules/vite/bin/vite.js build --outDir ../../../.jamanvaar/admin-consistency-build/restaurant --emptyOutDir` (Restaurant Admin cwd) | **Passed**, including QR entry and service-worker generation. |
| `git diff --check -- cloud/super-admin-web/src apps/restaurant-system/pos-admin/src cloud/super-admin-web/tailwind.config.js apps/restaurant-system/pos-admin/tailwind.config.js` | Passed, no whitespace errors. Git also emitted existing line-ending normalization notices. |

Fresh build output paths were checked to stay inside the workspace before use. Both production builds retain large-chunk warnings, and Restaurant Admin reports a pre-existing mixed static/dynamic printer import. Those architectural/performance changes are outside this presentation task.

Browser evidence: [baseline measurements](before-browser-results.json), [final measurements](after-browser-results.json), [additional component checks](after-extra-browser-results.json). Before/after PNG files use matching app, component, theme, and viewport names. Representative pairs: [feature before](before-super-feature-390.png) / [after](after-super-feature-390.png), [dark style probes before](before-super-style-dark-390.png) / [after](after-super-style-dark-390.png), [category before](before-restaurant-category-390.png) / [after](after-restaurant-category-390.png), and public-screen pairs at every requested size. These were inspected as the labeled public/component/probe evidence, not represented as signed-in pages.

## F. Remaining issues and verification limits

1. **Authenticated visual audit remains open.** Sign-in being active in a user's browser does not make its session available to the separate automation profile. Need an authorized, automation-accessible session to verify all protected pages, role-specific navigation states, populated tables, long real data, and full workflows. No protected-page screenshots were fabricated.
2. Feature Catalog horizontal scrolling is source-verified; verify the populated table and its actions in a real authorized session. Likewise, dialog styles affect more consumers than the directly rendered sample; inspect the remaining data-dependent forms and custom dialogs with actual authorized data.
3. Only the named public/component/style checks ran in Chromium; untested live hover/loading/error branches, print output, font-download availability, and non-default OS/browser settings need manual or authorized-session verification. Existing unit tests cover several dialog and feedback states, but do not establish full UI coverage.
4. Lint needs the already-declared ESLint dependency restored. The task's no-new-dependencies restriction was preserved. Existing `dist` file permission problems were avoided with fresh build outputs, not repaired by changing filesystem ownership or permissions.
5. Large JS chunks were observed during the successful builds. No bundling refactor was attempted. No remaining **confirmed, safely fixable presentation defect from this audit** was knowingly left uncorrected; unrendered screens can still contain undiscovered defects.

## G. Final consistency scores

These are **provisional, verification-limited scores**, not whole-product certification. Each score uses four relevant observed dimensions worth 2 points each; the final 2 points require authenticated full-page/data coverage, which was unavailable. A source-only claim cannot earn those final points.

| Scope | Score | Verified basis and withheld credit |
|---|---|---|
| Super Admin UI consistency | **8/10** | Font-stack agreement, native-control sizing, dialog geometry/keyboard behavior, and responsive/theme feedback patterns pass their rendered checks. Two points withheld for protected shell/data-page/remaining consumer verification. |
| Restaurant Admin UI consistency | **8/10** | Brand font stack, representative modal action typography/bounds, confirmation semantic palette, and reduced-motion behavior pass. Two points withheld for full authenticated pages, remaining modal consumers, and real data. |
| Cross-panel design consistency | **8/10** | Matching brand font configuration, responsive public authentication screens, existing dialog conventions, and semantically consistent feedback are verified in the tested subset. Role-specific layouts remain intentional. Two points withheld for corresponding signed-in pages and datasets. |
