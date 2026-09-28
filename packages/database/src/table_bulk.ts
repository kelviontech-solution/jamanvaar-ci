export interface BulkTablePlan {
  /** Table numbers to create, in order. */
  create: string[];
  /** Numbers that already exist (nothing is created for them). */
  skipped: string[];
  /** Why nothing can be planned, in words for the person at the screen. */
  error?: string;
}

/**
 * Plans "add several tables at once": `first`, `first + 1` ... for `count` tables, each with an optional `prefix` ("T" gives T1, T2).
 * Numbers that already exist are skipped rather than failing the whole batch, and the caller says how many were skipped.
 */
export function planBulkTables(first: string, count: number, prefix: string, isTaken: (tableNumber: string) => boolean): BulkTablePlan {
  const start = Number.parseInt(first.trim(), 10);
  if (!Number.isFinite(start) || start < 0 || !/^\d+$/.test(first.trim())) return { create: [], skipped: [], error: 'Enter the first table number as a whole number, for example 1.' };
  if (!Number.isInteger(count) || count < 1) return { create: [], skipped: [], error: 'Enter how many tables to add, from 1 to 50.' };
  if (count > 50) return { create: [], skipped: [], error: 'Add up to 50 tables at a time.' };
  const cleanPrefix = prefix.trim();
  if (/[<>]/.test(cleanPrefix) || cleanPrefix.length > 6) return { create: [], skipped: [], error: 'The prefix can be up to 6 letters and cannot contain < or >.' };

  const create: string[] = [];
  const skipped: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const number = `${cleanPrefix}${start + i}`;
    (isTaken(number) ? skipped : create).push(number);
  }
  if (create.length === 0) return { create, skipped, error: 'All of those table numbers already exist. Choose a different starting number.' };
  return { create, skipped };
}
