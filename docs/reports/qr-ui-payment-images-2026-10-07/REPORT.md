# QR mobile payment, branding and menu pictures — 7 October 2026

## What was fixed

- The guest menu now uses Jamanvaar's existing logo, ivory background, navy headings and saffron actions. It has photo cards, a restaurant hero, visible table identity, a cart with pictures, checkout progress, clear payment choices and receipt/status styling. Restaurant branding remains supported. No external fonts or generated food photos were added.
- Online payment is offered by default **only when** the restaurant has an ACTIVE payment connection and the server has the Razorpay key ID, key secret and webhook verification secret. An owner's existing explicit opt-out remains authoritative. Mobile checkout shows the online option with an explanation when unavailable, rather than silently removing it.
- Restaurant Admin → QR Table Ordering → Settings now reports whether online checkout is ready, whether the switch is enabled, and the action needed to complete setup. These authenticated diagnostics never expose credentials or bank details. Public guests receive only a general availability message.
- The guest build reuses the POS public asset library. It includes 163 existing menu assets and the existing Jamanvaar logo without maintaining another copy of the library in source control.
- A shared image resolver sends bundled photos to the app serving the current page: `/restaurant-admin/assets/menu/...`, `/pos/assets/menu/...`, `/kiosk/assets/menu/...`, `/captain/assets/menu/...`, `/kds/assets/menu/...`, or `/q/assets/menu/...`. Root deployments and desktop shells retain root paths. Uploaded pictures and external URLs remain supported.
- POS, Restaurant Admin, Captain and Kiosk menu cards, relevant carts, menu editors, template previews and image pickers use the shared image component. Offline warming uses the same resolved addresses. Missing/broken pictures use a local neutral placeholder; fallback errors cannot start an infinite loop, and an older cache lookup cannot replace a newer dish's picture.
- The offline image cache rejects HTTP 200 HTML responses and removes previously cached HTML. A SPA fallback page is no longer treated as a successfully downloaded photo.
- Cache reads, writes and pruning now use the same absolute browser URL. Relative catalog URLs previously differed from `Cache.keys()` results, which could evict still-needed pictures and download them again on the next menu sync.

## Evidence and limits of diagnosis

**Confirmed locally:** the development database had no QR settings rows, so the previous `allowOnlinePayment: false` default hid online checkout, even with active restaurant payment connections. The local API environment had all three required configuration variables present; their values were not printed or changed. Six of the 174 local menu records had no assigned image; 168 had local asset paths. The former QR guest build contained no bundled menu images.

**Confirmed read-only on production:** the existing guest bundle contained the earlier online-checkout UI. Sample root JPEG/SVG menu URLs already returned HTTP 200 with image content types, whereas the sampled `/q/assets/menu/...` URL returned 404. Therefore, this audit does not assert that every production photo was missing for the same reason, or that a particular production restaurant's settings were inspected. No production orders, payments or settings were changed.

**Confirmed code issue, tested locally:** the old cache accepted any successful HTTP response, including HTML, as a photo. App-prefixed image resolution avoids depending on a different app's root asset deployment. Pictures with no assigned URL still require the owner to upload/select a suitable picture; this change does not fabricate photographs of their food.

## Verification

- **84 API tests passed:** QR SaaS isolation/settings, menu control and 15 QR payment tests. New checks cover an active connection without a QR settings row, default preservation when another setting is saved, explicit owner opt-out, and rejection of payment diagnostics to a POS terminal.
- **27 unit tests passed:** image routing, offline cache, bundled menu image integrity and guest cart behaviour. Cache tests specifically cover HTTP 200 HTML rejection, recovery from an old HTML cache entry, and retaining a relative menu photo across a second offline sync without another download.
- **27 Playwright checks passed:** cold QR link, image decoding at all seven app routes, logo/dish image rendering, broken-picture fallback, six mobile widths, language/diet/search, cart/history recovery, cash order → actual POS/KDS, KDS status → guest, owner price publishing, and online pending → signed payment → one KDS ticket → receipt. The unavailable-online and ready-online checkout screens were captured.
- All menu assets were present in the seven built frontend distributions; see [asset inventory](ASSET_INVENTORY.json). Five representative assets were decoded in a browser at each application route. These asset checks do not claim that every page of every application was retested.
- Builds passed for Cloud API, QR Guest, POS, Restaurant Admin, Captain, KDS, Kiosk and Super Admin. Root TypeScript checking and whitespace validation passed.

Browser testing used compiled applications, a real isolated API/database, and a **simulated external payment provider**. It did not charge a customer or test a physical phone's UPI app switch. QA restaurants/plans were deleted after the run. The QA guest build used `VITE_CLOUD_API_BASE_URL=http://localhost:4010`; omitting this build-time setting intentionally prevents a production bundle from making API calls.

See [browser results](BROWSER_RESULTS.json) and [screenshots](evidence/).

## Production rollout

These changes require deployment before the live mobile page changes. Rebuild the backend and frontend containers from this revision; the guest build must receive `VITE_CLOUD_API_BASE_URL` through the existing Compose build arguments. Use the real HTTPS `PUBLIC_ORIGIN`/`QR_ORDER_BASE_URL`, not the QA address.

The migration `20261007010000_qr_online_default` changes the database default for **future** QR settings rows only. It does not rewrite existing owner/branch choices. The backend's existing container entrypoint runs `prisma migrate deploy`; non-container deployments should run the project's `prisma:deploy` script with the appropriate migration database role. The application also persists the effective settings when it creates a new settings row.

For an existing restaurant that explicitly has online payment off: open QR Table Ordering → Settings and turn on Online payment. If readiness reports missing server configuration or inactive collection, complete that setup first. Razorpay Route approval is not required for the existing Jamanvaar collection/manual payout path. This change preserves zero kiosk commission on QR table orders; the kiosk-only fee remains separate.

After deployment, scan an existing table QR on a physical phone, confirm assigned dish pictures, perform a controlled real-provider UPI payment, and verify the same order/amount in POS, KDS and the guest receipt. Production gateway operation, physical-device behaviour and AWS latency remain deployment checks.
