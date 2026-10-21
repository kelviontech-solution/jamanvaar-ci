import React from 'react';
import { createRoot } from 'react-dom/client';
import { initializeDisplayPreferences, DisplayPreferences } from '@jamanvaar/ui';
import { LaunchCenter } from '../../../apps/restaurant-system/pos-admin/src/components/kiosk/LaunchCenter';
import { PosAdminHeader } from '../../../apps/restaurant-system/pos-admin/src/components/header/PosAdminHeader';
import '../../../apps/restaurant-system/pos-admin/src/index.css';

initializeDisplayPreferences({ application: 'restaurant-admin', restaurantKey: 'fixture' });
(window as any).__navigated = [];
createRoot(document.getElementById('root')!).render(
  <div style={{ minHeight: '100vh' }} className="bg-jaman-cream">
    <PosAdminHeader
      restaurantName="River House Restaurant" outletName="Main Dining & Kitchen" isCloudConnected
      onOpenBranchDirectory={() => {}} globalSearch="" onOpenGlobalSearch={() => {}}
      activeShift={{ cashierName: 'Asha Patel', openingCash: 2000, terminalId: 'POS-01' }}
      onOpenEodModal={() => {}} onOpenReconModal={() => {}} onOpenAssistant={() => {}} onOpenNotifDrawer={() => {}}
      unreadNotifsCount={3} onAdminLogout={() => {}} onOpenNav={() => {}}
    />
    <main className="p-3 sm:p-6 max-w-5xl mx-auto space-y-6">
      <LaunchCenter branchId="branch-a" onNavigate={page => (window as any).__navigated.push(page)} />
      <DisplayPreferences showButtonSetting={false} />
    </main>
  </div>
);
