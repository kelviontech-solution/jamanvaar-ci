import { describe, it, expect } from 'vitest';
import { parsePaging, pageOf } from './paging';

/**
 * BUG-047/051/060/067: platform lists returned every row of every tenant in one response and the
 * browser filtered and counted them. Lists now page on the server; without a `page` parameter they
 * keep returning the plain array so existing callers are unaffected.
 */
describe('parsePaging', () => {
  it('is not paged when no page is requested', () => {
    expect(parsePaging({})).toMatchObject({ paged: false });
  });

  it('parses page and pageSize, and derives skip/take', () => {
    expect(parsePaging({ page: '3', pageSize: '25' })).toEqual({ paged: true, page: 3, pageSize: 25, skip: 50, take: 25 });
  });

  it('defaults the page size, and clamps nonsense instead of failing', () => {
    expect(parsePaging({ page: '1' })).toMatchObject({ pageSize: 25 });
    expect(parsePaging({ page: '0' })).toMatchObject({ page: 1, skip: 0 });
    expect(parsePaging({ page: '-4', pageSize: '100000' })).toMatchObject({ page: 1, pageSize: 100 });
    expect(parsePaging({ page: 'abc', pageSize: 'x' })).toMatchObject({ paged: true, page: 1, pageSize: 25 });
  });
});

describe('pageOf', () => {
  it('wraps rows with the total and the page count', () => {
    expect(pageOf(['a', 'b'], 51, { page: 2, pageSize: 25 })).toEqual({ items: ['a', 'b'], total: 51, page: 2, pageSize: 25, totalPages: 3 });
  });

  it('reports at least one page when empty', () => {
    expect(pageOf([], 0, { page: 1, pageSize: 25 }).totalPages).toBe(1);
  });
});
