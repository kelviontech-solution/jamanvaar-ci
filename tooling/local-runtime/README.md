# tooling/local-runtime

The LAN order server every desktop app talks to on `:5178`. **There is now exactly one
implementation, `local_service.cjs`** — it requires the per-install service key
(`.local_service_key`, generated on first run, never committed) on every data-bearing
endpoint (`/api/orders`, `/api/sync`, `/devices`, `/api/heartbeat`, `/api/events`).

## security-audit CRIT-03 — what changed here and why

This directory used to contain **two independently-evolved copies** of this server:
`local_service.cjs` (patched, authenticated) and `standalone_local_core.cjs` (an older
copy that never received the authentication fix — `0.0.0.0` bind, wildcard CORS, zero
auth on order creation/read and the SSE event stream). `sea-config.json` — the Node.js
Single Executable Application config used to produce the prebuilt `JamanvaarLocalCore.exe`
that two of the installer-build scripts (`tooling/installers/build_release.cjs`,
`build_production_release.ps1`) bundled directly into POS/POS-Admin installers — pointed
at the **unauthenticated** file. The tracked binary was proven (via string evidence and
file timestamps) to have been built before the authentication fix landed and never
rebuilt afterward, so any installer produced by those two scripts shipped a LAN server
with no authentication at all, reachable by anyone on the restaurant's WiFi/LAN.

Fixed by:
1. `sea-config.json`'s `main` now points at `local_service.cjs`.
2. `standalone_local_core.cjs` and the stale prebuilt `JamanvaarLocalCore.exe` /
   `sea-prep.blob` have been **deleted from the repository** — a real Windows build
   environment with the actual signing/packaging pipeline (see `tooling/installers/`)
   is needed to safely regenerate them, which this change could not do from inside an
   agent session with no way to verify the output's integrity.
3. `build_release.cjs` and `build_production_release.ps1` now fail loudly with an
   explanatory error instead of silently packaging a missing/stale binary — see the
   comments added at their `JamanvaarLocalCore.exe` copy steps.

## Regenerating `JamanvaarLocalCore.exe`

On a real Windows build machine, from the repo root:

```powershell
node --experimental-sea-config tooling/local-runtime/sea-config.json
node -e "require('fs').copyFileSync(process.execPath, 'tooling/local-runtime/JamanvaarLocalCore.exe')"
npx postject tooling/local-runtime/JamanvaarLocalCore.exe NODE_SEA_BLOB tooling/local-runtime/sea-prep.blob ^
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 ^
  --overwrite
```

Then apply this project's usual icon/signing/antivirus-safe packaging steps (see
`tooling/installers/*.ps1`) before treating the result as a release artifact. **Before
shipping it, verify it actually requires the service key** — e.g. start it and confirm
`curl http://localhost:5178/api/orders` returns `401` without an `Authorization` header —
so this specific regression can never silently recur.

`local_service.cjs` resolves the four app dist directories relative to its own
`__dirname`; Node's SEA runtime has some known differences in how `__dirname`/asset
paths resolve inside a single-file executable versus a normal script. Confirm static
asset serving (`/pos/`, `/pos-admin/`, `/kiosk/`, `/kiosk-admin/`) still works from the
built `.exe`, not just when run via `node local_service.cjs`, before shipping.

## The other server file, `sync_server.cjs`

Unchanged — it's a 2-line wrapper (`require('./local_service.cjs')`) used by
`npm run dev:sync`, not a separate implementation.
