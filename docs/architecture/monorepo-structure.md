# JAMANVAAR Monorepo Structure — Audit & Migration Proposal

**Status: proposal only — nothing in this document has been executed.** No folders have been moved, renamed, or deleted. This is Phase A (audit) + Phase B (proposal) of the migration strategy; Phase C (actual migration) requires explicit approval, and even then proceeds in the small, independently-verifiable steps below — not as one big move.

Everything in this document was verified against the actual repository on 2026-09-05, not against the older architecture reports (which are noted below where they disagree with reality).

---

## A. Current structure audit

| Folder | Responsibility | Source or generated | Used by current build? | Verdict |
|---|---|---|---|---|
| `apps/kiosk-system/kiosk-user` | Customer self-order kiosk (React/Vite) | Source | Yes — real workspace member, built by `npm run build:kiosk` | Keep |
| `apps/kiosk-system/kiosk-admin` | Kiosk fleet/catalog admin (React/Vite) | Source | Yes | Keep |
| `apps/kiosk-system/shared` | `@jamanvaar/kiosk-shared` — 28-line package (2 unused interfaces + a constant) | Source | **No** — aliased in kiosk-user/kiosk-admin's `vite.config.ts`, but grep confirms zero actual `import ... from '@jamanvaar/kiosk-shared'` anywhere in the codebase | Dead scaffolding — remove |
| `apps/restaurant-system/pos` | Cashier/counter POS (React/Vite) | Source | Yes | Keep |
| `apps/restaurant-system/pos-admin` | Restaurant back-office / admin console | Source | Yes | Keep |
| `apps/restaurant-system/captain` | Waiter table-side ordering | Source | Yes | Keep |
| `apps/restaurant-system/kds` | Kitchen Display System | Source | Yes | Keep |
| `apps/restaurant-system/shared` | Referenced by `@jamanvaar/restaurant-shared` alias in pos/pos-admin/captain's `vite.config.ts` | — | **Does not exist on disk.** The alias points at a directory that was never created | Broken/dead alias — remove |
| `apps/kitchen-system/kds` | — | Asset dump only (`public/assets/menu/**`), no `src/`, no `package.json` | Not an npm workspace member (`workspaces` glob only covers `kiosk-system/*` and `restaurant-system/*`). Only reference anywhere in the repo: `scripts/prepare_menu_images.mjs` copies menu images into it as a **stale write target** left over from before Captain/KDS were consolidated under `restaurant-system` | Dead — remove folder, remove its target path from the script |
| `apps/service-system/captain` | — | Same as above | Same as above | Dead — remove folder, remove its target path from the script |
| `cloud/api` | NestJS + Prisma + PostgreSQL cloud backend (Super Admin control plane) | Source | Yes — own workspace member, own `tsconfig.json` explicitly excluded from the root project | Keep, unchanged |
| `cloud/super-admin-web` | Vite/React Super Admin frontend | Source | Yes | Keep, unchanged |
| `shared/api` | Printer/device/payment formatting helpers | Source | Yes (real npm package, has `package.json`) | Keep, rename only |
| `shared/business` | Business-day, accounting, pricing, EOD, entitlements, JAMAN AI assistant — one cohesive package | Source | Yes | Keep, rename only — **do not split** (see §D) |
| `shared/config` | Brand colors, app constants | Source | Yes | Keep, rename only |
| `shared/database` | In-memory `db` singleton, repositories, seed data | Source | Yes | Keep, rename only |
| `shared/i18n` | Translation strings | Source | Yes | Keep, rename only |
| `shared/sync` | Command pipeline, outbox (stub), LAN mesh (same-tab only) | Source | Yes | Keep, rename only |
| `shared/types` | Domain types, enums, DTOs | Source | Yes | Keep, rename only |
| `shared/ui` | Shared React components + brand assets | Source | Yes | Keep, rename only |
| `shared/utils` | Formatting/date helpers | Source | Yes | Keep, rename only |
| `shared/validation` | Zod schemas | Source | Yes | Keep, rename only |
| `shared/assets` | Static files | Generated/static, **no `package.json`** | Referenced by path (not import) from asset-prep scripts | Not an npm workspace member at all — leave in place |
| `scripts/` (77 files) | Icon generation, menu-image prep, installer building, local service, release packaging, one-off dev utilities | Source (tooling) | Mixed — some run in every build (`prepare:images`, `validate:menu-assets`), some are the shipped installer pipeline (`build_windows_installers.cjs`), some are confirmed orphaned (see below) | Reorganize, see §E |
| `scripts/standalone_local_core.cjs`, `scripts/sea-config.json`, `scripts/sea-prep.blob`, `scripts/JamanvaarLocalCore.exe` (93MB) | An alternate Node-SEA-packaged local core | Source + generated binary | **No** — confirmed in the original stabilization audit: a parallel packaging path the shipped installer (`build_windows_installers.cjs`) never invokes | Orphaned — flag for your confirmation before deleting a binary |
| `tests/` (53 files) | Vitest suite for `shared/*` business logic; one file (`pos_to_admin_order_sync.test.ts`) imports directly from `apps/restaurant-system/pos/src/store/posStore` | Source | Yes — 273 tests, all passing | Keep, path references must be updated if `apps/restaurant-system/pos` ever moves |
| `docs/` (15 files + 1 PDF) | Architecture/API/database/security/etc. docs — several contain claims that don't match the code (e.g. `DATABASE.md` claims SQLite; the actual store is an in-memory object graph) | Source (documentation) | Referenced by `docs/INDEX.md` | Reorganize + correct, see §E |
| `assets/icons` | Static app icon source files | Source (static) | Yes — used by icon-generation scripts | Keep |
| `release/` | Generated installers, payload zips, checksums | **100% generated output** | Output of `build_windows_installers.cjs` / `package_zip_release.cjs` | Already gitignored — leave in place |
| `JAMANVAAR_DESKTOP_PACKAGE/` | Generated staged per-app folders (icons, manifests, shortcut scripts) | **100% generated output** | Output of a deploy/packaging script | Already gitignored — leave in place |
| `JAMANVAAR_ALL_APPS.zip`, `JAMANVAAR_KIOSK_SYSTEM.zip` (root, ~136MB combined) | Backup/distribution archives | Generated binary | Already gitignored (`*.zip`) | Leave in place, or relocate outside the repo entirely — your call, not a code change either way |
| `JAMANVAAR_COMPLETE_SYSTEM_REPORT.md`, `JAMANVAAR_FEATURES_SPECIFICATION.md`, `GITHUB_RELEASE_GUIDE.md` (root) | Architecture/feature/release docs | Source (documentation) | Referenced informally | Reorganize into `docs/`, see §E |
| `tsconfig.tsbuildinfo` (root) | `tsc -b` incremental build cache | Generated | — | Already gitignored (added this session) |

