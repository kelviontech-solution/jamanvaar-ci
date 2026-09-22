import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { DeviceGateOverlay, PlatformNoticeBanner } from '@jamanvaar/ui';
import { resetTerminal } from './cloud/cloudClient';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
    <PlatformNoticeBanner />
    <DeviceGateOverlay
      appName="Captain"
      onResetTerminal={() => {
        resetTerminal();
        window.location.reload();
      }}
    />
  </React.StrictMode>
);
