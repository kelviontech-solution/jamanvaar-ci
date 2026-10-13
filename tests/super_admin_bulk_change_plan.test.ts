import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Super Admin feature request: bulk plan/feature changes. Bulk suspend/reactivate already existed
 * on the Restaurants list; bulk plan changes ("move every Kiosk Standard restaurant to Kiosk Pro")
 * did not. bulkChangePlan() reuses the single-restaurant changePlan() per restaurant so entitlement
 * resync and audit logging stay identical, and skips (rather than fails) a restaurant with no
 * matching-family active subscription or already on the target plan.
 */
const SERVICE = join(__dirname, '../cloud/api/src/modules/subscriptions/subscriptions.service.ts');
const CONTROLLER = join(__dirname, '../cloud/api/src/modules/subscriptions/subscriptions.controller.ts');
const PAGE = join(__dirname, '../cloud/super-admin-web/src/pages/Restaurants/RestaurantsListPage.tsx');

describe('Bulk plan change', () => {
  it('bulkChangePlan skips a restaurant with no matching-family subscription instead of throwing', () => {
    const src = readFileSync(SERVICE, 'utf8');
    const block = src.slice(src.indexOf('async bulkChangePlan'));
    expect(block).toMatch(/if\s*\(!existing\)\s*\{\s*results\.push\(\{\s*restaurantId,\s*status:\s*'skipped'/s);
  });

  it('bulkChangePlan skips a restaurant already on the target plan', () => {
    const src = readFileSync(SERVICE, 'utf8');
    const block = src.slice(src.indexOf('async bulkChangePlan'));
    expect(block).toMatch(/existing\.planId === targetPlanId/);
  });

  it('bulkChangePlan reuses changePlan() per restaurant rather than duplicating the entitlement-resync logic', () => {
    const src = readFileSync(SERVICE, 'utf8');
    const block = src.slice(src.indexOf('async bulkChangePlan'));
    expect(block).toMatch(/await this\.changePlan\(existing\.id, targetPlanId, actor\)/);
  });

  it('the bulk-change-plan route is registered', () => {
    const src = readFileSync(CONTROLLER, 'utf8');
    expect(src).toMatch(/@Post\('bulk-change-plan'\)/);
  });

  it('the Restaurants list page wires the bulk plan modal to the new endpoint', () => {
    const src = readFileSync(PAGE, 'utf8');
    expect(src).toMatch(/\/api\/v1\/subscriptions\/bulk-change-plan/);
  });
});