---

## B. Actual application map

| Application | Actual current path | Package name | Port |
|---|---|---|---|
| POS | `apps/restaurant-system/pos` | `@jamanvaar/pos` | 5175 |
| Restaurant Admin (POS Admin) | `apps/restaurant-system/pos-admin` | `@jamanvaar/pos-admin` | — |
| Captain | `apps/restaurant-system/captain` | `@jamanvaar/captain` | 5177 |
| KDS | `apps/restaurant-system/kds` | `@jamanvaar/kds` | 5179 |
| Kiosk | `apps/kiosk-system/kiosk-user` | `@jamanvaar/kiosk-user` | 5174 |
| Kiosk Admin | `apps/kiosk-system/kiosk-admin` | `@jamanvaar/kiosk-admin` | 5173 |
| Super Admin | `cloud/super-admin-web` | `@jamanvaar/super-admin-web` | 5180 |
| Cloud API | `cloud/api` | `@jamanvaar/cloud-api` | 4000 |
| Local runtime (shipped) | `scripts/local_service.cjs` | — (not a package) | 5178 |
| Local runtime (orphaned alternate) | `scripts/standalone_local_core.cjs` | — | — |
| Public Web | **Does not exist yet** | — | — |

There is no `apps/web` (public marketing/ordering site) anywhere in the repository — it's aspirational in this request's target structure, not an existing app to migrate.

---

## C. Shared package map

Every package below is a real npm workspace member (`shared/*` in the root `workspaces` array, each with its own `package.json`), **except `shared/assets`**, which has no `package.json` and is therefore not an npm package at all — just a static folder referenced by file path from build scripts.

