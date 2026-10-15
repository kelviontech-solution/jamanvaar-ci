/** PostgreSQL JSONB reorders object keys. Compare meaning, not property insertion order. */
export function stableJson(value: unknown): string | undefined {
  const normalize = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(normalize)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, child]) => [k, normalize(child)]),
          )
        : v;
  return JSON.stringify(normalize(value));
}
