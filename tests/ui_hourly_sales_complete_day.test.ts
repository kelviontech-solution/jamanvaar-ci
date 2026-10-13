import { describe, expect, it } from 'vitest';
import type { Order } from '@jamanvaar/types';
import { ReportDataEngine } from '../apps/restaurant-system/pos-admin/src/components/reports/reportDataEngine';

describe('hourly sales across the full local day', () => {
  it('includes breakfast and overnight sales without dropping their amounts', () => {
    const hours = [0, 2, 8, 9, 10, 23];
    const orders = hours.map((hour, i) => ({ createdAt: new Date(2026, 9, 13, hour, 15).toISOString(), totalAmount: (i + 1) * 100, orderStatus: 'COMPLETED' }) as Order);
    const result = ReportDataEngine.getHourlySales(orders);
    expect(result).toHaveLength(24);
    expect(result.reduce((sum, bucket) => sum + bucket.sales, 0)).toBe(2100);
    for (const [i, hour] of hours.entries()) expect(result.find(bucket => bucket.hour === hour)?.sales).toBe((i + 1) * 100);
    expect(result[0].label).toBe('12 AM');
    expect(result[23].label).toBe('11 PM');
  });
});