| Package | Contains |
|---|---|
| `shared/types` | Domain interfaces (`Restaurant`, `Order`, `MenuItem`, `BusinessDay`, `PlanEntitlements`, …), enums, DTOs |
| `shared/validation` | Zod schemas |
| `shared/business` | Business-day/accounting service, EOD service, pricing, discounts, coupons, menu builder, JAMAN AI assistant + registry, license entitlements, central reporting service, session persistence, idempotency |
| `shared/database` | The `db` singleton (in-memory object graph), all repositories (`OrderRepository`, `BusinessDayRepository`, `PrintQueueRepository`, …), seed data, the unused `SQLITE_SCHEMA_DDL` string |
| `shared/api` | Printer (ESC/POS text + bytecode generation), device health, payment formatting |
| `shared/sync` | Command pipeline (real), outbox (stub — always reports success), LAN mesh sync (same-browser-tab only via `BroadcastChannel`) |
| `shared/ui` | Shared React components (`Button`, `KpiCard`, `Modal`, `StatusBadge`, `JamanvaarAuthLayout`, …), brand assets |
| `shared/config` | `JAMANVAAR_COLORS`, `APP_CONSTANTS` |
| `shared/utils` | Formatting/date helpers |
| `shared/i18n` | Translation strings (en/hi/gu) |
| `shared/assets` | Static files, not an npm package |

**On the target structure's proposed `packages/domain` + `packages/pricing` split:** the actual code doesn't support this boundary cleanly. `pricing.ts` is one file inside `shared/business`, which is a single cohesive package with internal cross-references between pricing, discounts, business-day accounting, and the AI assistant. Splitting it into separate `domain`/`pricing` packages would be a real refactor (establishing clean import boundaries, likely resolving circular references) — not a folder rename. §D recommends renaming `shared/business` → `packages/business` as one unit and revisiting a pricing extraction later, only if a concrete need for it shows up (e.g., a future service that needs pricing logic without the rest of `business`).

---

## D. Proposed target structure

```text
k2/
├── apps/                          # unchanged in this phase — see risk note below
│   ├── kiosk-system/{kiosk-user,kiosk-admin}
│   └── restaurant-system/{pos,pos-admin,captain,kds}
│
├── cloud/                         # unchanged — already matches the target shape
│   ├── api/
│   └── super-admin-web/
│
├── packages/                      # renamed from shared/ — same packages, same boundaries
│   ├── types/
│   ├── validation/
│   ├── business/                  # kept as one package — see §C
│   ├── database/
│   ├── api/
│   ├── sync/
│   ├── ui/
│   ├── config/
│   ├── utils/
│   └── i18n/
│
├── tooling/                       # renamed from scripts/, split by purpose
│   ├── installers/                # build_windows_installers.cjs, package_zip_release.cjs, sign/csc helpers
│   ├── packaging/                 # icon generation, shortcut creation, desktop deployment
│   ├── local-runtime/             # local_service.cjs, sync_server.cjs, production_launcher.cjs
│   └── dev/                       # menu/image prep, one-off audits, benchmarks
│
├── docs/
│   ├── architecture/               # this file, cloud-architecture.md, local-architecture.md
│   ├── product/                    # feature specification, per-app guides
│   ├── development/                # setup, testing, contributing
│   ├── deployment/                 # release guide, installer guide
│   └── reports/                    # JAMANVAAR_COMPLETE_SYSTEM_REPORT.md (corrected), audits
│
├── tests/                          # unchanged location; internal import paths updated if apps/ moves
├── assets/                         # unchanged — icon sources
├── release/                        # unchanged — generated, gitignored
├── JAMANVAAR_DESKTOP_PACKAGE/      # unchanged — generated, gitignored
│
├── package.json
├── tsconfig.json
└── README.md
```

**Deliberately not proposed for this phase:** flattening `apps/kiosk-system/*` and `apps/restaurant-system/*` up to `apps/pos`, `apps/kiosk`, etc., and extracting a top-level `local/` workspace for the local runtime. Both are real, defensible target-state ideas — but both carry high blast radius for low immediate value (see the risk column in §E and the phasing in §G). They're kept in this document as the acknowledged long-term direction, not scheduled yet.

---

## E. Migration table

