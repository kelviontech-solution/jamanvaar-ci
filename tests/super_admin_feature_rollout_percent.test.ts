import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Super Admin feature request: feature-flag percentage rollout. Feature Catalog could only flip a
 * feature fully on or fully off for every restaurant -- no way to soft-launch to a slice first.
 * Added Feature.rolloutPercent (default 100, so every existing feature is unaffected) and wired it
 * into the QR ordering capability resolution (resolveQrCapability/resolveQrCapabilities), the
 * finest-grained entitlement check that already took a restaurantId.
 */
const SERVICE = join(__dirname, '../cloud/api/src/modules/application-entitlements/application-entitlements.service.ts');
const SCHEMA = join(__dirname, '../cloud/api/prisma/schema.prisma');
const PAGE = join(__dirname, '../cloud/super-admin-web/src/pages/FeatureCatalog/FeatureCatalogPage.tsx');

describe('Feature-flag percentage rollout', () => {
  it('Feature.rolloutPercent defaults to 100 so existing features are unaffected', () => {
    const src = readFileSync(SCHEMA, 'utf8');
    const block = src.slice(src.indexOf('model Feature {'), src.indexOf('model Feature {') + 2000);
    expect(block).toMatch(/rolloutPercent\s+Int\s+@default\(100\)/);
  });

  it('resolveQrCapability only enables a feature that is both isActive and in the rollout', () => {
    const src = readFileSync(SERVICE, 'utf8');
    const block = src.slice(src.indexOf('async resolveQrCapability('), src.indexOf('async resolveQrCapabilities('));
    expect(block).toMatch(/isRestaurantInRollout\(restaurantId, feature\.rolloutPercent\)/);
    expect(block).toMatch(/feature\?\.isActive === true && isRestaurantInRollout/);
  });

  it('resolveQrCapabilities applies the same rollout check per capability', () => {
    const src = readFileSync(SERVICE, 'utf8');
    const block = src.slice(src.indexOf('async resolveQrCapabilities('));
    expect(block).toMatch(/isRestaurantInRollout\(restaurantId, feature\.rolloutPercent\)/);
  });

  it('the Feature Catalog page lets Super Admin edit the rollout percentage', () => {
    const src = readFileSync(PAGE, 'utf8');
    expect(src).toMatch(/rolloutPercent/);
    expect(src).toMatch(/\/api\/v1\/features\/\$\{feature\.id\}/);
  });
});
