import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { DeviceGateOverlay, PlatformNoticeBanner } from '@jamanvaar/ui';
import { resetTerminal } from './cloud/cloudClient';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <PlatformNoticeBanner />
    <DeviceGateOverlay
      appName="Kiosk"
      onResetTerminal={() => {
        resetTerminal();
        window.location.reload();
      }}
    />
  </React.StrictMode>
);
