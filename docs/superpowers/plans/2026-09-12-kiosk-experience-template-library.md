# Kiosk Experience — Template Library (Super Admin → Restaurant/Kiosk Admin → Live Kiosk)

## Context

Today, a kiosk's Welcome and Language-Selection screens have no design flexibility beyond a few text overrides (`WelcomeScreenSettingsRepository` in `packages/database`) and hardcoded local image paths (`/left-food-panel.png`, `/right-food-panel.png`, `/language-selection-bg.png`) baked into `apps/kiosk-system/kiosk-user/src/App.tsx`. Every restaurant's kiosk looks identical, and changing it means editing code.

The ask is a **controlled template system**: Super Admin curates a global library of professional Welcome/Language-Selection designs (background + optional left/right decoration; center content — logo, heading, Start Order button, language buttons — always stays real HTML, never baked into an image). Restaurant Admin and Kiosk Admin can then **select** (never create) a published design for their own restaurant. This is explicitly not a Canva-style builder — no drag-and-drop, no arbitrary CSS/font/color editing, just a curated picklist of whole, professional designs.

This plan covers all three layers end to end (Super Admin management → Restaurant/Kiosk Admin selection → live kiosk rendering) so implementation can proceed phase by phase later without re-deriving the architecture. **Nothing is being coded now** — this is the planning artifact only, per explicit instruction ("plan accordingly, give me only planning file, maybe we implement on another day").

### Confirmed decisions (from user clarification)
- **Who sees what**: Kiosk Admin (`apps/kiosk-system/kiosk-admin`) and Restaurant Admin (`apps/restaurant-system/pos-admin`) can only **select** an already-published template — no create/edit/upload capability there. Super Admin (`cloud/super-admin-web`) is the only place designs are created/edited/published/disabled.
- **Read access on the Super Admin side**: any active platform staff can view the Kiosk Experience list (useful for support/ops to see what exists); only `PLATFORM_OWNER`/`SUPER_ADMIN` roles can create/edit/publish/disable/delete, enforced at the API, not just hidden in the UI.
- **Scope of this pass's plan**: covers all three phases below, but explicitly does NOT hand-wave the hardest part (Phase C, live kiosk rendering) — it's designed concretely because it's the part most likely to be gotten wrong if deferred without a design.

---

## Architecture at a glance

```
cloud/api (Prisma/NestJS)              — owns the global KioskTemplate table
   ↑ CRUD, Super-Admin-only writes       ↑ read-only, tenant-authenticated
cloud/super-admin-web                  apps/restaurant-system/pos-admin
  "Kiosk Experience" section             + apps/kiosk-system/kiosk-admin
  (create/edit/preview/publish)          "Kiosk Experience" settings panel
                                          (pick from published templates)
                                                    ↓ writes Restaurant.welcomeTemplateId /
                                                      Restaurant.languageTemplateId (cloud)
                                                    ↓
                                          apps/kiosk-system/kiosk-user
                                          (fetches its restaurant's assigned
                                           template + renders it — Phase C)
```

