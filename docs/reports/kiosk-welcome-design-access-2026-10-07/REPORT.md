# Kiosk welcome designs, editable hotel name and Super Admin access

Implemented locally on 7 October 2026. This extends the original [welcome-screen implementation](../kiosk-welcome-2026-10-07/REPORT.md). It has not been deployed to AWS or pushed by this task.

## What changed

The original ten designs remain. Six new families bring the bundled collection to **16 designs**, each with a separately composed portrait and landscape image. The new designs use different colours, media and compositions rather than replacing dishes in the same heritage scene.

| New design | Visual direction |
| --- | --- |
| Midnight Spice | Dark navy slate, copper highlights and dramatic food photography |
| Terracotta Table | Rustic clay plaster, linen and asymmetric food photography |
| Teal Pop Kitchen | Bright teal, sculptural shapes and playful food illustration |
| Botanical Bistro | Sage paper, herbs and botanical watercolour |
| Pastel Patisserie | Blush terrazzo, lavender curves and café photography |
| Urban Street Kitchen | Coral graphics, halftone texture and street-food collage |

See [the six new designs](NEW_DESIGNS.jpg). The canonical assets and exact generation prompts are in [the versioned asset folder](../../../packages/assets/branding/kiosk-welcome-v1/README.md) and its manifest. All were generated with the built-in `image_gen` tool. Artwork contains no names, welcome messages, logos or buttons. These remain live UI.

The masters are 1080 × 1920 portrait and 1920 × 1080 landscape. The renderer supports other screen sizes, orientation changes, cover/contain, focal position, zoom and readability overlay. All 64 image/thumbnail assets have different hashes. Total canonical size is 6,891,520 bytes. The 40 original assets retain their original combined size, and generation appended only the six new IDs.

## Restaurant / Kiosk Admin

Open **Kiosk Admin → Kiosk Welcome Screen** (`/kiosk-admin/welcome-screen`). In the shared Restaurant Admin platform, switch to the entitled Kiosk Admin workspace first.

**Hotel name & welcome message** now appears above the background gallery, alongside the live preview. Owners can edit:

- Hotel / restaurant name, welcome greeting and custom welcome message.
- Start Order label, touch instruction, restaurant logo and optional promotion.
- Background, fit, focal point, zoom and overlay.

The name override changes the welcome screen; it does not change the restaurant's legal profile or invoice identity. Empty fields use the restaurant/language defaults.

Use **Apply to** to choose all kiosks in the current branch or an individual terminal. Each terminal can retain its own background and live content. **Use branch default on this kiosk** removes its override. One branch cannot configure another branch's devices.

The gallery reads the restaurant's authorized collection when opened, when the window regains focus, and through **Refresh available designs**. Apply fetches current permissions again. Saved selections outside a newly reduced collection remain visible and may receive text edits, but cannot be newly assigned to another terminal.

## Super Admin

Open **Platform Settings → Kiosk Welcome Designs** (`/settings/platform`).

- Set the platform default maximum number of selectable designs.
- Enable all designs or choose a collection. Platform-disabled designs remain unavailable in every restaurant.
- Select a restaurant to give it a different maximum or selected collection, or restore platform defaults.
- Add a named design with a portrait image and an optional landscape companion.

The maximum takes the first eligible designs in collection order. A restaurant override may raise or lower the default maximum, but cannot enable a design disabled on the platform. The default maximum is 100, which currently exposes all 16 bundled designs and leaves room for future uploads. Restaurant owners cannot change these policies.

Platform images are decoded, validated, re-encoded and stored in the existing durable `PlatformSetting` table. They are not written to a container's temporary filesystem. Metadata and image bytes are stored separately so collection reads do not transfer every full image. Full images are loaded only as needed, with immutable URLs and thumbnails for the gallery. Uploads support PNG/JPEG/WebP through client optimization, still WebP validation on the server, bounded dimensions, a 450 KB optimized image limit, and an authenticated 2 MB request limit. The platform supports up to 80 uploaded designs in addition to the bundled collection.

Catalog permissions allow Super Admin to manage this feature without granting write access to unrelated platform branding settings. Support/read-only roles cannot modify design access. Owner/device credentials cannot upload platform designs.

## APIs and enforcement

