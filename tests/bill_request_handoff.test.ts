import { describe, it, expect, beforeEach } from 'vitest';
import { db, NotificationRepository, ServiceMessages, billRequestNotification, resetBillAnnouncementsForTests } from '@jamanvaar/database';

const legacyBillMessage = (id = 'svc-1') => ({
  id,
  kind: 'BILL_REQUEST',
  recipient: 'POS',
  senderName: 'Captain One',
  presetText: 'Bill requested',
  tableNumber: 'TN4',
  createdAt: new Date().toISOString()
});

describe('a bill request shows the counter what to collect, once', () => {
  beforeEach(() => {
    db.notifications = [];
    ServiceMessages.resetForTests();
    resetBillAnnouncementsForTests();
  });

  it('a bare bill message from an older build raises no notification: it names a table and no bill', () => {
    expect(ServiceMessages.applyRemote(legacyBillMessage(), 'POS')).not.toBeNull();
    expect(db.notifications).toHaveLength(0);
  });

  it('the notification states the table, the amount to pay, what was eaten, and who asked', () => {
    const n = billRequestNotification({ requestId: 'ord-1-t', tableNumber: 'TN4', senderName: 'Captain One', billAmount: 830, billLines: '2× Paneer Tikka, 1× Naan', orderId: 'ord-1', targetRoles: ['POS'] });
    expect(n.title).toBe('🧾 Table TN4 · ₹830.00 to pay');
    expect(n.message).toBe('2× Paneer Tikka, 1× Naan — Captain One asked for the bill.');
    expect(n.meta).toEqual({ orderId: 'ord-1', billAmount: 830 });
  });

  it('the same request raised twice with the same id shows once', () => {
    const n = billRequestNotification({ requestId: 'svc-1', tableNumber: 'TN4', senderName: 'Captain One', billAmount: 830, billLines: '2× Paneer Tikka', orderId: 'ord-1', targetRoles: ['POS', 'POS_ADMIN', 'ALL'] });
    NotificationRepository.createNotification(n);
    NotificationRepository.createNotification(n);
    expect(db.notifications).toHaveLength(1);
  });

  it('two different requests from the same table both show', () => {
    NotificationRepository.createNotification(billRequestNotification({ requestId: 'a', tableNumber: 'TN4', senderName: 'Captain One', billAmount: 100, orderId: 'ord-1', targetRoles: ['POS'] }));
    NotificationRepository.createNotification(billRequestNotification({ requestId: 'b', tableNumber: 'TN4', senderName: 'Captain One', billAmount: 120, orderId: 'ord-1', targetRoles: ['POS'] }));
    expect(db.notifications).toHaveLength(2);
  });
});