Key existing pieces this reuses (do not rebuild):
- **cloud/api module pattern**: `src/modules/activation-keys/` (file layout) + `src/modules/application-entitlements/` (zod DTO style) — both use `PrismaService.runAsPlatform()` for global data, `AuditService.log()` inside the same transaction, and `ZodValidationPipe`.
- **cloud/api asset upload**: `src/modules/master-catalog/master-catalog.service.ts` `uploadImage()` — base64-JSON POST, written to `cloud/super-admin-web/public/assets/uploads/<folder>/`, returns a relative URL. No S3/multer exists for images (S3 exists only for backups, `backup-storage.service.ts`).
- **super-admin-web page pattern**: `src/pages/ActivationKeys/ActivationKeysListPage.tsx` (list+modal CRUD), `src/api/client.ts` (`api.get/post/patch/delete`, auto-refreshing auth), `src/components/ui.tsx` (`Button`, `Card`, `Badge`+`statusTone`, `Modal`, `ConfirmModal`, `SkeletonTable`, `PageHeader`, `SearchBar`, `FilterTabs`), sidebar in `src/layout/ProtectedLayout.tsx` (`NAV_GROUPS` array), routes in `src/app/App.tsx`.
- **pos-admin tenant cloud pattern**: `src/cloud/cloudClient.ts` already has a rich set of tenant-authenticated fetchers (`fetchEntitlements`, `fetchTenantAiConfig`, `fetchTenantBillingSummary`, etc.) — this is the exact precedent for the new `fetchPublishedKioskTemplates()` / `fetchKioskTemplateAssignment()` / `setKioskTemplateAssignment()` calls.
- **kiosk-admin existing Welcome Settings panel**: `apps/kiosk-system/kiosk-admin/src/App.tsx` (~line 4210–4300) already has a live "Welcome Screen Settings" section reading/writing `WelcomeScreenSettingsRepository` (headingText, subtitleText, showHeritageArtwork, showPromoBanner, etc.) — the new "choose a template" control is added **into this existing panel**, not a new page.
- **kiosk-admin cloud connectivity**: `apps/kiosk-system/kiosk-admin/src/cloud/cloudClient.ts` already does `connectDeviceStep1/2` + `staffLogin` (tenant auth) — this app already has a real, authenticated `restaurantId` and session, unlike kiosk-user.
- **kiosk-user's current isolation**: `apps/kiosk-system/kiosk-user/src/cloud/cloudClient.ts` only ever calls `activation/redeem` and Razorpay payment endpoints — zero visual/config data comes from the cloud today. This is the one place genuinely new plumbing is required (Phase C).

---

## Phase A — Super Admin: global template library (cloud/api + cloud/super-admin-web)

### A1. Prisma schema (`cloud/api/prisma/schema.prisma`)

New enums + model (global, no `restaurantId`, no RLS — same ownership model as `Plan`):

```prisma
enum KioskTemplateType {
  WELCOME
  LANGUAGE_SELECT
}

enum KioskTemplateStatus {
  DRAFT
  PUBLISHED
  DISABLED
}

model KioskTemplate {
  id                 String              @id @default(uuid())
  name               String
  description        String?
  type               KioskTemplateType
  status             KioskTemplateStatus @default(DRAFT)
  supportsPortrait   Boolean             @default(true)
  supportsLandscape  Boolean             @default(false)
  backgroundAssetUrl String?
  leftAssetUrl       String?
  rightAssetUrl      String?
  sortOrder          Int                 @default(0)
  isFeatured         Boolean             @default(false)
  publishedAt        DateTime?
  disabledAt         DateTime?
  createdAt          DateTime            @default(now())
  updatedAt          DateTime            @updatedAt

  welcomeRestaurants  Restaurant[] @relation("RestaurantWelcomeTemplate")
  languageRestaurants Restaurant[] @relation("RestaurantLanguageTemplate")

  @@index([type, status])
  @@index([status, sortOrder])
}
```

Two nullable FKs on `Restaurant` (lines ~91–132 today):
```prisma
  welcomeTemplateId  String?
  languageTemplateId String?
  ...
  welcomeTemplate  KioskTemplate? @relation("RestaurantWelcomeTemplate",  fields: [welcomeTemplateId],  references: [id], onDelete: SetNull)
  languageTemplate KioskTemplate? @relation("RestaurantLanguageTemplate", fields: [languageTemplateId], references: [id], onDelete: SetNull)
```
Plus `@@index([welcomeTemplateId])` / `@@index([languageTemplateId])`.

**Why direct FKs, not a syndication-style join table** (`RestaurantMenuSyndication` is the closest existing analogy but adds customization/drift-tracking machinery this feature doesn't need — a restaurant either points at a template or doesn't, no per-restaurant payload). If per-restaurant overrides are ever needed, a join table can supersede this later without having paid for it now.

