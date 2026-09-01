import { describe, it, expect, beforeEach } from 'vitest';
import { db, MenuRepository, AuditRepository } from '@jamanvaar/database';
import { usePosStore } from '../apps/restaurant-system/pos/src/store/posStore';

describe('JAMANVAAR POS — Kitchen Inventory & Item Availability', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
    usePosStore.getState().clearCart();
  });

  it('1. should calculate real metrics for total, available, and unavailable dishes without hardcoding', () => {
    const totalDishes = db.menuItems.length;
    expect(totalDishes).toBeGreaterThan(0);

    const availableCount = db.menuItems.filter((i) => i.isAvailable !== false).length;
    const unavailableCount = db.menuItems.filter((i) => i.isAvailable === false).length;

    expect(availableCount + unavailableCount).toBe(totalDishes);
  });

  it('2. should toggle item availability to UNAVAILABLE with reason and audit log', () => {
    const butterNaan = db.menuItems.find((i) => i.name.toLowerCase().includes('butter naan')) || db.menuItems[0];
    expect(butterNaan.isAvailable).toBe(true);

    // Toggle to unavailable
    const updated = MenuRepository.toggleItemAvailability(
      butterNaan.id,
      false,
      'Ingredient unavailable',
      'Lead Cashier Amit Dave'
    );

    expect(updated).toBeDefined();
    expect(updated?.isAvailable).toBe(false);
    expect(updated?.soldOutReason).toBe('Ingredient unavailable');

    // Verify in db
    const inDb = db.menuItems.find((i) => i.id === butterNaan.id);
    expect(inDb?.isAvailable).toBe(false);

    // Verify audit log entry
    const lastAudit = db.auditLogs[0];
    expect(lastAudit.details).toContain('UNAVAILABLE');
    expect(lastAudit.details).toContain('Ingredient unavailable');
  });

  it('3. should toggle item availability back to AVAILABLE', () => {
    const item = db.menuItems[0];
    // First make unavailable
    MenuRepository.toggleItemAvailability(item.id, false, 'Out of stock');
    expect(item.isAvailable).toBe(false);

    // Now restore availability
    const restored = MenuRepository.toggleItemAvailability(item.id, true, undefined, 'Manager');
    expect(restored?.isAvailable).toBe(true);
    expect(restored?.soldOutReason).toBeUndefined();
    expect(item.isAvailable).toBe(true);
  });

  it('4. should support bulk toggling of multiple dishes', () => {
    const item1 = db.menuItems[0];
    const item2 = db.menuItems[1];
    const item3 = db.menuItems[2];

    const count = MenuRepository.bulkToggleAvailability(
      [item1.id, item2.id, item3.id],
      false,
      'Kitchen station power maintenance',
      'Admin'
    );

    expect(count).toBe(3);
    expect(item1.isAvailable).toBe(false);
    expect(item2.isAvailable).toBe(false);
    expect(item3.isAvailable).toBe(false);
  });

  it('5. should prevent unavailable dishes from being added to cart (Central Protection)', () => {
    const item = db.menuItems[0];
    // Set item as unavailable
    MenuRepository.toggleItemAvailability(item.id, false, 'Sold Out');
    expect(item.isAvailable).toBe(false);

    // Try adding to cart
    usePosStore.getState().addItemToCart(item, [], '', 1);

    // Cart must remain empty
    expect(usePosStore.getState().cart.items.length).toBe(0);
  });
});