| API | Purpose |
| --- | --- |
| `GET /api/v1/platform/settings/kiosk-welcome/designs` | Authorized platform catalog and policy |
| `POST /api/v1/platform/settings/kiosk-welcome/designs` | Add and validate a durable platform design |
| `PATCH /api/v1/platform/settings/platform.kioskWelcome` | Validate and audit counts, enabled designs and restaurant overrides |
| `GET /api/v1/devices/me/welcome-designs` | Only this authenticated restaurant's effective collection |
| `GET /api/v1/public/welcome-designs/:id/:variant` | Public artwork bytes; portrait, landscape or thumbnail |
| Existing `POST /api/v1/entity-sync/KIOSK_CONFIGURATION` | Enforce selection, tenant/branch ownership and registered terminal overrides |
| Existing device `REQUEST_SYNC` command | Deliver configuration and acknowledge its version after caching images |

Policies are checked on the server during configuration publication, not merely hidden in the UI. Invalid counts, duplicate/unknown design selections and nonexistent restaurant overrides are rejected. Custom branch images use a separate `custom-` namespace. Built-in and platform selections are normalized so a permitted ID cannot smuggle a different landscape URL. Already configured restricted designs remain active rather than blanking a kiosk during service.

Selected platform URLs travel in branch/device configuration, so kiosks do not need a live catalog lookup to render them. Both orientations are cached separately from menu images. An offline terminal retains its last published configuration and receives newer configuration on reconnect. Access updates do not force a running customer screen to reset.

## Verification

Final results are recorded beside this report:

- [Unit/regression results](UNIT_RESULTS.json): **88 passed** across welcome assets, uploaded companion isolation, configuration, product contexts, branch authority, responsive rules and image caches.
- [API results](API_RESULTS.json): **30 passed**, including real authentication/database enforcement, Super Admin permissions, restricted selections, namespace/landscape bypass rejection, uploads, preserved selections and tenant/branch isolation.
- [Browser results](BROWSER_RESULTS.json): **19 scenarios passed**, using compiled production apps, the real isolated API, real owner/platform OTP login, real database persistence and three kiosks across two branches. No page exceptions.
- [Asset verification](ASSET_VERIFICATION.json): **64 unique assets**, dimensions/hashes/size verified, **192 compiled copies** matched across Kiosk, Restaurant/Kiosk Admin and Super Admin. Report text checked for private credentials.
- Production builds passed for API, Kiosk, Restaurant/Kiosk Admin and Super Admin. The existing bundle-size warnings remain.

Cross-app checks cover Super Admin changing count/allowed designs → owner gallery updating → direct API restriction enforcement → upload from Super Admin → owner selecting the uploaded design → two kiosks rendering it → offline reload and orientation change.

The two-terminal test additionally saves Midnight Spice/Hotel One on one kiosk and Botanical Bistro/Hotel Two on another, with different messages. Reloads, offline reloads, branch isolation and restoring inheritance are checked. Existing ordering, activation, custom upload/replacement/deletion, resetting, all seven preview resolutions and same-browser branch reactivation remain covered.

During browser QA, an existing Super Admin login health probe was found sending GET to the POST-only login endpoint. It now uses a minimal public `GET /api/v1/health` liveness response; login still uses the normal POST/OTP flow. The recorded browser trace predates the added liveness handler and contains its former 404. Final API tests verify the public response is 200 and the detailed `/api/v1/platform/system-health` endpoint still rejects unauthenticated access with 401. Liveness indicates the API process is reachable; it does not certify database readiness.

Network records include deliberately injected activation failures and a missing-image fallback, plus unauthenticated session-bootstrap 401 responses which recovered. These records are not a claim of zero failed HTTP requests. The final local Apply-to-visible measurement was **347 ms** for the same-branch kiosks; it is not an AWS latency measurement.

## Deployment and limits

Deploy the API and all three frontends together, installing the updated lockfile (Sharp is now an explicit API runtime dependency). No database schema migration is required for this feature. The public artwork route must be handled by the existing API proxy, and the generated bundled assets must be included in the frontend builds.

These checks ran locally against a dedicated disposable test database. Live AWS/CDN delivery, server resource limits and production-browser caches have not been measured or deployed in this task. Public backgrounds are artwork, not private tenant data; design access controls govern selection rather than preventing someone from copying a public image. Restaurant-owned custom uploads remain available under their existing three-image-per-branch limit.
