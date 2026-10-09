-- The desktop auto-updater (tauri-plugin-updater) only installs a downloaded binary when
-- its signature verifies against the app's embedded public key. Each release's Windows
-- installer is signed at build time and produces a .sig file whose contents must travel
-- alongside downloadUrls so the updater manifest endpoint can serve both together.
ALTER TABLE "AppRelease" ADD COLUMN "signatures" JSONB;
