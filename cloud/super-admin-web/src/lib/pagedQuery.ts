/**
 * Query-string building for server-paged lists (BUG-047/051/060/067). Kept free of React and of the
 * shared-package barrels so it can be unit-tested and reused by every list page.
 */
export type QueryParams = Record<string, string | number | boolean | null | undefined>;

/** Empty, null, undefined and the "ALL" sentinel used by filter dropdowns are left out entirely. */
export function buildQuery(params: QueryParams): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text === '' || text === 'ALL') continue;
    usp.set(key, text);
  }
  return usp.toString();
}

export interface PagedResponse<T, E = Record<string, never>> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  extra: E;
}

/** Splits the server envelope into the list part and whatever extra summary fields it carried (counts...). */
export function splitEnvelope<T, E>(body: { items: T[]; total: number; page: number; pageSize: number; totalPages: number } & Record<string, unknown>): PagedResponse<T, E> {
  const { items, total, page, pageSize, totalPages, ...extra } = body;
  return { items, total, page, pageSize, totalPages, extra: extra as E };
}

/** "1-25 of 130", or "0 results". */
export function rangeLabel(page: number, pageSize: number, total: number): string {
  if (total === 0) return '0 results';
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return `${from}-${to} of ${total}`;
}
