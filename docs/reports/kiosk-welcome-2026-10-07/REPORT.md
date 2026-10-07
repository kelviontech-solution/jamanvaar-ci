# Kiosk welcome screen and activation

Implemented in the shared platform, with configuration managed in the entitled **Kiosk Admin → Kiosk Welcome Screen** application. The actual customer Kiosk uses the same renderer as the Admin preview.

## What was wrong

The previous welcome screen used a fixed three-column decorative layout with a 440px central block. It had no dedicated background gallery or device preview, and the appearance editor mixed background URLs with other wording. Kiosk had no production app-shell service worker, so browser refresh without signal could fail before its offline database was usable. Rebinding a terminal within the same restaurant could preserve the previous branch's design and sync cursor. Simply covering a landscape screen with the new portrait master cropped out the food. Final QA also exposed an Apply race: a not-yet-loaded fleet list produced no acknowledgement commands even though configuration itself was published. Apply now fetches current registered devices rather than relying on the sidebar's older fleet state.

## Changes

- Ten independently generated scenes: Royal Indian Dining, Modern Indian Dining, Gujarati Thali, North Indian Cuisine, South Indian Cuisine, Indian Street Food, Premium Biryani, Vegetarian Garden, Café & Casual Dining, and Heritage Sweets.
- Every design has a 1080×1920 portrait master and a separately composed 1920×1080 landscape companion. A container observer chooses the appropriate composition on both the actual Kiosk and the preview. Custom photos keep their owner's composition and fit controls.
- No baked-in restaurant names, logos, welcome copy or buttons. Restaurant identity, logo, heading, subtitle, promotion, touch instruction and Start Order remain live UI. Long names wrap within the card.
- Gallery with Default/Custom, Active and Selected badges, immediate preview, a device frame, seven resolution presets, cover/contain, focal position, zoom and readability overlay.
- A clean editor adopts configuration received from another session; an unsaved draft is preserved and a stale save is refused so it cannot overwrite someone else's settings. Controls pause during publication/upload so a save completion cannot erase newly entered text or another selected design.
- Apply to all kiosks in the current branch or a specific registered kiosk. Individual overrides can return to branch inheritance. Reset has a confirmation and restores both background and welcome content defaults.
- PNG/JPEG/WebP upload, replacement and deletion. Original limit 12MB; minimum dimensions 640px on both sides, maximum 12000px, aspect ratio 0.3–3. Decoded files are re-encoded as WebP with longest side at most 1920px and at most 450KB. Three custom designs per branch. An image referenced by an active branch/device or the current draft cannot be deleted.
- Existing authenticated `KIOSK_CONFIGURATION` entity sync stores branch configuration and device overrides. Existing version timestamps, SSE/catch-up and `REQUEST_SYNC` commands deliver changes. A kiosk acknowledges the actual configuration version only after the selected compositions are cached. The Admin displays publication and acknowledgement separately.
- Backend and Branch Core reject malformed configuration scope IDs and overrides targeting unknown, non-kiosk or another branch's devices. Existing tenant and entitlement guards continue to authorize the writer and reader. Kiosks cannot author configuration.
- Dedicated bounded welcome-image cache, separate from menu pruning. Active portrait/landscape and default fallback compositions are cached. Concurrent downloads are coalesced. Missing images fall back safely; object URLs are cleaned up. Production Kiosk shell now supports offline reload without caching authenticated APIs, writes or streams.
- Branch reactivation clears previous branch presentation, legal receipt details, configuration version and all configuration cursor variants; same-branch activation preserves pending edits.
- Activation has a clearer form, local background asset, responsive form-first layout on narrower screens, live network indicator, functioning help and safe errors for invalid ID/key, expired/used key, offline/network/server conditions. Actual successful activation and ordering behavior are retained.

## Storage, API and assets

No database migration is required. Configuration remains in the existing restaurant-scoped synced entity JSON; uploads are optimized and stored in that branch configuration, rather than raw originals or an external image host.

