import { api } from '../api/client';
import { buildQuery, type QueryParams } from './pagedQuery';

/**
 * Collects every row matching the filters by walking the server's pages (100 at a time), for exports
 * that must not be limited to what happens to be on screen. Stops at `maxRows` so one click cannot
 * pull an unbounded table into the browser.
 */
export async function fetchAllPages<T>(path: string, filters: QueryParams, maxRows = 5000): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  let page = 1;
  for (;;) {
    const body = await api.get<{ items: T[]; totalPages: number }>(`${path}?${buildQuery({ ...filters, page, pageSize: 100 })}`);
    rows.push(...body.items);
    if (page >= body.totalPages) return { rows, truncated: false };
    if (rows.length >= maxRows) return { rows: rows.slice(0, maxRows), truncated: true };
    page += 1;
  }
}
