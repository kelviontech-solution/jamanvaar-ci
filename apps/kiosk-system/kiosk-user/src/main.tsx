import {initializeDisplayPreferences,DisplayPreferences} from '@jamanvaar/ui';
import { verifyInstalledUpdate } from '@jamanvaar/ui';
import { bootDurableStorage } from '@jamanvaar/database';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { DeviceGateOverlay, PlatformNoticeBanner } from '@jamanvaar/ui';
import { DeviceGate } from '@jamanvaar/sync';
import { resetTerminal } from './cloud/cloudClient';
import './index.css';
initializeDisplayPreferences();

// BUG-145 follow-up: a device credential the cloud no longer recognises is fixed by activating this terminal
// again, not by blocking the screen — see DeviceGate's own comment. This is what actually does that unbinding.
DeviceGate.onIdentityInvalid(() => {
  resetTerminal();
  window.location.reload();
});

// Updates require a staff maintenance action; startup only verifies a previous handoff.


// Reuse the platform app-shell strategy so refreshing a configured kiosk works offline too.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}

// The local database moves from localStorage to SQLite before anything reads it. If the browser can't, the app carries on as before.
void bootDurableStorage({ appId: 'kiosk-user', restaurantId: localStorage.getItem('jamanvaar_kiosk_user_restaurant_id') }).then(() => {
  DeviceGate.reload();
  void verifyInstalledUpdate();
  window.addEventListener('focus', () => void verifyInstalledUpdate());
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
      <DisplayPreferences compact/>
      <PlatformNoticeBanner audience="guest" />
      <DeviceGateOverlay appName="Kiosk" />
    </React.StrictMode>
  );
});
