import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { DeviceGateOverlay, PlatformNoticeBanner } from '@jamanvaar/ui';
import './index.css';
import { startPlatformNoticePolling } from './cloud/cloudClient';

startPlatformNoticePolling();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <PlatformNoticeBanner />
    <DeviceGateOverlay appName="Restaurant Admin" />
  </React.StrictMode>
);