| Current path | Target path | Action | Reason | Risk |
|---|---|---|---|---|
| `apps/kitchen-system/` | *(deleted)* | Remove | Dead asset-only shell; not a workspace member; only reference is a stale write-target in `scripts/prepare_menu_images.mjs` | Low |
| `apps/service-system/` | *(deleted)* | Remove | Same as above | Low |
| `apps/kiosk-system/shared/` | *(deleted)* | Remove | Real package, zero actual imports anywhere | Low |
| `tsconfig.json` paths: `@jamanvaar/kiosk-shared`, `@jamanvaar/restaurant-shared` | *(removed)* | Remove | Dead aliases; the restaurant-shared target doesn't exist on disk at all | Low |
| 5 apps' `vite.config.ts`: `@jamanvaar/kiosk-shared` / `@jamanvaar/restaurant-shared` alias entries | *(removed)* | Remove | Same dead aliases, defined per-app | Low |
| `scripts/prepare_menu_images.mjs`: kitchen-system/service-system target paths | *(removed)* | Edit | Stop writing into folders being deleted | Low |
| `scripts/standalone_local_core.cjs`, `sea-config.json`, `sea-prep.blob`, `JamanvaarLocalCore.exe` | *(deleted or archived)* | Remove | Confirmed orphaned — not used by the shipped installer pipeline | Low, but **needs your explicit confirmation** before deleting a 93MB binary |
| `shared/{types,validation,business,database,api,sync,ui,config,utils,i18n}` | `packages/{same names}` | Move (directory rename) | Matches target structure; package boundaries unchanged | **Medium** — touches root `package.json` `workspaces` glob, root `tsconfig.json` paths, root `vitest.config.ts` aliases, and every app's + `cloud/*`'s `vite.config.ts` alias paths (13 files total) |
| `shared/assets/` | *(unchanged)* | Keep | Not an npm package; moving it buys nothing | None |
| `scripts/*.cjs`, `*.mjs`, `*.ps1` (77 files) | `tooling/{installers,packaging,local-runtime,dev}/*` | Move + reclassify | Groups tooling by actual purpose instead of one flat folder | **Medium** — root `package.json` scripts reference `scripts/X` directly; several scripts `require()` each other by relative path; needs a careful per-file pass, not a bulk move |
| `release/` | *(unchanged)* | Keep | Generated, already gitignored; moving adds risk to installer scripts' hardcoded output paths for no benefit | None |
| `JAMANVAAR_DESKTOP_PACKAGE/` | *(unchanged)* | Keep | Same reasoning | None |
| `JAMANVAAR_ALL_APPS.zip`, `JAMANVAAR_KIOSK_SYSTEM.zip` | *(unchanged, or relocated outside the repo)* | Keep or relocate | Already gitignored; large binary backups arguably don't belong in a live source tree, but this is a file-management choice, not a code change | None |
| `README.md`, `JAMANVAAR_COMPLETE_SYSTEM_REPORT.md`, `JAMANVAAR_FEATURES_SPECIFICATION.md`, `GITHUB_RELEASE_GUIDE.md`, `docs/*.md` | `docs/{architecture,product,development,deployment,reports}/*` | Move + rename | Matches target; several docs also need factual correction while being moved (see §A) | Low — docs aren't imported by code, only cross-referenced by other docs; update relative links |
| `apps/kiosk-system/{kiosk-user,kiosk-admin}`, `apps/restaurant-system/{pos,pos-admin,captain,kds}` | `apps/{kiosk,kiosk-admin,pos,pos-admin,captain,kds}` (flattened) | Rename + move | Matches target naming, removes the ambiguous `-system` suffixes | **High** — touches every app's `vite.config.ts` (relative path depth to `packages/` changes), root `package.json` (workspaces glob + all `dev:*`/`build:*` scripts), `scripts/build_windows_installers.cjs` (app paths and names are baked into the generated C# installer and shortcuts), `tests/pos_to_admin_order_sync.test.ts` (direct relative import). **Recommend deferring to its own dedicated phase** with a full installer rebuild + install/uninstall verification, not bundling with the safer package/tooling reorg |
| Local runtime (`scripts/local_service.cjs`) | `local/core/` (future) | Defer | Turning this into a proper top-level `local/` workspace (its own `package.json`, build, and wiring into the installer) is a real engineering task tied to the already-planned SQLite activation — not a folder rename. Treat as a separate initiative | Deferred, not in this phase |
| `cloud/api`, `cloud/super-admin-web` | *(unchanged)* | Keep | Already matches the target `cloud/` concept exactly | None |

---

## F. Dependency impact of the one recommended change (`shared/` → `packages/`)

If you approve only this one change (the medium-risk, mechanical rename), here's everything that needs a matching edit:

