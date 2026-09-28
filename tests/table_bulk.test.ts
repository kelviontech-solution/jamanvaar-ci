import { describe, it, expect } from 'vitest';
import { planBulkTables } from '@jamanvaar/database';

describe('adding several tables at once', () => {
  const none = () => false;

  it('numbers them one after another, with an optional prefix', () => {
    expect(planBulkTables('1', 4, '', none)).toEqual({ create: ['1', '2', '3', '4'], skipped: [] });
    expect(planBulkTables('5', 3, 'T', none).create).toEqual(['T5', 'T6', 'T7']);
    expect(planBulkTables('10', 2, ' A ', none).create).toEqual(['A10', 'A11']);
  });

  it('skips numbers that already exist instead of failing the whole batch, and says which', () => {
    const taken = new Set(['2', '3']);
    expect(planBulkTables('1', 5, '', (n) => taken.has(n))).toEqual({ create: ['1', '4', '5'], skipped: ['2', '3'] });
  });

  it('refuses when every number is taken, or the input is unusable, with a plain reason', () => {
    expect(planBulkTables('1', 2, '', () => true).error).toMatch(/already exist/);
    expect(planBulkTables('abc', 2, '', none).error).toMatch(/whole number/);
    expect(planBulkTables('1.5', 2, '', none).error).toMatch(/whole number/);
    expect(planBulkTables('-3', 2, '', none).error).toMatch(/whole number/);
    expect(planBulkTables('1', 0, '', none).error).toMatch(/how many/i);
    expect(planBulkTables('1', 51, '', none).error).toMatch(/up to 50/);
    expect(planBulkTables('1', 3, '<b>', none).error).toMatch(/prefix/);
    expect(planBulkTables('1', 3, 'TOOLONGPREFIX', none).error).toMatch(/prefix/);
  });
});
