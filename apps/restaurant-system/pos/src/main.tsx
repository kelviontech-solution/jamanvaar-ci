import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { DeviceGateOverlay, PlatformNoticeBanner } from '@jamanvaar/ui';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
    <PlatformNoticeBanner />
    <DeviceGateOverlay appName="POS Terminal" />
  </React.StrictMode>
);
