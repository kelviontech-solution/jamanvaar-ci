import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A locked feature used to be a dead end: "not included in this license" with no next step for
 * the owner and no way for Super Admin to even know someone wanted it. FeatureRequestButton
 * raises an ordinary FEATURE_REQUEST support ticket (cloud/api POST /api/v1/restaurant/qr/
 * feature-request, verified end-to-end in cloud/api/test/qr-feature-request.e2e.spec.ts) so every
 * "not licensed" message across QR Admin now has a real next step, wired straight into the same
 * ticket inbox Super Admin already works.
 */
const QRCONSOLE = join(__dirname, '../apps/restaurant-system/pos-admin/src/components/qrconsole');

describe('FeatureRequestButton component exists and calls the real API', () => {
  const src = readFileSync(join(QRCONSOLE, 'FeatureRequestButton.tsx'), 'utf8');

  it('calls QrAdminApi.requestFeature with the feature code and label', () => {
    expect(src).toMatch(/QrAdminApi\.requestFeature\(featureCode, featureLabel\)/);
  });

  it('confirms success to the owner instead of silently doing nothing', () => {
    expect(src).toMatch(/Request sent/);
  });
});

describe('Every "not licensed" message in QR Admin offers a real next step', () => {
  const operations = readFileSync(join(QRCONSOLE, 'QrOperations.tsx'), 'utf8');
  const capabilities = readFileSync(join(QRCONSOLE, 'QrCapabilities.tsx'), 'utf8');

  it('Service Requests / Pickup Scheduling (shared OperationsSettings) offers it, keyed by mode', () => {
    expect(operations).toMatch(/featureCode=\{\s*mode === "service" \? "QR_SERVICE_REQUESTS" : "QR_SCHEDULED_PICKUP"/);
  });

  it('Menu Performance offers it when the error is specifically a licensing error', () => {
    expect(operations).toMatch(/featureCode="QR_MENU_ANALYTICS"/);
    expect(operations).toMatch(/error\.includes\("not included in the current license"\)/);
  });

  it('Advanced Features: Promotions, Feedback and Translations each offer it', () => {
    expect(capabilities).toMatch(/featureCode="QR_PROMOTIONS"/);
    expect(capabilities).toMatch(/featureCode="QR_FEEDBACK"/);
    expect(capabilities).toMatch(/featureCode="QR_MULTILINGUAL"/);
  });
});
