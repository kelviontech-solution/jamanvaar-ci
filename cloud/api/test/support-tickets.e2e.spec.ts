import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * BUG-085/086/087: creating a ticket failed with no visible reason, a ticket could not be
 * assigned when created (and could be assigned to someone who cannot log in), and there was
 * no "my tickets" / "unassigned" / per-teammate view or readable ticket number.
 */
describe('Support tickets (BUG-085/086/087)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const password = 'correct-horse-battery-staple';
  const emails = { me: `tk-me-${stamp}@example.com`, mate: `tk-mate-${stamp}@example.com`, off: `tk-off-${stamp}@example.com` };
  let meToken: string;
  let meId: string;
  let mateId: string;
  let disabledId: string;
  const createdTickets: string[] = [];

  const api = (method: 'get' | 'post' | 'patch', url: string) => request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${meToken}`);
  const make = async (body: object) => {
    const res = await api('post', '/api/v1/support-tickets').send({ subject: 'Printer offline', description: 'The kitchen printer is offline', ...body });
    if (res.status === 201) createdTickets.push(res.body.id);
    return res;
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const me = await createTestPlatformUser(prisma, { email: emails.me, password, role: 'SUPPORT_ADMIN' });
    const mate = await createTestPlatformUser(prisma, { email: emails.mate, password, role: 'SUPPORT_ADMIN' });
    const off = await createTestPlatformUser(prisma, { email: emails.off, password, role: 'SUPPORT_ADMIN' });
    meId = me.id;
    mateId = mate.id;
    disabledId = off.id;
    await prisma.platformUser.update({ where: { id: off.id }, data: { status: 'DISABLED' } });
    meToken = (await platformLogin(app, emails.me, password)).body.accessToken;
  });

  afterAll(async () => {
    if (createdTickets.length) await prisma.runAsPlatform((tx) => tx.supportTicket.deleteMany({ where: { id: { in: createdTickets } } }));
    await prisma.platformUser.deleteMany({ where: { email: { in: Object.values(emails) } } });
    await app.close();
  });

  it('a ticket can be assigned to an active teammate at creation', async () => {
    const res = await make({ assignedToId: mateId });
    expect(res.status).toBe(201);
    expect(res.body.assignedTo.id).toBe(mateId);
  });

  it('cannot be assigned to someone who cannot log in (disabled) or who does not exist', async () => {
    const disabled = await make({ assignedToId: disabledId });
    expect(disabled.status).toBe(400);
    expect(disabled.body.message).toMatch(/active/i);

    const missing = await make({ assignedToId: '11111111-1111-4111-8111-111111111111' });
    expect(missing.status).toBe(400);

    const reassign = await make({});
    const bad = await api('patch', `/api/v1/support-tickets/${reassign.body.id}`).send({ assignedToId: disabledId });
    expect(bad.status).toBe(400);
  });

  it('too-short fields are rejected with the reasons listed (what the page must show)', async () => {
    const res = await make({ subject: 'er', description: 'gr' });
    expect(res.status).toBe(400);
    expect(res.body.issues.map((i: any) => i.path).sort()).toEqual(['description', 'subject']);
    expect(res.body.issues[0].message).toMatch(/at least 3/i);
  });

  it('every ticket gets a readable, increasing number', async () => {
    const a = await make({});
    const b = await make({});
    expect(typeof a.body.number).toBe('number');
    expect(b.body.number).toBeGreaterThan(a.body.number);
  });

  it('filters: mine, unassigned, created by me, overdue, search', async () => {
    const mine = await make({ assignedToId: meId, subject: 'Mine ticket alpha' });
    const unassigned = await make({ subject: 'Nobody has this beta' });
    const theirs = await make({ assignedToId: mateId, subject: 'Teammate ticket gamma' });
    // make one overdue
    await prisma.runAsPlatform((tx) => tx.supportTicket.update({ where: { id: theirs.body.id }, data: { slaDueAt: new Date(Date.now() - 3600_000) } }));

    const ids = async (qs: string) => (await api('get', `/api/v1/support-tickets?${qs}`)).body.map((t: any) => t.id);

    expect(await ids('view=mine')).toContain(mine.body.id);
    expect(await ids('view=mine')).not.toContain(theirs.body.id);
    expect(await ids('view=unassigned')).toContain(unassigned.body.id);
    expect(await ids('view=unassigned')).not.toContain(mine.body.id);
    expect(await ids('view=created-by-me')).toContain(theirs.body.id);
    expect(await ids('view=overdue')).toEqual(expect.arrayContaining([theirs.body.id]));
    expect(await ids('view=overdue')).not.toContain(mine.body.id);
    expect(await ids('search=alpha')).toEqual([mine.body.id]);
    expect(await ids(`assignedToId=${mateId}`)).toContain(theirs.body.id);
  });

  it('"my work today" is my open/in-progress tickets, most urgent SLA first, never resolved ones', async () => {
    const later = await make({ assignedToId: meId, priority: 'LOW', subject: 'Work later' });
    const soon = await make({ assignedToId: meId, priority: 'URGENT', subject: 'Work soon' });
    const done = await make({ assignedToId: meId, subject: 'Work done already' });
    await api('patch', `/api/v1/support-tickets/${done.body.id}`).send({ status: 'RESOLVED' });

    const rows = (await api('get', '/api/v1/support-tickets?view=my-work')).body;
    const order = rows.map((t: any) => t.id);
    expect(order).not.toContain(done.body.id);
    expect(order.indexOf(soon.body.id)).toBeLessThan(order.indexOf(later.body.id));
  });

  it('a summary gives the counts behind the tabs, including open tickets per teammate', async () => {
    const res = await api('get', '/api/v1/support-tickets/summary');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      all: expect.any(Number), mine: expect.any(Number), unassigned: expect.any(Number),
      createdByMe: expect.any(Number), overdue: expect.any(Number)
    });
    const mate = res.body.byAssignee.find((a: any) => a.userId === mateId);
    expect(mate.openCount).toBeGreaterThanOrEqual(1);
    expect(mate.name).toBeTruthy();
  });

  it('respects the limit and pages through results', async () => {
    const page1 = (await api('get', '/api/v1/support-tickets?limit=2&page=1')).body;
    const page2 = (await api('get', '/api/v1/support-tickets?limit=2&page=2')).body;
    expect(page1).toHaveLength(2);
    expect(page2.map((t: any) => t.id)).not.toEqual(page1.map((t: any) => t.id));
  });
});
