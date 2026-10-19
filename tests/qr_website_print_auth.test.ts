import { it, expect, vi } from 'vitest';
vi.mock('../apps/restaurant-system/pos-admin/src/cloud/cloudClient', () => ({
  request: vi.fn().mockResolvedValue({ url: 'https://example.test/q/site/restaurant' }),
  qrApi: vi.fn()
}));
import { request, qrApi } from '../apps/restaurant-system/pos-admin/src/cloud/cloudClient';
import { QrAdminApi } from '../apps/restaurant-system/pos-admin/src/cloud/qrAdminClient';
it('requests website QR print data with the tenant owner/manager session rather than device credentials', async () => {
  await QrAdminApi.websitePrintData('branch-a');
  expect(request).toHaveBeenCalledWith('/api/v1/tenant/qr-page/print-data?scope=branch-a');
  expect(qrApi).not.toHaveBeenCalled();
});
