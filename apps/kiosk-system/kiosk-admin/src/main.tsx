import { bootDurableStorage } from '@jamanvaar/database';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { DeviceGateOverlay, PlatformNoticeBanner } from '@jamanvaar/ui';
import { DeviceGate } from '@jamanvaar/sync';
import './index.css';
import { resetTerminal, startDeviceHeartbeat, startPlatformNoticePolling } from './cloud/cloudClient';

// BUG-145 follow-up: a device credential the cloud no longer recognises is fixed by activating this console
// again, not by blocking the screen — see DeviceGate's own comment. This is what actually does that unbinding.
DeviceGate.onIdentityInvalid(() => {
  resetTerminal();
  window.location.reload();
});

startPlatformNoticePolling();
startDeviceHeartbeat();

// The local database moves from localStorage to SQLite before anything reads it. If the browser can't, the app carries on as before.
void bootDurableStorage().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
      <PlatformNoticeBanner />
      <DeviceGateOverlay appName="Kiosk Admin" />
    </React.StrictMode>
  );
});
