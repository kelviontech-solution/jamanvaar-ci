import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { EmailService } from '../src/modules/notifications/email.service';

/** Onboarding must produce a Restaurant ID and email the owner their first credentials. */
describe('owner welcome email and Restaurant ID', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  const stamp = Date.now();
  const adminEmail = `test-welcome-admin-${stamp}@example.com`;
  const ids: string[] = [];
  const sent: Array<{ to: string; subject: string; html: string }> = [];
  const post = (body: Record<string, unknown>) => request(app.getHttpServer()).post('/api/v1/restaurants').set('Authorization', `Bearer ${token}`).send(body);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: 'correct-horse-battery-staple' });
    token = (await platformLogin(app, adminEmail, 'correct-horse-battery-staple')).body.accessToken;
    vi.spyOn(app.get(EmailService), 'send').mockImplementation(async (to, subject, html) => { sent.push({ to, subject, html }); return true; });
  });
  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: { in: ids } } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('a chosen first password is emailed with the Restaurant ID and login, and the owner is active', async () => {
    const mobile = `9${String(stamp).slice(-9)}`;
    const res = await post({ name: `TEST Welcome ${stamp}`, mobile, ownerName: 'Asha', ownerEmail: `welcome-${stamp}@test.example.com`, ownerPassword: 'Correct-Horse-9-Battery' });
    expect(res.status).toBe(201);
    ids.push(res.body.restaurant.id);
    expect(res.body.restaurant.restaurantCode).toBe(`JM${mobile}`);
    expect(res.body.owner.status).toBe('ACTIVE');
    const mail = sent.find((m) => m.to === `welcome-${stamp}@test.example.com`)!;
    expect(mail.html).toContain(`JM${mobile}`);
    expect(mail.html).toContain('Correct-Horse-9-Battery');
    expect(mail.html).toContain(`welcome-${stamp}@test.example.com`);
  });

  it('an invited owner gets the Restaurant ID and the invitation token instead of a password', async () => {
    const mobile = `8${String(stamp).slice(-9)}`;
    const res = await post({ name: `TEST Invite ${stamp}`, mobile, ownerName: 'Ravi', ownerEmail: `invite-${stamp}@test.example.com` });
    ids.push(res.body.restaurant.id);
    const mail = sent.find((m) => m.to === `invite-${stamp}@test.example.com`)!;
    expect(mail.html).toContain(`JM${mobile}`);
    expect(mail.html).toContain(res.body.activationToken);
    expect(mail.html).not.toContain('First-time password');
  });

  it('a restaurant made without a mobile gets its Restaurant ID when a mobile is added later, once', async () => {
    const res = await post({ name: `TEST NoMobile ${stamp}`, ownerName: 'Meena', ownerEmail: `nomobile-${stamp}@test.example.com` });
    ids.push(res.body.restaurant.id);
    expect(res.body.restaurant.restaurantCode).toBeNull();
    const mobile = `7${String(stamp).slice(-9)}`;
    const patched = await request(app.getHttpServer()).patch(`/api/v1/restaurants/${res.body.restaurant.id}`).set('Authorization', `Bearer ${token}`).send({ mobile });
    expect(patched.body.restaurantCode).toBe(`JM${mobile}`);
    const again = await request(app.getHttpServer()).patch(`/api/v1/restaurants/${res.body.restaurant.id}`).set('Authorization', `Bearer ${token}`).send({ mobile: `6${String(stamp).slice(-9)}` });
    expect(again.body.restaurantCode).toBe(`JM${mobile}`); // never follows a later phone change
  });
});
