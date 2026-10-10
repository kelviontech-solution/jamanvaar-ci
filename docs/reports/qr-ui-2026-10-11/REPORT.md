# QR website and administrator experience repair

## Causes and changes

The dedicated QR administrator was wrapped in the public website's `qr-product` class. Its heading selectors overrode Tailwind form/dashboard sizes, producing the oversized titles shown in the supplied screenshot. Public typography is now isolated from the authenticated workspace, which has its own restrained type scale, spacing, controls and responsive layout.

The wrapping row of fourteen tabs has been replaced with a grouped sidebar in `/qr/admin/`. It includes operations, the guest experience, configuration and insights. Advanced feature subsections have their own sidebar links. Mobile uses an accessible navigation drawer with Escape handling and keyboard focus containment. The original Restaurant Admin keeps its surrounding application navigation.

Every section has a distinct title and explanation. Section and advanced-tool URLs survive refresh; browser Back restores the previous section. Previously the URL parser omitted several valid section IDs, sending direct links back to Overview.

The overview displays server-derived metrics first, followed by order activity and a compact setup checklist. Completed checks collapse, actionable checks remain visible and setup refresh clears previous errors. The checklist shows configuration health; it does not claim that a real payment or kitchen-delivery test has already happened.

Menu management now shows dish photos, dietary type/SKU authoring, search, category filtering, empty states and 24-item pagination. The shared image resolver now recognizes `/qr/`: bundled menu and branding assets previously resolved to root paths on this product route. The existing hashed-upload endpoint and actual catalog data remain authoritative. A saved-logo preview also incorrectly used an empty image source and has been corrected. QR-only owners no longer receive a link directing them into an unrelated Restaurant Admin menu editor.

Branch-aware forms now start with the selected QR administrator branch. This restores availability controls without requiring a second branch selection. Counter collection, payment verification, order preparation/completion, menu publication and entitlements continue to use the existing services.

Unsaved menu, ordering-rule, operations and branding edits warn before sidebar navigation discards them. Ordering rules clear their dirty flag as soon as a successful save is confirmed; previously a completed save could still block navigation. Save notices are cleared/replaced when another save starts. Success notifications fit mobile screens and dismiss automatically after seven seconds.

The public site keeps its existing opening composition and gains dining/kitchen photography, an image-led guest-experience section, an operations section, a photographed menu demo and a clear illustrative payment summary. Desktop authentication uses the dining image; mobile keeps the sign-in form near the top. All sample/demo content remains labelled and cannot create orders or payments. Real administrative metrics are not replaced by illustrative data.

## Images

Two original photographs were generated with the built-in `image_gen.imagegen` tool, reviewed and optimized to local 1200×800 WebP files:

- `apps/restaurant-system/pos-admin/public/assets/qr-experience/dining.webp` — approximately 121 KiB.
- `apps/restaurant-system/pos-admin/public/assets/qr-experience/kitchen.webp` — approximately 101 KiB.

They are served by the existing QR asset route and packaged in the administrator build. Noncritical images load lazily. Full prompts and provenance are in [ASSETS.json](ASSETS.json). No text, fake QR code or application interface is embedded in these photographs.

## Verification

See [BROWSER_RESULTS.json](BROWSER_RESULTS.json) and [PUBLIC_LAYOUT_RESULTS.json](PUBLIC_LAYOUT_RESULTS.json) for the final runs. Screenshots are in [evidence](evidence/).

The browser harness uses compiled applications and an isolated QA API/database, with real authentication, tenant/branch permissions, catalog publication, request state and order records. Gateway/SMTP transports are simulated; no real customer messages or funds are used. Existing servers are preserved. The test database's historical migration warning is not a production migration result.

The authenticated browser run enables `JAMANVAAR_QA_QR_PRODUCT=1` and `JAMANVAAR_QA_QR_UI=1`, sets `JAMANVAAR_QA_REPORT_DIR` to this report directory, and runs `node tooling/qa/browser-qr-module.cjs`. The public layout check uses `node tooling/qa/browser-qr-product-layout.cjs` with the same report directory. Browser assertions wait for the real saved response or rendered backend data; the isolated QA API can take longer than the default five-second assertion window.

## Release

This task modifies the repository; it does not deploy production or push a commit. Rebuild and release the `pos-admin` frontend through the existing release process, including its `/qr/` assets. No new database migration or payment configuration is required for these UI repairs. Recheck `/qr/`, `/qr/login/`, `/qr/activate/`, every `/qr/admin/?tab=...` section and the original `/restaurant-admin/qr-ordering` entry after rollout. Existing QR product routing instructions remain in [the deployment guide](../qr-product-2026-10-10/DEPLOYMENT.md).

Unrelated concurrent changes in backend product access and Super Admin onboarding/activation files were preserved; this report covers the QR frontend repairs and shared image-path fix.
