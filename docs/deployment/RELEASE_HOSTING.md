# Hosting App Installers for Download (Sub-project 3)

How the real `.exe`/`.apk` files built by `.github/workflows/build-installers.yml`
(on `kelviontech-solution/jamanvaar-ci`) get to a real public URL that Super
Admin's "Publish Version" flow can point at, and that Restaurant Admin / Kiosk
Admin's "App Downloads" page and Super Admin's own Applications page can
actually download from.

**Everything in this doc after step 1 requires SSH access to the production
box** (the `om` alias — see
`docs/deployment/ORACLE_KELVIONTECH_PROD_2_SETUP.md`). It cannot be run from
an unprivileged sandbox with no key for that host.

## How it works

- nginx (`nginx/oracle-testing-proxy.conf`, the real current production
  config per its own header comment) serves `/downloads/<path>` directly from
  a bind-mounted host directory, `/opt/jamanvaar/downloads/` — see that
  file's `location /downloads/` block.
- `docker-compose.yml`'s `proxy` service bind-mounts that exact host path
  into the nginx container read-only, so dropping a file on the host at
  `/opt/jamanvaar/downloads/<anything>` makes it immediately downloadable at
  `https://system.kelviontech.in/downloads/<anything>` — no container
  rebuild, no redeploy, just the file landing on disk.
- `tooling/deployment/upload-to-oracle.sh` is the script that puts files there
  over `scp`.

## One-time server setup (already-applied code, needs applying on the box)

The nginx config and compose changes are already committed to this repo.
Someone with SSH access needs to:

```bash
ssh om
cd ~/kiosk   # or wherever this repo is checked out on the server
git pull
mkdir -p /opt/jamanvaar/downloads
docker compose --profile oracle up -d proxy   # picks up the new volume mount + nginx config
```

Confirm it worked:

```bash
echo "ok" > /opt/jamanvaar/downloads/test.txt
curl -I https://system.kelviontech.in/downloads/test.txt   # expect 200
rm /opt/jamanvaar/downloads/test.txt
```

## Per-release steps

1. **Build** — trigger `build-installers.yml` on `kelviontech-solution/jamanvaar-ci`
   (`gh workflow run build-installers.yml --repo kelviontech-solution/jamanvaar-ci`),
   wait for it to finish.

2. **Download the 10 artifacts** from the finished run into one staging
   folder, renamed to the plain names `upload-to-oracle.sh` expects:

   ```bash
   mkdir staging
   gh run download <run-id> --repo kelviontech-solution/jamanvaar-ci --name POS-installer --dir /tmp/dl
   cp "/tmp/dl/JAMANVAAR POS_1.0.0_x64-setup.exe" staging/pos.exe
   # ...repeat for RestaurantAdmin-installer -> pos-admin.exe, Kiosk-installer -> kiosk.exe,
   # Captain-installer -> captain.exe, KDS-installer -> kds.exe
   gh run download <run-id> --repo kelviontech-solution/jamanvaar-ci --name POS-apk --dir /tmp/dl
   cp /tmp/dl/*.apk staging/pos.apk
   # ...repeat for RestaurantAdmin-apk -> pos-admin.apk, Kiosk-apk -> kiosk.apk,
   # Captain-apk -> captain.apk, KDS-apk -> kds.apk
   ```

3. **Upload** (from a machine with SSH access to the `om` host):

   ```bash
   tooling/deployment/upload-to-oracle.sh 1.0.0 staging/
   ```

   This prints the 10 real public URLs when it finishes.

4. **Publish** — in Super Admin's Applications page, for each app: "Publish
   Version", set the version number, tick both `windows` and `android` under
   Target Platforms, and paste each platform's own URL into the matching
   field that appears (one `AppRelease` row per app per version, holding
   *both* URLs — `downloadUrls: { "windows": "...exe", "android": "...apk" }`).
   This is the step that makes the Download buttons in Restaurant Admin,
   Kiosk Admin, and Super Admin itself actually work. It also (per the
   already-built `AppUpdate`/`PlatformNoticeBanner` system) notifies every
   running terminal of the new version — a terminal's own heartbeat reports
   its `osPlatform`, so a Windows desktop install gets offered the `.exe`
   and an Android install gets offered the `.apk` automatically, from this
   one published row.
