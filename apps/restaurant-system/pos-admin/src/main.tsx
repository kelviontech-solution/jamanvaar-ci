import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { DeviceGateOverlay, PlatformNoticeBanner } from '@jamanvaar/ui';
import { DeviceGate } from '@jamanvaar/sync';
import './index.css';
import { resetTerminal, startPlatformNoticePolling } from './cloud/cloudClient';

// BUG-145 follow-up: a device credential the cloud no longer recognises is fixed by reconnecting this console
// again, not by blocking the screen — see DeviceGate's own comment. This is what actually does that unbinding
// (the local admin login and this console's own database are untouched — only the cloud/device link resets).
DeviceGate.onIdentityInvalid(() => {
  resetTerminal();
  window.location.reload();
});

startPlatformNoticePolling();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <PlatformNoticeBanner />
    <DeviceGateOverlay appName="Restaurant Admin" />
  </React.StrictMode>
);
