import { describe, it, expect } from 'vitest';
import { canMoveTable, allowedNextTableStates, TableRepository, db } from '../packages/database/src';

describe('table state machine', () => {
  it('allows the ordinary service cycle and refuses jumps', () => {
    expect(canMoveTable('AVAILABLE', 'OCCUPIED')).toBe(true);
    expect(canMoveTable('OCCUPIED', 'BILL_REQUESTED')).toBe(true);
    expect(canMoveTable('BILL_REQUESTED', 'CLEANING')).toBe(true);
    expect(canMoveTable('CLEANING', 'AVAILABLE')).toBe(true);
    expect(canMoveTable('AVAILABLE', 'BILLING')).toBe(false);
    expect(canMoveTable('OCCUPIED', 'RESERVED')).toBe(false);
    expect(canMoveTable('BLOCKED', 'OCCUPIED')).toBe(false);
    expect(canMoveTable('BLOCKED', 'AVAILABLE')).toBe(true);
    expect(canMoveTable('OCCUPIED', 'OCCUPIED')).toBe(true);
    expect(allowedNextTableStates('BLOCKED')).toEqual(['BLOCKED', 'AVAILABLE']);
  });

  it('the repository refuses an illegal move and leaves the table as it was', () => {
    db.resetToDefaultSeed();
    const t = TableRepository.createTable({ tableNumber: 'SM-1' });
    expect(TableRepository.updateTableStatus(t.id, 'BLOCKED')?.status).toBe('BLOCKED');
    expect(TableRepository.updateTableStatus(t.id, 'OCCUPIED')).toBeNull();
    expect(db.tables.find((x) => x.id === t.id)?.status).toBe('BLOCKED');
    expect(TableRepository.updateTableStatus(t.id, 'AVAILABLE')?.status).toBe('AVAILABLE');
    expect(new Set([TableRepository.createTable({}).id, TableRepository.createTable({}).id, TableRepository.createTable({}).id]).size).toBe(3);
  });
});
