import { bootDurableStorage } from '@jamanvaar/database';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { DeviceGateOverlay, PlatformNoticeBanner } from '@jamanvaar/ui';
import { DeviceGate } from '@jamanvaar/sync';
import { setGuestOrderBaseUrl } from '@jamanvaar/database';
import './index.css';
import { resetTerminal, startPlatformNoticePolling } from './cloud/cloudClient';

// BUG-119: a guest's table QR code is built from wherever this app is really, publicly reachable — set once
// here from the deploy's own env, never taken from window.location.origin (which is whatever address the
// owner's own browser happens to be on, e.g. a LAN-only localhost, unreachable from a guest's own phone).
if (import.meta.env.VITE_RESTAURANT_ADMIN_URL) setGuestOrderBaseUrl(import.meta.env.VITE_RESTAURANT_ADMIN_URL);

// BUG-145 follow-up: a device credential the cloud no longer recognises is fixed by reconnecting this console
// again, not by blocking the screen — see DeviceGate's own comment. This is what actually does that unbinding
// (the local admin login and this console's own database are untouched — only the cloud/device link resets).
DeviceGate.onIdentityInvalid(() => {
  resetTerminal();
  window.location.reload();
});

startPlatformNoticePolling();

// The local database moves from localStorage to SQLite before anything reads it. If the browser can't, the app carries on as before.
void bootDurableStorage().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
      <PlatformNoticeBanner />
      <DeviceGateOverlay appName="Restaurant Admin" />
    </React.StrictMode>
  );
});
