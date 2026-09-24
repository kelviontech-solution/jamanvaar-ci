import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * BUG-054: `gstin`/`fssaiNumber` were accepted as any string ("VVSD", "5151") and ended up
 * printed on real tax invoices. Both stay optional, but a value that is given must be a
 * well-formed GSTIN (15 chars, state-code prefix matching the restaurant's declared state)
 * or a 14-digit FSSAI number.
 */
describe('Restaurant GSTIN/FSSAI validation (BUG-054)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-gstin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let token: string;
  const createdIds: string[] = [];

  const api = (method: 'get' | 'post' | 'patch', url: string) => request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);
  const create = (body: object) => api('post', '/api/v1/restaurants').send({ name: `TEST GSTIN ${Date.now()}-${Math.random()}`, ownerName: 'Test Owner', ownerEmail: `o-${Date.now()}-${Math.random()}@test.example.com`, ...body });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });
    token = (await platformLogin(app, adminEmail, adminPassword)).body.accessToken;
  });

  afterAll(async () => {
    if (createdIds.length) await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: { in: createdIds } } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('creates a restaurant with no GSTIN/FSSAI at all (both stay optional)', async () => {
    const res = await create({});
    expect(res.status).toBe(201);
    createdIds.push(res.body.restaurant.id);
  });

  it('accepts a well-formed GSTIN matching the declared state', async () => {
    const res = await create({ gstin: '24AAACR5055K1Z1', state: 'Gujarat' });
    expect(res.status).toBe(201);
    createdIds.push(res.body.restaurant.id);
    expect(res.body.restaurant.gstin).toBe('24AAACR5055K1Z1');
  });

  it('rejects a malformed GSTIN', async () => {
    const res = await create({ gstin: 'VVSD' });
    expect(res.status).toBe(400);
  });

  it("rejects a GSTIN whose state code contradicts the restaurant's declared state", async () => {
    const res = await create({ gstin: '24AAACR5055K1Z1', state: 'Maharashtra' });
    expect(res.status).toBe(400);
  });

  it('accepts a 14-digit FSSAI number and rejects anything else', async () => {
    const ok = await create({ fssaiNumber: '12345678901234' });
    expect(ok.status).toBe(201);
    createdIds.push(ok.body.restaurant.id);

    const bad = await create({ fssaiNumber: '5151' });
    expect(bad.status).toBe(400);
  });

  it('validates the same way on update', async () => {
    const created = await create({});
    createdIds.push(created.body.restaurant.id);
    const id = created.body.restaurant.id;

    const bad = await api('patch', `/api/v1/restaurants/${id}`).send({ gstin: 'JYFHJ' });
    expect(bad.status).toBe(400);

    const good = await api('patch', `/api/v1/restaurants/${id}`).send({ gstin: '27AAACR5055K1Z1', state: 'Maharashtra' });
    expect(good.status).toBe(200);
  });
});