- **Root `package.json`**: `"workspaces"` array — `"shared/*"` → `"packages/*"`.
- **Root `tsconfig.json`**: all 10 `@jamanvaar/*` path entries under `paths` — `./shared/X/src` → `./packages/X/src`. Also drop the two dead `kiosk-shared`/`restaurant-shared` entries per §E.
- **Root `vitest.config.ts`**: same 10 `path.resolve(__dirname, './shared/X/src')` aliases → `./packages/X/src`.
- **13 `vite.config.ts` files** (`kiosk-user`, `kiosk-admin`, `pos`, `pos-admin`, `captain`, `kds`, and — if it ever adds them — `cloud/super-admin-web`'s single `@jamanvaar/config` alias): update the relative `../../../shared/X/src` → `../../../packages/X/src` (path depth unchanged, only the folder name changes).
- **`cloud/super-admin-web/vite.config.ts` and `tsconfig.json`**: `@jamanvaar/config` alias path.
- **Every `shared/*/package.json`**: no change needed — package names (`@jamanvaar/types`, etc.) stay the same, only their location moves.
- **Tests**: none of the 53 test files hardcode a `shared/` path directly — they all go through the `@jamanvaar/*` aliases in `vitest.config.ts`, so once that one file is updated, tests need no further edits.
- **Installer/build scripts**: `scripts/build_windows_installers.cjs` and friends don't reference `shared/` directly (they operate on each app's built `dist/`) — no changes expected there, but this needs confirmation during Phase C, not assumed.

No circular-dependency risk: `shared/business` → `shared/database`/`shared/types`/`shared/utils` is the only real internal cross-package dependency chain, and it's one-directional today.

---

## G. Migration phases (safe order)

1. **Phase 0 — dead-code removal** (Low risk, do first, independently verifiable): delete `apps/kitchen-system`, `apps/service-system`, `apps/kiosk-system/shared`; remove the dead `kiosk-shared`/`restaurant-shared` aliases from `tsconfig.json` and the 5 `vite.config.ts` files that reference them; fix `scripts/prepare_menu_images.mjs`'s stale target paths. Verify: full test suite + `tsc -b` + one full `npm run build`.
2. **Phase 1 — `shared/` → `packages/`** (Medium risk): the rename in §F, done as one atomic commit (rename + all alias updates together, since a partial rename breaks everything). Verify: full test suite, `tsc -b`, `npm run build` for all 6 apps, `cloud/api` + `cloud/super-admin-web` typecheck (unaffected, but confirm), start the local dev server (`npm run dev:sync`) and one app to confirm runtime resolution still works, not just the type-checker.
3. **Phase 2 — `scripts/` → `tooling/`** (Medium risk, do after Phase 1 is verified stable): move files into the four subfolders in §D, update root `package.json` script paths, update any script-to-script relative requires. Verify: run the actual `build_windows_installers.cjs` pipeline end to end and confirm a working `Setup.exe` is produced — this is the one step where "typecheck passes" is not sufficient proof.
4. **Phase 3 — docs reorganization** (Low risk, can happen anytime, independent of the above): move + correct the docs per §D/§A. Verify: check for broken relative links (`docs/INDEX.md` and any cross-references).
5. **Phase 4 (deferred, separate approval)** — the `apps/*` flatten-and-rename. Only after Phases 0–3 are stable in production use for a while, and only with a full installer rebuild + install/uninstall test on a clean machine as the acceptance gate.
6. **Phase 5 (deferred, separate initiative)** — extracting a real `local/` workspace for the local runtime, timed with the already-planned SQLite activation work from the SaaS architecture doc, not bundled with this cleanup.

Confirm with you (per §E) before Phase 0 deletes the 93MB orphaned SEA binary.

---

## H. Verification plan

Every phase above is accepted only when all of the following pass — matching the standard already established in this project's stabilization and Super Admin work:

- `npx vitest run` at the repo root — the full existing suite (273 tests as of this writing) stays at 100%.
- `npx tsc -b` at the repo root — the same 5 pre-existing, already-tracked TypeScript errors, nothing new.
- `npm run build` — all 6 apps (`kiosk-user`, `kiosk-admin`, `pos`, `pos-admin`, `captain`, `kds`) build successfully.
- `cloud/api`: `npx tsc --noEmit` clean, `npx vitest run` (46 tests) green, `npx prisma migrate deploy`/`generate` unaffected.
- `cloud/super-admin-web`: `npx tsc --noEmit` clean, `npm run build` succeeds.
- For Phase 2 specifically: an actual installer build (`build_windows_installers.cjs`) produces a working `Setup.exe`, not just "the script exits 0."
- For the deferred Phase 4 (`apps/*` rename): install the produced `Setup.exe` on a clean environment and confirm the app launches, matching the acceptance bar already used for this project's installer work.

No phase is reported complete until its own verification list is shown to have actually run — not asserted.
