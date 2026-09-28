import { describe, it, expect } from 'vitest';
import { mergeOrderItems, kitchenStatusRank } from '../src/modules/order-sync/order-merge';

const item = (id: string, extra: Record<string, unknown> = {}): any => ({
  externalItemId: id, name: id, quantity: 1, unitPrice: 100, lineTotal: 100, modifiers: [], ...extra
});

describe('mergeOrderItems', () => {
  it('keeps items another device added when the first device pushes its own (stale) copy', () => {
    const existing = [item('a', { originDeviceId: 'POS' }), item('c', { originDeviceId: 'CAPTAIN' })];
    const { items, foreignItemsKept } = mergeOrderItems(existing, [item('a')], 'POS');
    expect(items.map((i) => i.externalItemId).sort()).toEqual(['a', 'c']);
    expect(foreignItemsKept).toBe(true);
  });

  it('honours a removal by the device that added the item', () => {
    const existing = [item('a', { originDeviceId: 'POS' }), item('b', { originDeviceId: 'POS' })];
    const { items } = mergeOrderItems(existing, [item('a')], 'POS');
    expect(items.map((i) => i.externalItemId)).toEqual(['a']);
  });

  it('a device cannot remove an item another device added just by omitting it', () => {
    const existing = [item('c', { originDeviceId: 'CAPTAIN' })];
    const { items } = mergeOrderItems(existing, [], 'POS');
    expect(items.map((i) => i.externalItemId)).toEqual(['c']);
  });

  it('tags new items with the pushing device as their origin', () => {
    const { items } = mergeOrderItems([], [item('n')], 'CAPTAIN');
    expect(items[0].originDeviceId).toBe('CAPTAIN');
  });

  it('kitchen progress never goes backwards: a stale push cannot un-ready a dish', () => {
    const existing = [item('a', { originDeviceId: 'POS', kitchenStatus: 'READY' })];
    const { items } = mergeOrderItems(existing, [item('a', { kitchenStatus: 'PENDING' })], 'POS');
    expect(items[0].kitchenStatus).toBe('READY');
  });

  it('kitchen progress moves forward when the kitchen device reports it', () => {
    const existing = [item('a', { originDeviceId: 'POS', kitchenStatus: 'PENDING' })];
    const { items } = mergeOrderItems(existing, [item('a', { kitchenStatus: 'PREPARING' })], 'KDS');
    expect(items[0].kitchenStatus).toBe('PREPARING');
  });

  it('an item another device already owns keeps its original owner when re-pushed', () => {
    const existing = [item('a', { originDeviceId: 'POS' })];
    const { items } = mergeOrderItems(existing, [item('a', { quantity: 2 })], 'KDS');
    expect(items[0].originDeviceId).toBe('POS');
    expect(items[0].quantity).toBe(2);
  });

  it('ranks kitchen statuses in service order and treats cancellation as terminal', () => {
    expect(kitchenStatusRank('PENDING')).toBeLessThan(kitchenStatusRank('PREPARING'));
    expect(kitchenStatusRank('PREPARING')).toBeLessThan(kitchenStatusRank('READY'));
    expect(kitchenStatusRank('READY')).toBeLessThan(kitchenStatusRank('SERVED'));
    expect(kitchenStatusRank('CANCELLED')).toBeGreaterThan(kitchenStatusRank('SERVED'));
    expect(kitchenStatusRank(undefined)).toBe(0);
  });

  it('an undo carries a higher revision and beats the stored copy, even though it moves the dish backwards', () => {
    const existing = [item('a', { originDeviceId: 'CAPTAIN', kitchenStatus: 'READY' })];
    const { items } = mergeOrderItems(existing, [item('a', { kitchenStatus: 'PREPARING', statusRev: 1 })], 'KDS');
    expect(items[0].kitchenStatus).toBe('PREPARING');
    expect(items[0].statusRev).toBe(1);
  });

  it('a delayed copy from before the undo (lower revision) cannot undo the undo', () => {
    const existing = [item('a', { originDeviceId: 'CAPTAIN', kitchenStatus: 'PREPARING', statusRev: 1 })];
    const { items } = mergeOrderItems(existing, [item('a', { kitchenStatus: 'READY' })], 'CAPTAIN');
    expect(items[0].kitchenStatus).toBe('PREPARING');
    expect(items[0].statusRev).toBe(1);
  });

  it('a cancelled dish stays cancelled and at no charge when a stale push still carries its price', () => {
    const existing = [item('a', { originDeviceId: 'CAPTAIN', kitchenStatus: 'CANCELLED', statusRev: 1, cancelReason: 'Out of stock', unitPrice: 0, lineTotal: 0 })];
    const { items } = mergeOrderItems(existing, [item('a', { kitchenStatus: 'PREPARING', unitPrice: 15000, lineTotal: 15000 })], 'CAPTAIN');
    expect(items[0]).toMatchObject({ kitchenStatus: 'CANCELLED', statusRev: 1, cancelReason: 'Out of stock', unitPrice: 0, lineTotal: 0 });
  });

  it('a push from an older client with no revision at all still moves a dish forward', () => {
    const existing = [item('a', { originDeviceId: 'POS', kitchenStatus: 'PREPARING' })];
    const { items } = mergeOrderItems(existing, [item('a', { kitchenStatus: 'READY' })], 'KDS');
    expect(items[0].kitchenStatus).toBe('READY');
    expect(items[0].statusRev).toBeUndefined();
  });

  it('with no existing order the incoming items are simply adopted', () => {
    const { items, foreignItemsKept } = mergeOrderItems(undefined, [item('x'), item('y')], 'POS');
    expect(items).toHaveLength(2);
    expect(foreignItemsKept).toBe(false);
  });
});
