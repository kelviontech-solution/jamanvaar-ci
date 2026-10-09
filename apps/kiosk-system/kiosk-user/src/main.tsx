import { bootDurableStorage } from '@jamanvaar/database';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { DeviceGateOverlay, PlatformNoticeBanner } from '@jamanvaar/ui';
import { DeviceGate } from '@jamanvaar/sync';
import { resetTerminal } from './cloud/cloudClient';
import './index.css';

// BUG-145 follow-up: a device credential the cloud no longer recognises is fixed by activating this terminal
// again, not by blocking the screen — see DeviceGate's own comment. This is what actually does that unbinding.
DeviceGate.onIdentityInvalid(() => {
  resetTerminal();
  window.location.reload();
});

// Desktop auto-update: silent by design -- these run as unattended restaurant
// terminals, not something a person sits and watches for a prompt. Rejects (and is
// ignored) outside the Tauri desktop shell -- dev server, Docker/web build, Android.
async function checkForDesktopUpdate() {
  if (!import.meta.env.PROD) return;
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const { relaunch } = await import('@tauri-apps/plugin-process');
    const update = await check();
    if (update) {
      await update.downloadAndInstall();
      await relaunch();
    }
  } catch {
    // Not the Tauri desktop shell, or the updater endpoint has nothing newer -- either way, carry on.
  }
}
void checkForDesktopUpdate();

// Reuse the platform app-shell strategy so refreshing a configured kiosk works offline too.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}

// The local database moves from localStorage to SQLite before anything reads it. If the browser can't, the app carries on as before.
void bootDurableStorage({ appId: 'kiosk-user', restaurantId: localStorage.getItem('jamanvaar_kiosk_user_restaurant_id') }).then(() => {
  DeviceGate.reload();
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
      <PlatformNoticeBanner audience="guest" />
      <DeviceGateOverlay appName="Kiosk" />
    </React.StrictMode>
  );
});
