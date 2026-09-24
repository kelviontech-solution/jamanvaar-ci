import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { DeviceGateOverlay, PlatformNoticeBanner } from '@jamanvaar/ui';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <PlatformNoticeBanner audience="guest" />
    <DeviceGateOverlay appName="Kiosk" />
  </React.StrictMode>
);
