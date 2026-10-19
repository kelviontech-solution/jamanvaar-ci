import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { EntitySyncService } from '../src/modules/entity-sync/entity-sync.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { RealtimeBus } from '../src/common/realtime/realtime-bus';
import { WelcomeDesignsService } from '../src/modules/platform-settings/welcome-designs.service';

describe('EC-04 entity concurrency and clock repair', () => {
  const prisma = new PrismaService();
  const service = new EntitySyncService(
    prisma,
    { log: async () => {} } as unknown as AuditService,
    { publish() {} } as unknown as RealtimeBus,
    {} as WelcomeDesignsService
  );
  let restaurantId: string;
  const payload = (name: string, date = new Date().toISOString()) => ({ name, isActive: true, sortOrder: 0, updatedAt: date });
  beforeAll(async () => {
    await prisma.onModuleInit();
    restaurantId = (await prisma.runAsPlatform((tx) => tx.restaurant.create({ data: { name: 'Entity repair fixture', restaurantCode: 'QA' + randomUUID() } })))
      .id;
  });
  afterAll(async () => {
    if (restaurantId) await prisma.runAsPlatform((tx) => tx.restaurant.delete({ where: { id: restaurantId } }));
    await prisma.onModuleDestroy();
  });
  it('rejects a future-clock mutation before it can poison the authoritative record', async () => {
    const result = await service.pushEventsForRestaurant(restaurantId, 'MENU_CATEGORY', [
      { externalId: randomUUID(), payload: payload('Future', '2050-01-01T00:00:00Z') }
    ]);
    expect(result.results[0]).toMatchObject({ status: 'error', error: expect.stringContaining('DEVICE_CLOCK_AHEAD') });
  });
  it('returns an explicit deleted-record result to a revision-aware client', async () => {
    const externalId = randomUUID();
    await service.pushEventsForRestaurant(restaurantId, 'MENU_CATEGORY', [{ externalId, baseSyncVersion: 0, payload: { deleted: true, updatedAt: new Date().toISOString() } }]);
    expect((await service.pushEventsForRestaurant(restaurantId, 'MENU_CATEGORY', [{ externalId, baseSyncVersion: 1, payload: payload('Resurrected') }])).results[0]).toMatchObject({ status: 'error', error: expect.stringContaining('ENTITY_DELETED') });
  });
  it('uses the expected server revision and permits an identical retry', async () => {
    const externalId = randomUUID();
    const first = payload('First');
    expect(
      (await service.pushEventsForRestaurant(restaurantId, 'MENU_CATEGORY', [{ externalId, payload: first, baseSyncVersion: 0 }])).results[0]
    ).toMatchObject({ status: 'ok', syncVersion: 1 });
    expect(
      (await service.pushEventsForRestaurant(restaurantId, 'MENU_CATEGORY', [{ externalId, payload: first, baseSyncVersion: 0 }])).results[0]
    ).toMatchObject({ status: 'ok', syncVersion: 1 });
    expect(
      (await service.pushEventsForRestaurant(restaurantId, 'MENU_CATEGORY', [{ externalId, payload: payload('Conflicting'), baseSyncVersion: 0 }])).results[0]
    ).toMatchObject({ status: 'error', error: expect.stringContaining('ENTITY_VERSION_CONFLICT') });
    expect(
      (
        await service.pushEventsForRestaurant(restaurantId, 'MENU_CATEGORY', [
          { externalId, payload: payload('Reviewed', '2020-01-01T00:00:00Z'), baseSyncVersion: 1 }
        ])
      ).results[0]
    ).toMatchObject({ status: 'ok', syncVersion: 2 });
  });
  it('reports an unapplied legacy edit as stale instead of success', async () => {
    const externalId = randomUUID();
    await service.pushEventsForRestaurant(restaurantId, 'MENU_CATEGORY', [{ externalId, payload: payload('Current') }]);
    expect(
      (await service.pushEventsForRestaurant(restaurantId, 'MENU_CATEGORY', [{ externalId, payload: payload('Stale', '2020-01-01T00:00:00Z') }])).results[0]
    ).toMatchObject({ status: 'error', error: expect.stringContaining('STALE_ENTITY') });
  });
  it('allows repair of an already-poisoned future timestamp using the current revision', async () => {
    const externalId = randomUUID();
    await prisma.runAsTenant(restaurantId, (tx) =>
      tx.syncedEntity.create({ data: { restaurantId, entityType: 'MENU_CATEGORY', externalId, payload: payload('Poisoned', '2050-01-01T00:00:00Z') } })
    );
    const result = await service.pushEventsForRestaurant(restaurantId, 'MENU_CATEGORY', [{ externalId, payload: payload('Repaired'), baseSyncVersion: 1 }]);
    expect(result.results[0]).toMatchObject({ status: 'ok', syncVersion: 2 });
    const saved = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.syncedEntity.findUniqueOrThrow({ where: { restaurantId_entityType_externalId: { restaurantId, entityType: 'MENU_CATEGORY', externalId } } })
    );
    expect(saved.payload).toMatchObject({ name: 'Repaired' });
  });
});
