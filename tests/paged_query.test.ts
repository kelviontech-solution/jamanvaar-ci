import { describe, it, expect } from 'vitest';
import { buildQuery, rangeLabel, splitEnvelope } from '../cloud/super-admin-web/src/lib/pagedQuery';

/** BUG-047/051/060/067: every platform list now pages on the server; this is the query it builds. */
describe('buildQuery', () => {
  it('leaves out empty, null, undefined and "ALL" filters', () => {
    expect(buildQuery({ q: '', status: 'ALL', restaurantId: undefined, health: null })).toBe('');
  });

  it('keeps real filters, trimmed and encoded', () => {
    expect(buildQuery({ q: '  pizza & co ', page: 2, pageSize: 25, overdue: true })).toBe('q=pizza+%26+co&page=2&pageSize=25&overdue=true');
  });

  it('keeps a numeric zero and false-y-but-meaningful values', () => {
    expect(buildQuery({ page: 0 })).toBe('page=0');
  });
});

describe('splitEnvelope', () => {
  it('separates the list from the summary fields the server attached', () => {
    const r = splitEnvelope<{ id: string }, { statusCounts: Record<string, number> }>({
      items: [{ id: 'a' }], total: 51, page: 2, pageSize: 25, totalPages: 3, statusCounts: { ACTIVE: 4 }
    });
    expect(r.items).toEqual([{ id: 'a' }]);
    expect(r.total).toBe(51);
    expect(r.extra).toEqual({ statusCounts: { ACTIVE: 4 } });
  });
});

describe('rangeLabel', () => {
  it('describes the visible range', () => {
    expect(rangeLabel(1, 25, 130)).toBe('1-25 of 130');
    expect(rangeLabel(6, 25, 130)).toBe('126-130 of 130');
    expect(rangeLabel(1, 25, 0)).toBe('0 results');
  });
});
