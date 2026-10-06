import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp } from './helpers';

/**
 * KIOSK_ADMIN was retired as a device/activation-key type (Phase 2 Task 10) once the one
 * production restaurant that depended on it was migrated to a POS_ADMIN key on the merged
 * pos-admin console. This is a device TYPE retirement, not an entitlement change — pos-admin
 * itself always sent deviceType POS_ADMIN already (see tenant-auth.e2e.spec.ts's "POS_ADMIN
 * console activation across plan families" tests), so this only closes the door the old,
 * now-deleted standalone kiosk-admin app used to log in or activate through.
 */
describe('KIOSK_ADMIN activation-key retirement', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects a login attempt with deviceType KIOSK_ADMIN as an invalid device type', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/login')
      .send({ restaurantId: '00000000-0000-4000-8000-000000000000', email: 'irrelevant@example.com', password: 'irrelevant', deviceType: 'KIOSK_ADMIN' });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/KIOSK_ADMIN/i);
  });

  it('rejects an activate-device attempt with deviceType KIOSK_ADMIN as an invalid device type', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/activate-device')
      .send({ activationSessionToken: 'irrelevant', activationKey: 'JMV-0000-0000-0000', deviceType: 'KIOSK_ADMIN' });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/KIOSK_ADMIN/i);
  });

  it('still accepts POS_ADMIN as a valid device type (regression guard)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/login')
      .send({ restaurantId: '00000000-0000-4000-8000-000000000000', email: 'irrelevant@example.com', password: 'irrelevant', deviceType: 'POS_ADMIN' });

    // Rejected for being the wrong restaurant/credentials (401), never for deviceType validation (400).
    expect(res.status).toBe(401);
  });
});
