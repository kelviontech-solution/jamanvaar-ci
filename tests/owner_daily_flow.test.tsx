import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { EndpointResolver } from '@jamanvaar/sync';
import { fetchLaunchAcceptance } from '../apps/restaurant-system/pos-admin/src/cloud/cloudClient';
import { productNavSections } from '../apps/restaurant-system/pos-admin/src/navSections';
import { filterNavSections } from '../apps/restaurant-system/pos-admin/src/hooks/useEntitlements';
import { onboardingStepIds } from '../apps/restaurant-system/pos-admin/src/components/dashboard/PlanOnboarding';
import { AttentionTasks } from '../apps/restaurant-system/pos-admin/src/components/dashboard/AttentionTasks';
import type { TenantDashboard } from '../apps/restaurant-system/pos-admin/src/cloud/cloudClient';

describe('owner daily work and purchased-product setup', () => {
  it('sends launch confirmation as a JSON object accepted by the tenant API', async () => {
    const fetch=vi.spyOn(EndpointResolver,'fetch').mockResolvedValue(new Response(JSON.stringify({verified:true,record:null,orders:[]}),{status:200,headers:{'Content-Type':'application/json'}}));
    const input={orderId:'paid-order',counterReceived:true,kitchenReceived:true,receiptVerified:true};
    try {await fetchLaunchAcceptance('branch-a',input);expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual(input);} finally {fetch.mockRestore();}
  });
  it('keeps five daily tasks before occasional setup without duplicating pages', () => {
    const groups = filterNavSections(productNavSections('POS_ADMIN'), () => true);
    expect(groups[0].section).toBe('DAILY');
    expect(groups[0].items.map((i) => i.id)).toEqual(['DASHBOARD', 'ORDERS', 'MENU', 'CUSTOMERS', 'SYNC']);
    const ids = groups.flatMap((g) => g.items.map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(groups.find((g) => g.section === 'SETUP')?.items.some((i) => i.id === 'MENU_OPTIONS')).toBe(true);
    expect(groups.find((g) => g.section === 'KIOSK MANAGEMENT')?.items.some((i) => i.id === 'KIOSK_WELCOME')).toBe(true);
  });
  it.each([['POS_ADMIN'], ['KIOSK_ADMIN'], ['QR_ORDERING'], ['POS_ADMIN', 'KIOSK_ADMIN', 'QR_ORDERING']])('only onboards licensed products: %j', (...apps) => {
    const steps = onboardingStepIds(apps);
    expect(steps.includes('printer')).toBe(apps.includes('POS_ADMIN'));
    expect(steps.includes('kiosk')).toBe(apps.includes('KIOSK_ADMIN'));
    expect(steps.includes('qr')).toBe(apps.includes('QR_ORDERING'));
    expect(steps.at(-1)).toBe('test');
    expect(new Set(steps).size).toBe(steps.length);
  });
  it('does not enable an action for an order whose branch is unassigned', () => {
    const data = {
      scope: { branchId: null },
      byBranch: [{ id: 'a', name: 'Branch A' }],
      attention: {
        unpaidBills: [],
        delayedMinutes: 20,
        delayedOrders: [{ externalOrderId: 'one', label: 'K-1', ageMinutes: 25, branchId: null }],
        unavailableDishes: [],
        devices: []
      }
    } as unknown as TenantDashboard;
    const html = renderToStaticMarkup(<AttentionTasks data={data} onOpen={() => {}} />);
    expect(html).toContain('Branch not assigned');
    expect(html).toContain('disabled=""');
    expect(html).toContain('over 20 min');
  });
});
