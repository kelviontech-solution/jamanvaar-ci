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

// The local database moves from localStorage to SQLite before anything reads it. If the browser can't, the app carries on as before.
void bootDurableStorage({ appId: 'pos', restaurantId: localStorage.getItem('jamanvaar_pos_restaurant_id') }).then(() => {
  DeviceGate.reload();
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <App />
      <PlatformNoticeBanner />
      <DeviceGateOverlay appName="POS Terminal" />
    </React.StrictMode>
  );
});

// An installable app that opens with no signal: the shell is cached by ./sw.js (production builds only, so development
// never serves a stale copy). Orders and the menu live in the app's own database, and the API is never cached.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
