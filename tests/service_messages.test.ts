import { describe, it, expect, beforeEach } from 'vitest';
import { db, ServiceMessages, NotificationRepository } from '@jamanvaar/database';
import { EntitySyncEngine, syncServiceMessages } from '@jamanvaar/sync';
import type { CloudSyncedEntity, EntitySyncEvent } from '@jamanvaar/sync';

/**
 * BUG-099 / BUG-100 (found in the live Captain test): "Send Bill Request to Counter POS" and staff
 * messages reached nobody, because they travelled only as a same-browser LAN-mesh event. They are
 * now short records carried through the cloud sync; each device turns the ones meant for it into a
 * notification it already knows how to show.
 */
describe('Staff messages and bill requests across devices (BUG-099/100)', () => {
  const remote = (over: Record<string, unknown> = {}) => ({
    id: 'msg-1', kind: 'MESSAGE', recipient: 'KITCHEN', senderName: 'Ravi Waiter', presetText: 'Food taking too long', customNote: '', tableNumber: '4', createdAt: new Date().toISOString(), ...over
  });

  beforeEach(() => {
    db.resetToDefaultSeed();
    db.notifications = [];
    ServiceMessages.resetForTests();
  });

  it('a message the waiter sends is queued once with an id and a time, and leaves the queue when pushed', () => {
    const queued = ServiceMessages.enqueue({ kind: 'MESSAGE', recipient: 'KITCHEN', senderName: 'Ravi Waiter', presetText: 'Extra plates required', tableNumber: '4' });
    expect(queued.id).toBeTruthy();

    const records = ServiceMessages.collectSyncRecords();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ externalId: queued.id, payload: { recipient: 'KITCHEN', tableNumber: '4', kind: 'MESSAGE' } });

    ServiceMessages.markPushed(records);
    expect(ServiceMessages.collectSyncRecords()).toHaveLength(0);
  });

  it('the kitchen screen gets a notification for a message addressed to the kitchen, once', () => {
    ServiceMessages.applyRemote(remote(), 'KDS');
    ServiceMessages.applyRemote(remote(), 'KDS');

    const list = NotificationRepository.getNotifications('KDS');
    expect(list).toHaveLength(1);
    expect(list[0].title).toContain('Ravi Waiter');
    expect(list[0].title).toContain('Table 4');
    expect(list[0].message).toBe('Food taking too long');
  });

  it('a message for the counter is not shown in the kitchen, and one for everyone is shown everywhere', () => {
    ServiceMessages.applyRemote(remote({ id: 'a', recipient: 'POS' }), 'KDS');
    expect(NotificationRepository.getNotifications('KDS')).toHaveLength(0);

    ServiceMessages.applyRemote(remote({ id: 'b', recipient: 'ALL', presetText: 'Fire drill' }), 'KDS');
    ServiceMessages.applyRemote(remote({ id: 'b', recipient: 'ALL', presetText: 'Fire drill' }), 'POS');
    expect(NotificationRepository.getNotifications('KDS').map((n) => n.message)).toContain('Fire drill');
    expect(NotificationRepository.getNotifications('POS').map((n) => n.message)).toContain('Fire drill');
  });

  it('a bare bill message raises no notification: the bill itself (items and amount) comes from its order', () => {
    ServiceMessages.applyRemote(remote({ id: 'bill-1', kind: 'BILL_REQUEST', recipient: 'POS', presetText: 'Bill requested', tableNumber: '7' }), 'POS');
    expect(NotificationRepository.getNotifications('POS')).toHaveLength(0);
  });

  it('the owner\'s Restaurant Admin also sees bill requests and manager messages', () => {
    ServiceMessages.applyRemote(remote({ id: 'm-1', recipient: 'MANAGER', presetText: 'Manager assistance required at table' }), 'POS_ADMIN');
    expect(NotificationRepository.getNotifications('POS_ADMIN')).toHaveLength(1);
  });

  it('a device never notifies itself about a message it sent', () => {
    const own = ServiceMessages.enqueue({ kind: 'MESSAGE', recipient: 'ALL', senderName: 'Ravi Waiter', presetText: 'Hello' });
    ServiceMessages.applyRemote({ ...own }, 'KDS');
    expect(NotificationRepository.getNotifications('KDS')).toHaveLength(0);
  });

  it('Captain gets messages addressed to captains, as inbox messages rather than notifications', () => {
    const inbound = ServiceMessages.applyRemote(remote({ id: 'c-1', recipient: 'CAPTAIN', senderName: 'Manager', presetText: 'Table 9 needs help' }), 'CAPTAIN');
    expect(inbound).toMatchObject({ id: 'c-1', senderName: 'Manager', presetText: 'Table 9 needs help' });
    expect(ServiceMessages.applyRemote(remote({ id: 'c-2', recipient: 'KITCHEN' }), 'CAPTAIN')).toBeNull();
    expect(ServiceMessages.applyRemote(remote({ id: 'c-1', recipient: 'CAPTAIN' }), 'CAPTAIN')).toBeNull();
  });

  it('a guest\'s own Call Staff tap raises a GUEST_HELP/URGENT notification, distinct from an ordinary staff message, so it can be shown as a full-attention popup instead of the small auto-dismissing toast', () => {
    ServiceMessages.applyRemote(remote({ id: 'call-1', kind: 'CALL_STAFF', recipient: 'COUNTER', senderName: 'Self-order kiosk', presetText: 'A guest asked for help.', tableNumber: '5' }), 'POS_ADMIN');

    const [notif] = NotificationRepository.getNotifications('POS_ADMIN');
    expect(notif).toMatchObject({ type: 'GUEST_HELP', priority: 'URGENT' });
    expect(notif.title).toContain('Table 5');

    // An ordinary staff-to-staff message is unaffected: still MANAGER_ALERT/HIGH, not urgent.
    ServiceMessages.applyRemote(remote({ id: 'msg-ordinary', recipient: 'MANAGER', presetText: 'Running low on naan' }), 'POS_ADMIN');
    const ordinary = NotificationRepository.getNotifications('POS_ADMIN').find((n) => n.id === 'notif-msg-ordinary')!;
    expect(ordinary).toMatchObject({ type: 'MANAGER_ALERT', priority: 'HIGH' });
  });

  it('old and malformed messages are ignored', () => {
    ServiceMessages.applyRemote(remote({ id: 'old', createdAt: new Date(Date.now() - 20 * 3600_000).toISOString() }), 'KDS');
    ServiceMessages.applyRemote({} as never, 'KDS');
    ServiceMessages.applyRemote({ id: 'x', recipient: 'KITCHEN' } as never, 'KDS');
    expect(NotificationRepository.getNotifications('KDS')).toHaveLength(0);
  });

  describe('the sync tick', () => {
    let pushed: EntitySyncEvent[][];
    let pullable: CloudSyncedEntity[];

    beforeEach(() => {
      pushed = [];
      pullable = [];
      EntitySyncEngine.configureTransport({
        push: async (_type, events) => { pushed.push(events); return { results: events.map((e) => ({ externalId: e.externalId, status: 'ok' as const })), serverTime: new Date().toISOString() }; },
        pull: async () => ({ entities: pullable, serverTime: new Date().toISOString() })
      });
    });

    it('pushes what was queued and applies what arrived for this device', async () => {
      ServiceMessages.enqueue({ kind: 'BILL_REQUEST', recipient: 'POS', senderName: 'Ravi Waiter', presetText: 'Bill requested', tableNumber: '2' });
      pullable = [{ externalId: 'in-1', updatedAt: new Date().toISOString(), payload: remote({ id: 'in-1', recipient: 'KITCHEN' }) }];

      const inbound = await syncServiceMessages('KDS');

      expect(pushed).toHaveLength(1);
      expect(pushed[0][0].payload).toMatchObject({ kind: 'BILL_REQUEST', tableNumber: '2' });
      expect(ServiceMessages.collectSyncRecords()).toHaveLength(0);
      expect(NotificationRepository.getNotifications('KDS')).toHaveLength(1);
      expect(inbound).toEqual([]);
    });

    it('keeps a message queued when the push fails', async () => {
      EntitySyncEngine.configureTransport({ push: async () => { throw new Error('offline'); }, pull: async () => ({ entities: [], serverTime: new Date().toISOString() }) });
      ServiceMessages.enqueue({ kind: 'MESSAGE', recipient: 'KITCHEN', senderName: 'Ravi', presetText: 'Hi' });
      await syncServiceMessages('CAPTAIN');
      expect(ServiceMessages.collectSyncRecords()).toHaveLength(1);
    });

    it('returns Captain inbox messages for the store to show', async () => {
      pullable = [{ externalId: 'in-2', updatedAt: new Date().toISOString(), payload: remote({ id: 'in-2', recipient: 'CAPTAIN', presetText: 'Come to the pass' }) }];
      const inbound = await syncServiceMessages('CAPTAIN');
      expect(inbound.map((m) => m.presetText)).toEqual(['Come to the pass']);
    });
  });
});
