# Kiosk language-screen background

Implemented locally on 15 October 2026. Not deployed or pushed.

## How to configure it

Open **Kiosk Admin → Welcome Screen → Second screen: Choose your language**. Select the branch defaults or a particular kiosk using the existing scope selector, then choose:

- **Keep the original language-screen design**: preserves existing installations' current background.
- **Use the same background as the welcome screen**: follows that terminal's welcome image, portrait/landscape variant, crop, zoom and overlay.
- **Choose a separate background**: select an allowed design or upload a photo from the existing custom background library. Adjust fit, focal position, zoom and readability independently.

Use **Language screen preview** to check the result in portrait or landscape, then **Apply to Kiosk**. Preview changes are not published until applied. Uploaded images share the existing three-image limit with welcome backgrounds.

## Implementation

The language selector now uses a shared renderer for the actual kiosk and Kiosk Admin preview. It uses the restaurant logo and the same enabled-language list as the terminal. Selecting a language still continues to the order-type screen; Back returns to Welcome.

The existing versioned, branch-scoped kiosk configuration and terminal overrides carry the new fields. Server validation applies the same design-access policy to both screens, including terminal overrides. No database migration is required for these fields.

Both screens' portrait and landscape images are retained in the existing offline image cache. The shared image lifecycle handles responsive source selection, fallback images and blob cleanup.

Primary source changes:

- `packages/types/src/domain.ts`: optional language-background mode and presentation.
- `packages/utils/src/kiosk_welcome.ts`: resolve per-terminal inheritance and both screens' cache sources.
- `packages/ui/src/useKioskBackground.ts`, `KioskWelcomeScreen.tsx`, `KioskLanguageScreen.tsx`, `index.ts`: shared image lifecycle and language-screen renderer.
- `packages/i18n/src/language_options.ts`, `index.ts`: shared language choices.
- `apps/kiosk-system/kiosk-user/src/App.tsx`: configured language screen and image prefetch.
- `apps/restaurant-system/pos-admin/src/components/settings/KioskWelcomeScreenPanel.tsx`: editor, uploads, preview and scoped publishing.
- `cloud/api/src/modules/entity-sync/kiosk-configuration-schema.ts`: strict configuration validation.
- `cloud/api/src/modules/platform-settings/welcome-designs.service.ts`: enforce design access for the language screen.

## Verification

- **36 client tests passed** across `tests/kiosk_welcome.test.ts` and `tests/kiosk_configuration.test.ts`: defaults, inheritance, uploaded images, validation, caching and existing configuration behavior.
- **6 API tests passed** in `cloud/api/test/welcome-design-access.e2e.spec.ts`, including added assertions for allowed/denied language designs, branch and terminal persistence, and entity-sync reads.
- API build passed. Restaurant Admin and Kiosk TypeScript checks passed. Both production Vite bundles built successfully; existing chunk-size and mixed printer-import warnings remain.
- **7/7 browser scenarios passed**, using real authentication, activation, configuration publishing and terminal sync against an isolated QA database: original defaults, matching background, separate design/crop, upload, terminal-only override, language selection with portrait/landscape layouts, and offline images. No page errors were recorded. See `evidence/browser-results.json` and screenshots in `evidence/`.

Reproduce using the existing isolated QA environment:

```powershell
node node_modules/vitest/vitest.mjs run tests/kiosk_welcome.test.ts tests/kiosk_configuration.test.ts --maxWorkers=1
node docs/reports/kiosk-language-background-2026-10-15/verify.cjs
node docs/reports/kiosk-language-background-2026-10-15/browser.cjs
```

The browser runner creates and archives a disposable QA restaurant. It does not place orders or contact payment/receipt providers. It requires the existing ignored private QA state and local API/static servers; credentials are not included in this report.

Deploy the API, shared Admin bundle and Kiosk bundle together: older API validation does not recognize the new fields. Physical kiosk hardware and production deployment were not verified in this local run.