Existing endpoints used: `POST/GET /api/v1/entity-sync/KIOSK_CONFIGURATION`, `GET /api/v1/devices/me/fleet`, `POST /api/v1/devices/me/fleet/:id/commands`, device command acknowledgements, activation lookup/redeem and the existing realtime stream.

Canonical artwork is in `packages/assets/branding/kiosk-welcome-v1/`. `manifest.json` preserves built-in `image_gen` prompts, original output names, dimensions, byte counts and content hashes for every composition. `tooling/dev/sync_welcome_backgrounds.mjs` verifies and copies assets into both apps through the existing predev/prebuild preparation. Generated public copies are intentionally ignored; the canonical assets are versioned.

## Verification

87 unit/regression tests and 24 backend integration tests pass. Both frontend production builds pass. Canonical assets total approximately 3.8MB including all thumbnails; all 40 optimized files have distinct verified hashes, and all 80 copies bundled across the two apps match. Each full composition is below 450KB.

**16/16 Playwright workflow checks pass, with zero page errors.** Browser QA uses actual compiled Kiosk/Admin, an isolated API and dedicated test database, real owner/device authentication and disposable restaurant/branch/device fixtures. Expired/used/server activation replies and network failure are explicitly injected negative cases; browser offline is real. These are not claims about production failures.

Verified in the browser:

- Activation form at all seven sizes, help, loading, invalid ID/key, expired/used key, server/network/offline errors and actual activation success.
- Ten gallery entries and all twenty full compositions decode. Preview changes do not publish data.
- Actual Apply → backend configuration → two kiosks in the current branch → matching version/cache acknowledgement, with the other branch unchanged. This also exercises Apply before the sidebar fleet finishes loading.
- Measured local Apply-to-visible propagation was **498ms** in the final run. This is a single isolated local observation, not an AWS latency guarantee.
- Cover/contain, focal position and zoom propagate; individual overrides and restored inheritance work.
- Actual canvas upload optimization, replacement, reload persistence, rejected SVG, active-image deletion protection, unused-image deletion and reset of both design and content.
- Short, medium and long names persist. Welcome and Admin have no horizontal overflow at 768×1024, 800×1280, 820×1180, 1024×768, 1280×800, 1366×768 and 1920×1080. The welcome button remains within the viewport. Screenshots wait until the startup overlay has disappeared.
- Missing legacy URL safely displays the cached default.
- Full offline reload with Chromium HTTP cache disabled, portrait/landscape rotation while offline, reconnect to a newer configuration, reload and a closed/reopened persistent browser profile.
- Denied wrong-branch/unknown-device writes and kiosk configuration authorship; actual Start Order → language → order-type flow; actual same-browser reactivation in another branch clears the previous design.

Evidence: `BROWSER_RESULTS.json`, `UNIT_RESULTS.json`, `API_RESULTS.json`, `ASSET_VERIFICATION.json` and `evidence/`. The recorded HTTP responses include intentionally rejected negative cases and a transient Admin authentication-bootstrap 401 during reload; the app recovers and subsequent authenticated workflow checks pass.

Repeatable commands: `node tooling/qa/browser-kiosk-welcome.cjs`, `node tooling/qa/run-kiosk-welcome-api-tests.cjs`, and the seven focused Vitest suites listed in `UNIT_RESULTS.json`. The browser/API runners require the existing private dedicated-test fixture configuration; they never use the production database and clean up their disposable tenant and owned servers.

## Deployment and limits

Build and deploy the API, Kiosk and Admin together so the new schema, acknowledgement fields and bundled compositions match. This task has not deployed to AWS or measured the live production server. The existing dedicated test database reports two older pending QR/payment migrations; this feature adds none and did not change those migrations.

Branch-wide and device-specific scope are supported. Configure each branch independently; there is no new restaurant-wide cross-branch broadcast control. Custom image library size is deliberately bounded at three per branch. Offline testing covers cached reload, rotation, reconnect and browser restart; first-time activation requires an internet connection.
