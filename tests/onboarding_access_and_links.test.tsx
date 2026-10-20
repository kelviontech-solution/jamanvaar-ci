// @vitest-environment jsdom
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { resolveAppUrl, ownerPortal, QR_ADMIN_URL, RESTAURANT_ADMIN_URL } from '../cloud/super-admin-web/src/lib/appUrls';
import { onboardingKeyTypes, planFeatureSummary, qrOnlyFeatures } from '../cloud/super-admin-web/src/lib/planAccess';
import { PlanReview } from '../cloud/super-admin-web/src/pages/Subscriptions/PlanReview';
import type { Plan } from '../cloud/super-admin-web/src/api/types';
const remote = { origin: 'https://platform.example.test', hostname: 'platform.example.test' };
describe('production handover links', () => {
  it.each([
    undefined,
    '',
    'http://localhost:5176',
    'http://127.0.0.1:5176',
    'http://[::1]:5176',
    'http://0.0.0.0:5176',
    'https://a:b@host.test',
    'javascript:alert(1)',
    'http://admin.example.test'
  ])('rejects local, malformed or insecure public overrides %s', (value) => {
    expect(resolveAppUrl(value, remote, '/restaurant-admin/', 'http://localhost:5176')).toBe('https://platform.example.test/restaurant-admin');
  });
  it('honours an explicit secure cross-domain deployment', () =>
    expect(resolveAppUrl(' https://admin.example.test/ ', remote, '/restaurant-admin/', '')).toBe('https://admin.example.test'));
  it('uses the correct hosted QR route and retains local development defaults', () => {
    expect(resolveAppUrl(undefined, remote, '/qr/login/', 'http://localhost:5176/qr/login')).toBe('https://platform.example.test/qr/login');
    expect(resolveAppUrl(undefined, { origin: 'http://localhost:5180', hostname: 'localhost' }, '/restaurant-admin/', 'http://localhost:5176')).toBe(
      'http://localhost:5176'
    );
  });
  it('chooses the owner console from selected products rather than activation-key hardware type', () => {
    expect(ownerPortal(['QR_ORDERING'])).toEqual({ name: 'QR Admin', url: QR_ADMIN_URL });
    expect(ownerPortal(['POS_ADMIN', 'QR_ORDERING'])).toEqual({ name: 'Restaurant Admin', url: RESTAURANT_ADMIN_URL });
    expect(ownerPortal(['KIOSK_ADMIN', 'QR_ORDERING']).name).toBe('Kiosk Admin');
  });
});
const plan = {
  id: 'qr-plan',
  name: 'QR plan',
  defaultApps: ['QR_ORDERING'],
  maxBranches: 5,
  maxDevices: 20,
  maxUsers: 50,
  entitlements: {
    qrTableOrdering: true,
    menuManagement: true,
    tableManagement: true,
    foodCustomization: true,
    qrRestaurantPage: true,
    posTerminal: true,
    captainApp: true,
    restaurantAdmin: true,
    inventoryManagement: true,
    selfOrderKiosk: true,
    advancedCaptainReports: true,
    offlineBilling: true,
    shiftAndCashDrawer: true
  }
} as unknown as Plan;
describe('product-specific onboarding access review', () => {
  it('does not present POS, Captain or Kiosk features as part of selected QR products', () => {
    const summary = planFeatureSummary(plan, ['QR_ORDERING']);
    expect(summary.included.map((v) => v.key)).toEqual(['qrTableOrdering', 'menuManagement', 'tableManagement', 'foodCustomization', 'qrRestaurantPage']);
    expect(summary.outsideSelection.map((v) => v.key)).toContain('captainApp');
  });
  it('retains relevant product flags and unknown catalogue features without inventing entitlements', () => {
    const custom = {
      ...plan,
      entitlements: { futureFlag: true },
      featureDefinitions: [{ key: 'futureFlag', name: 'New Captain tool', appCode: 'CAPTAIN' }]
    } as unknown as Plan;
    expect(planFeatureSummary(custom, ['QR_ORDERING']).outsideSelection[0].label).toBe('New Captain tool');
    expect(planFeatureSummary(custom, ['CAPTAIN']).included[0].label).toBe('New Captain tool');
  });
  it('cleans only known non-QR flags in an explicit draft operation', () => {
    const cleaned = qrOnlyFeatures(plan.entitlements);
    expect(cleaned.posTerminal).toBe(false);
    expect(cleaned.captainApp).toBe(false);
    expect(cleaned.qrRestaurantPage).toBe(true);
    expect(cleaned.menuManagement).toBe(true);
    expect(plan.entitlements.posTerminal).toBe(true);
  });
  it('labels shared AI access without advertising a POS product to QR-only owners', () => {
    const summary = planFeatureSummary({ ...plan, entitlements: { posAssistant: true } } as unknown as Plan, ['QR_ORDERING']);
    expect(summary.included).toEqual([{ key: 'posAssistant', label: 'JAMAN AI assistant' }]);
  });
  it('renders readable sections and a separate warning instead of an undifferentiated text dump', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <PlanReview plan={plan} applications={['QR_ORDERING']} />
      </MemoryRouter>
    );
    expect(html).toContain('<dl class="plan-access-limits">');
    expect(html).toContain('Selected products');
    expect(html).toContain('Included for these products');
    const included = html.split('class="plan-access-features"')[1].split('</ul>')[0];
    expect(included).toContain('Restaurant website');
    expect(included).not.toContain('Captain');
    expect(included).not.toContain('POS Terminal');
    expect(html).toContain('configured features are outside');
  });
  it('avoids duplicate management keys and never treats WhatsApp as a hardware station', () => {
    expect(onboardingKeyTypes(['QR_ORDERING'])).toEqual(['QR_ORDERING']);
    expect(onboardingKeyTypes(['POS_ADMIN', 'POS', 'QR_ORDERING', 'WHATSAPP_ORDERING'])).toEqual(['POS_ADMIN', 'POS']);
    expect(onboardingKeyTypes(['KIOSK_ADMIN', 'QR_ORDERING'])).toEqual(['KIOSK_ADMIN']);
  });
});
