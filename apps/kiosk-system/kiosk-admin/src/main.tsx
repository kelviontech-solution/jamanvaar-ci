import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { DeviceGateOverlay, PlatformNoticeBanner } from '@jamanvaar/ui';
import './index.css';
import { startDeviceHeartbeat, startPlatformNoticePolling } from './cloud/cloudClient';

startPlatformNoticePolling();
startDeviceHeartbeat();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <PlatformNoticeBanner />
    <DeviceGateOverlay appName="Kiosk Admin" />
  </React.StrictMode>
);