**Orientation as two booleans**, not an array/enum-list column — the repo has no queryable array-column precedent (arrays are stored as unqueryable `Json?` elsewhere), booleans are directly filterable (needed by Phase B/C reads), and the set is closed at exactly two members. The API still exposes `supportedOrientations: ('PORTRAIT'|'LANDSCAPE')[]` at the contract layer, derived from the two booleans.

`onDelete: SetNull` is a backstop only — the service still blocks hard-deletes of in-use templates (see A2).

Migration: `cd cloud/api && npx prisma migrate dev --name kiosk_experience_templates && npm run prisma:generate`, then restart the cloud-api dev server. No manual RLS SQL needed (global table, no `restaurantId` on it).

### A2. Backend module — `cloud/api/src/modules/kiosk-templates/`

Layout: `kiosk-templates.controller.ts`, `kiosk-templates.service.ts`, `kiosk-templates.module.ts`, `dto/kiosk-template.dto.ts` — mirrors `activation-keys`.

**New reusable role primitive** (doesn't exist yet — `PlatformAuthGuard` verifies identity but never checks role today):
- `src/common/decorators/roles.decorator.ts` — `export const Roles = (...roles: PlatformRole[]) => SetMetadata('platformRoles', roles);`
- `src/common/guards/roles.guard.ts` — reads required roles via `Reflector`, reads `request.platformUser.role` (set by `PlatformAuthGuard`, which must run first), 403s with a clear message if not in the list. No-op (returns true) when a route has no `@Roles(...)`.
- Composition: `@UseGuards(PlatformAuthGuard, RolesGuard)` at controller level, `@Roles(PlatformRole.PLATFORM_OWNER, PlatformRole.SUPER_ADMIN)` on mutation handlers only.

**⚠️ Verified critical fact**: the actual seeded/logged-in Super Admin account (`superadmin@jamanvaar.app`) has role `PLATFORM_OWNER`, not `SUPER_ADMIN` (confirmed in `cloud/api/prisma/seed.ts` and `schema.prisma`'s `PlatformRole` enum). The role allow-list **must** include both, or the real admin locks themselves out.

Endpoints:
| Method | Route | Guard |
|---|---|---|
| GET | `/api/v1/kiosk-templates` | `PlatformAuthGuard` only (any active staff) |
| GET | `/api/v1/kiosk-templates/:id` | `PlatformAuthGuard` only |
| POST | `/api/v1/kiosk-templates` | + `@Roles` |
| PATCH | `/api/v1/kiosk-templates/:id` | + `@Roles` (type is immutable after creation) |
| PATCH | `/api/v1/kiosk-templates/:id/publish` | + `@Roles` — validates background asset exists, ≥1 orientation, name non-empty |
| PATCH | `/api/v1/kiosk-templates/:id/disable` | + `@Roles` — never touches any restaurant's assignment |
| DELETE | `/api/v1/kiosk-templates/:id` | + `@Roles` — 409 if `Restaurant.welcomeTemplateId` or `languageTemplateId` references it, with a message + "disable instead" |
| POST | `/api/v1/kiosk-templates/upload-image` | + `@Roles` |

DTOs use zod (`createKioskTemplateSchema`, `.partial().omit({type:true})` for update, `uploadKioskAssetSchema`), validated via `ZodValidationPipe`.

**Delete safety** (inside the same `runAsPlatform` transaction as the delete):
```ts
const refs = await tx.restaurant.count({ where: { OR: [{ welcomeTemplateId: id }, { languageTemplateId: id }] } });
if (refs > 0) throw new ConflictException(`In use by ${refs} restaurant(s) — disable instead.`);
```
`disable()` deliberately never clears assignments — that's how "a restaurant using a disabled template keeps working" is satisfied by construction, not by extra code.

**Upload endpoint**: adapt `MasterCatalogService.uploadImage` exactly, writing to `cloud/super-admin-web/public/assets/uploads/kiosk-experience/`, with two deliberate hardenings over that precedent: drop `image/svg+xml` from the allowlist (stored-XSS risk for full-screen assets served statically) and raise the size cap to 8MB (full-bleed 1080×1920 photography is larger than catalog thumbnails).

Register `KioskTemplatesModule` in `cloud/api/src/app.module.ts`'s `imports` array, next to `MasterCatalogModule`.

### A3. Super Admin web (`cloud/super-admin-web`)

- **Sidebar** (`src/layout/ProtectedLayout.tsx`): add a `Monitor` icon import, one new item in the `SaaS Management` group next to "Master Menu Catalog": `{ to: '/kiosk-experience', label: 'Kiosk Experience', icon: Monitor }`.
- **Routes** (`src/app/App.tsx`): `/kiosk-experience` (list), `/kiosk-experience/new`, `/kiosk-experience/:id` (editor), inside the existing `<Route element={<ProtectedLayout/>}>` block, using the existing `page('Name', <Component/>)` wrapper.
- **New folder** `src/pages/KioskExperience/`:
  - `KioskExperienceListPage.tsx` — mirrors `ActivationKeysListPage.tsx`: `PageHeader` + "New Template" button, `FilterTabs` (type) + `SearchBar`, `SkeletonTable`/`EmptyState`/`ErrorState`, `data-table` with thumbnail/name/type/status/orientations/featured/"used by N restaurants"/actions columns. Status badge via a **local** `templateStatusTone()` helper (not extending the shared one — `DRAFT→warning` would collide with the existing invoice `DRAFT` badge elsewhere).
  - `KioskTemplateEditorPage.tsx` — a **full page, not a modal** (justification: three upload fields + a live side-by-side preview don't fit the app's 560–760px modal width). Two-column layout: form on the left, sticky live preview on the right. Type select disabled when editing (immutable). Asset fields conditional on type.
  - `KioskTemplatePreview.tsx` — portrait/landscape toggle; renders a fixed-aspect frame (9:16 or 16:9) with layered background image + legibility wash + a 3-column grid (left decoration / center sample content / right decoration) — the percentage-split grid is what structurally guarantees decoration can never overlap the center, mirroring (not literally reusing — different stack, Tailwind vs plain CSS) the real kiosk's `App.tsx` layout rules. Center shows sample logo/heading/subtitle/Start Order for WELCOME, or sample English/हिन्दी/ગુજરાતી pills for LANGUAGE_SELECT.
  - `KioskAssetUploadField.tsx` — reuses the `MasterCatalogPage` base64-upload pattern (fixed to properly await/catch the upload instead of that page's dangling-promise bug), same `.image-upload-zone`/`.image-preview-wrap` CSS classes copied into a new `kiosk-experience.css` (not importing the catalog page's stylesheet wholesale).
- **Types** (`src/api/types.ts`): append `KioskTemplate`, `KioskTemplateDetail`, `CreateKioskTemplateInput`, `UpdateKioskTemplateInput` in a new section, following the file's existing flat-file convention.

### A4. Validation before publish
- Upload time (server, authoritative): content-type allowlist, 8MB cap, filename sanitized.
- Upload time (client, fast feedback): `Image()` dimension check — hard-block under 800px on either axis, soft-warn (non-blocking) if aspect ratio is far off the declared orientation.
- Publish time (server, the real gate): background asset required, name non-empty, ≥1 orientation checked, optional `fs.existsSync` check that the uploaded file still exists on disk. A WELCOME template with no left/right assets is allowed (a full-bleed background alone is a legitimate design) but the editor shows a non-blocking heads-up before publish.

---

## Phase B — Restaurant Admin & Kiosk Admin: select a published template

Both apps get the same conceptual capability; implement kiosk-admin first (it already has richer settings-panel real estate for this) then mirror into pos-admin.

### B1. New read endpoints on `cloud/api` (tenant-authenticated, reuses `TenantAuthGuard` — already exists, used by billing/entitlements endpoints)
- `GET /api/v1/tenant/kiosk-templates?type=WELCOME&status=PUBLISHED` — list templates a tenant may choose from. Only ever returns `PUBLISHED` regardless of query (server-enforced, not trusted from the client).
- `GET /api/v1/tenant/kiosk-templates/assignment` — returns the restaurant's current `welcomeTemplateId`/`languageTemplateId`, each resolved to its live `KioskTemplate` row (or `null` if unset/disabled since assignment — disabled templates should still resolve for display purposes so the admin can see "your current pick was disabled, choose a new one," but must not appear in the pickable list).
- `PATCH /api/v1/tenant/kiosk-templates/assignment` — body `{ welcomeTemplateId?: string|null, languageTemplateId?: string|null }`, runs inside `runAsTenant(restaurantId, ...)`, validates the target template is `PUBLISHED` and matches the expected `type` before assigning (a tenant should not be able to assign a LANGUAGE_SELECT template as their `welcomeTemplateId` via a hand-crafted request).

### B2. kiosk-admin (`apps/kiosk-system/kiosk-admin`)
- Extend the existing Welcome Screen Settings panel (`App.tsx` ~line 4210–4300) with a new "Kiosk Experience" sub-section: fetch published WELCOME + LANGUAGE_SELECT templates via two new `cloudClient.ts` functions (`fetchPublishedKioskTemplates(type)`, `fetchKioskTemplateAssignment()`, `setKioskTemplateAssignment(...)`), following the exact shape of the existing `connectDeviceStep1/2`/`staffLogin` calls in that file.
- UI: a simple grid of template thumbnails (background asset as the card image, name below, "Currently selected" badge on the active one) — a picklist, not a builder. Selecting one calls the PATCH endpoint and shows a toast; no preview builder, no customization controls, matching "Restaurant/Kiosk Admins do NOT create designs."
- If the assigned template is `DISABLED`, show a small inline notice ("This design was retired — pick a new one") without breaking anything (the existing local `WelcomeScreenSettingsRepository` text overrides continue to apply on top regardless of which template is chosen, since those are orthogonal — text vs. visual template).

### B3. pos-admin (`apps/restaurant-system/pos-admin`)
- Same two-endpoint contract, same picklist UI pattern, added to whatever settings area is most analogous (likely a "Kiosk" or "Branding" settings tab) — added via the same `fetchTenantAiConfig`-style function pattern already in `pos-admin/src/cloud/cloudClient.ts`.

---

## Phase C — Live kiosk rendering (`apps/kiosk-system/kiosk-user`)

This is the part most likely to be under-designed if left purely as "future work," so it's spelled out concretely even though it's not being built now.

**The core problem**: kiosk-user is currently a fully local, offline-first app for its visuals — no network call exists for Welcome/Language screen content, and its only real cloud identity is a `deviceToken` + `restaurantId` obtained once at device activation (`activateKioskDevice` in `cloudClient.ts`), used today only for Razorpay payments.

**The bridge**: the activation flow already resolves a real `Device → Restaurant` relationship server-side — this is the identity anchor Phase C needs, no new identity concept required.

1. New device-authenticated endpoint: `GET /api/v1/kiosk/experience` (guarded by the existing device-auth mechanism used by payment endpoints — check `DeviceAuthGuard` or equivalent already backing `deviceFetch`-based routes). Resolves the device's `restaurantId` → `Restaurant.welcomeTemplate`/`languageTemplate` → returns `{ welcome: { backgroundAssetUrl, leftAssetUrl, rightAssetUrl, supportedOrientations } | null, language: { backgroundAssetUrl, leftAssetUrl, rightAssetUrl } | null }`. Returns `null` for either slot if unassigned or the resolved template is somehow gone — **never** a broken reference.
2. In `kiosk-user`, add `getKioskExperienceConfig()` to `cloudClient.ts` (same `deviceFetch` pattern as `getPaymentOrderStatus`), called once on boot (or once after activation) and cached into a small piece of React state alongside `welcomeSettings`.
3. In `App.tsx`'s WELCOME and LANGUAGE_SELECT render blocks: swap the hardcoded `/left-food-panel.png` / `/right-food-panel.png` / `/language-selection-bg.png` `<img src>`/`background-image` values for the fetched URLs **when present**, falling back to today's hardcoded local assets when the fetch returns `null`, fails, or hasn't resolved yet (offline-first guarantee: the kiosk must never go blank waiting on a network call it might not get). This is a small, mechanical change to the existing JSX once the config is in state — the layout/safe-area code doesn't change at all.
4. No schema change needed for this phase — Phase A's schema already carries everything Phase C reads.

**Explicitly deferred, not designed here**: any mechanism for combining a template's visuals with a restaurant's already-existing local text overrides (`welcomeSettings.headingText` etc.) beyond "render them as siblings" — today's overrides sit on top of the background/decoration layer already, so no interaction is expected, but this should be re-verified once Phase C is actually built.

---

## Verification plan (once implemented)

**Phase A**: create → edit → preview (portrait/landscape) → publish (blocked without background, succeeds with one) → disable (assignment untouched — verify via Prisma Studio by manually setting `Restaurant.welcomeTemplateId`, disabling the template, confirming the FK is still set) → delete (blocked with 409 while referenced, succeeds once unreferenced or disabled-instead). Role check: log in as the seeded `PLATFORM_OWNER` (must succeed on mutations); create a second platform user via the existing invite flow (`POST /api/v1/platform-users/invite` with `role: 'READ_ONLY'`) and confirm they get `200` on GET but `403` on POST/PATCH/DELETE.

**Phase B**: publish a template in Super Admin, confirm it appears in kiosk-admin's picklist immediately (no caching lag), select it, confirm the assignment PATCH succeeds and persists across a page reload. Disable it from Super Admin, confirm kiosk-admin shows the "retired" notice but doesn't crash, and a fresh pick works.

**Phase C**: activate a kiosk-user device against a restaurant with an assigned template, confirm the real background/decoration render instead of the hardcoded defaults; unassign the template, confirm the kiosk falls back cleanly; simulate the config fetch failing (offline), confirm the kiosk still boots on the local defaults.

---

## Critical files reference
- `cloud/api/prisma/schema.prisma` — Restaurant model (~line 91), Plan/Subscription pattern for "global + assignment" precedent
- `cloud/api/src/modules/master-catalog/master-catalog.service.ts` — upload pattern to adapt (`uploadImage`, ~line 246)
- `cloud/api/src/common/guards/platform-auth.guard.ts` — composition point for the new `RolesGuard`
- `cloud/api/prisma/seed.ts` — confirms seeded admin's role is `PLATFORM_OWNER`
- `cloud/super-admin-web/src/pages/ActivationKeys/ActivationKeysListPage.tsx` — CRUD page pattern
- `cloud/super-admin-web/src/pages/Catalog/MasterCatalogPage.tsx` — upload widget pattern
- `apps/restaurant-system/pos-admin/src/cloud/cloudClient.ts` — tenant-fetch precedent (`fetchEntitlements`, `fetchTenantAiConfig`)
- `apps/kiosk-system/kiosk-admin/src/App.tsx` (~line 4210–4300) — existing Welcome Settings panel to extend
- `apps/kiosk-system/kiosk-user/src/App.tsx` (~line 1596–1680) — WELCOME/LANGUAGE_SELECT render blocks Phase C ultimately edits
- `apps/kiosk-system/kiosk-user/src/cloud/cloudClient.ts` — where the new device-authenticated fetch is added
