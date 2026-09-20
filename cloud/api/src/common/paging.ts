export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export type Paging =
  | { paged: false }
  | { paged: true; page: number; pageSize: number; skip: number; take: number };

const toInt = (v: unknown): number | undefined => {
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Server-side paging for platform lists. A request without `page` is not paged, so callers that
 * still expect the plain array keep working; `page` opts in to the `{ items, total, ... }` envelope.
 * Bad values are clamped rather than rejected: a hand-edited URL should still show a page.
 */
export function parsePaging(query: { page?: unknown; pageSize?: unknown }): Paging {
  if (query.page === undefined || query.page === '') return { paged: false };
  const page = Math.max(1, toInt(query.page) ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, toInt(query.pageSize) ?? DEFAULT_PAGE_SIZE));
  return { paged: true, page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function pageOf<T>(items: T[], total: number, p: { page: number; pageSize: number }) {
  return { items, total, page: p.page, pageSize: p.pageSize, totalPages: Math.max(1, Math.ceil(total / p.pageSize)) };
}
