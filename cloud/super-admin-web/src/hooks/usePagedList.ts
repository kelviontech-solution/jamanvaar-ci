import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import { buildQuery, splitEnvelope, type QueryParams } from '../lib/pagedQuery';

/** Waits until `value` has stopped changing, so typing in a search box does not fire a request per key. */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

/**
 * Loads one page of a server-paged list. Changing any filter goes back to page 1; stale responses
 * (a slower earlier request finishing after a newer one) are ignored.
 */
export function usePagedList<T, E = Record<string, never>>(path: string, filters: QueryParams, pageSize = 25, enabled = true) {
  const [page, setPage] = useState(1);
  const [state, setState] = useState<{ items: T[]; total: number; totalPages: number; extra: E | null }>({ items: [], total: 0, totalPages: 1, extra: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const filterKey = buildQuery(filters);
  const lastFilterKey = useRef(filterKey);
  const requestId = useRef(0);

  useEffect(() => {
    if (lastFilterKey.current !== filterKey) {
      lastFilterKey.current = filterKey;
      if (page !== 1) setPage(1);
    }
  }, [filterKey, page]);

  const load = useCallback(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const mine = ++requestId.current;
    setLoading(true);
    setError(null);
    const qs = buildQuery({ ...filters, page, pageSize });
    api
      .get<{ items: T[]; total: number; page: number; pageSize: number; totalPages: number } & Record<string, unknown>>(`${path}?${qs}`)
      .then((body) => {
        if (mine !== requestId.current) return;
        const r = splitEnvelope<T, E>(body);
        setState({ items: r.items, total: r.total, totalPages: r.totalPages, extra: r.extra });
      })
      .catch((err) => {
        if (mine === requestId.current) setError(err instanceof ApiError ? err.message : 'Failed to load');
      })
      .finally(() => {
        if (mine === requestId.current) setLoading(false);
      });
    // filters is represented by filterKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, filterKey, page, pageSize, enabled]);

  useEffect(load, [load]);

  return { ...state, page, setPage, pageSize, loading, error, reload: load };
}
