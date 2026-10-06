# Local Core connection fix ? 6 October 2026

The cloud backend on port 4000 and development LAN relay on port 5178 are separate services. The screenshot's ?Not paired (cloud sync in use)? describes the LAN relay's authorization, not whether the cloud backend is running.

## Confirmed cause

The relay required a pairing token on `/api/sync`, `/api/events`, orders and heartbeat endpoints. Apps did not obtain or send it. Native EventSource could not send the required Bearer header. After the first 401, apps stopped LAN sync. There was no working pairing screen.

The services were listening: backend 4000 (PID 33608), Restaurant Admin 5176 (PID 35588), relay 5178 (PID 13008). Listening alone did not grant a browser access.

## Changes

- Added a six-digit console PIN pairing form to the shared terminal login layout, Restaurant Admin hardware settings and connection diagnostics. Activated kiosk installer entry: `?local-core-setup=1`.
- Stored tokens by server address, restaurant and branch; sent authorization headers on sync, order replication, heartbeat and fetch-based SSE. Unpaired apps do not issue protected LAN requests. Existing fallback interval reconnects the stream after a successful authenticated sync.
- Resumed saved pairing after durable storage attaches. The status badge waits for an authenticated sync before showing Connected.
- Signed scoped tokens on the relay; isolated each restaurant/branch's persisted state and event subscribers. Kept the previous legacy data file separate and unmodified. Pairing tokens survive service restarts; PIN guesses remain rate limited.
- Excluded staff authorization and license fields from relay snapshot exchange. Replicated already-priced app orders without repricing them through the legacy create endpoint. Older order snapshots cannot roll back a newer kitchen status. Distinguished an empty new relay from a deliberately cleared menu.

## Verification

- Full final runtime suite: **1,401 passed, zero failed**, including **19 pairing/relay tests**.
- Actual Chromium checks: **6 passed** ? activation prerequisite, invalid PIN, pairing UI and authenticated status, refresh, cross-browser order/status SSE, branch change.
- Final browser run: order visible after **132 ms**, kitchen status after **27 ms**, measured between isolated browser contexts. These are local QA measurements, not AWS latency.
- TypeScript checks and builds for Restaurant Admin, POS, Captain, KDS and Kiosk passed.
- Browser fixtures provisioned tenant/branch context through KeyValueStore; they did not bypass or test cloud login/activation. Earlier activation regressions are recorded in the merged-admin-key report. Live user restaurant data was not used by these tests.

## Runtime action still required

Automatic approval review rejected the command to restart the user's existing Local Core service and gave no detailed reason. No restart occurred. The earlier PID/listener observations above are historical: at the later kiosk-management verification, port 5178 had no listener. The updated code has been verified on isolated QA processes.

Start Local Core with `npm run dev:sync` (restart it first if another copy is running). Refresh the activated app, click **Pair**, and enter the six-digit PIN shown in the Local Core console. Starting another copy while an old service owns 5178 will not load the fix. Cloud/backend and frontend services do not need restarting for the pairing-only change.

The development LAN relay is not the production Branch Core `/api/v1` server. Keep those API addresses separate. See `RUN_SERVERS.md` for setup and per-app entry points.
