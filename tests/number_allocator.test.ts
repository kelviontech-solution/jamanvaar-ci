import { describe, it, expect, beforeEach } from 'vitest';
import { NumberAllocator } from '../packages/database/src/number_allocator';

const at = (iso: string) => new Date(iso);
const NOON = at('2026-09-25T06:30:00Z'); // 12:00 IST

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k)
  };
}

describe('NumberAllocator', () => {
  let storage: ReturnType<typeof memoryStorage>;
  beforeEach(() => {
    storage = memoryStorage();
    NumberAllocator.reset(storage);
  });

  it('returns null until configured, so legacy numbering keeps working on unactivated devices', () => {
    expect(NumberAllocator.next('ORDER', NOON)).toBeNull();
  });

  it('numbers from a leased block in order, formatted branch-day scoped', () => {
    NumberAllocator.configure({ deviceCode: 'P01', branchCode: 'AHD' });
    NumberAllocator.addLease({ kind: 'ORDER', prefix: 'AHD', businessDate: '20260925', start: 24, count: 3 });
    expect([1, 2, 3].map(() => NumberAllocator.next('ORDER', NOON))).toEqual(['AHD-20260925-024', 'AHD-20260925-025', 'AHD-20260925-026']);
  });

  it('when the block is used up while offline, falls back to a device-prefixed number that cannot collide with another device', () => {
    NumberAllocator.configure({ deviceCode: 'P02', branchCode: 'AHD' });
    NumberAllocator.addLease({ kind: 'KOT', prefix: 'AHD', businessDate: '20260925', start: 1, count: 1 });
    expect(NumberAllocator.next('KOT', NOON)).toBe('AHD-20260925-001');
    expect(NumberAllocator.next('KOT', NOON)).toBe('AHD-20260925-P02-001');
    expect(NumberAllocator.next('KOT', NOON)).toBe('AHD-20260925-P02-002');
  });

  it('two devices with disjoint leases plus their own fallbacks never produce the same number', () => {
    const seen = new Set<string>();
    const run = (device: string, start: number) => {
      NumberAllocator.reset(memoryStorage());
      NumberAllocator.configure({ deviceCode: device, branchCode: 'AHD' });
      NumberAllocator.addLease({ kind: 'ORDER', prefix: 'AHD', businessDate: '20260925', start, count: 5 });
      for (let i = 0; i < 12; i++) {
        const n = NumberAllocator.next('ORDER', NOON)!;
        expect(seen.has(n), n).toBe(false);
        seen.add(n);
      }
    };
    run('P01', 1);
    run('P02', 6);
    expect(seen.size).toBe(24);
  });

  it('state survives an app restart: no number is ever issued twice', () => {
    NumberAllocator.configure({ deviceCode: 'P01', branchCode: 'AHD' });
    NumberAllocator.addLease({ kind: 'ORDER', prefix: 'AHD', businessDate: '20260925', start: 1, count: 10 });
    const first = NumberAllocator.next('ORDER', NOON);
    NumberAllocator.reload(storage);
    const second = NumberAllocator.next('ORDER', NOON);
    expect(first).toBe('AHD-20260925-001');
    expect(second).toBe('AHD-20260925-002');
  });

  it('a new business day never reuses yesterday\'s block', () => {
    NumberAllocator.configure({ deviceCode: 'P01', branchCode: 'AHD' });
    NumberAllocator.addLease({ kind: 'ORDER', prefix: 'AHD', businessDate: '20260925', start: 1, count: 100 });
    const nextDay = at('2026-09-26T06:30:00Z');
    expect(NumberAllocator.next('ORDER', nextDay)).toBe('AHD-20260926-P01-001');
    NumberAllocator.addLease({ kind: 'ORDER', prefix: 'AHD', businessDate: '20260926', start: 1, count: 100 });
    expect(NumberAllocator.next('ORDER', nextDay)).toBe('AHD-20260926-001');
  });

  it('uses the branch timezone for the business day (11:30pm IST is still the same day)', () => {
    NumberAllocator.configure({ deviceCode: 'P01', branchCode: 'AHD', timezone: 'Asia/Kolkata' });
    NumberAllocator.addLease({ kind: 'ORDER', prefix: 'AHD', businessDate: '20260925', start: 1, count: 5 });
    expect(NumberAllocator.next('ORDER', at('2026-09-25T18:00:00Z'))).toBe('AHD-20260925-001');
  });

  it('reports when a refill is due so the sync layer can lease another block while online', () => {
    NumberAllocator.configure({ deviceCode: 'P01', branchCode: 'AHD' });
    expect(NumberAllocator.needsRefill('ORDER', NOON, 10)).toBe(true);
    NumberAllocator.addLease({ kind: 'ORDER', prefix: 'AHD', businessDate: '20260925', start: 1, count: 50 });
    expect(NumberAllocator.needsRefill('ORDER', NOON, 10)).toBe(false);
    for (let i = 0; i < 45; i++) NumberAllocator.next('ORDER', NOON);
    expect(NumberAllocator.needsRefill('ORDER', NOON, 10)).toBe(true);
  });

  it('a lease that arrives while an older block is still unused is queued behind it, not dropped', () => {
    NumberAllocator.configure({ deviceCode: 'P01', branchCode: 'AHD' });
    NumberAllocator.addLease({ kind: 'ORDER', prefix: 'AHD', businessDate: '20260925', start: 1, count: 2 });
    NumberAllocator.addLease({ kind: 'ORDER', prefix: 'AHD', businessDate: '20260925', start: 101, count: 2 });
    const out = [1, 2, 3, 4].map(() => NumberAllocator.next('ORDER', NOON));
    expect(out).toEqual(['AHD-20260925-001', 'AHD-20260925-002', 'AHD-20260925-101', 'AHD-20260925-102']);
  });
});
