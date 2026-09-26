import type { TableStatus } from '@jamanvaar/types';

/**
 * Which table state may follow which. Setting a state the table cannot legally move to is refused instead of silently
 * overwriting a live one (a table that is BLOCKED must be unblocked first; a table with guests cannot be marked free
 * without going through billing or cleaning). Same-state writes are always fine.
 */
const NEXT: Record<TableStatus, TableStatus[]> = {
  AVAILABLE: ['OCCUPIED', 'RESERVED', 'CLEANING', 'BLOCKED'],
  RESERVED: ['AVAILABLE', 'OCCUPIED', 'BLOCKED'],
  OCCUPIED: ['BILL_REQUESTED', 'BILLING', 'CLEANING', 'AVAILABLE'],
  BILL_REQUESTED: ['OCCUPIED', 'BILLING', 'CLEANING', 'AVAILABLE'],
  BILLING: ['OCCUPIED', 'BILL_REQUESTED', 'CLEANING', 'AVAILABLE'],
  CLEANING: ['AVAILABLE', 'BLOCKED'],
  BLOCKED: ['AVAILABLE']
};

export function canMoveTable(from: TableStatus, to: TableStatus): boolean {
  return from === to || (NEXT[from] ?? []).includes(to);
}

export function allowedNextTableStates(from: TableStatus): TableStatus[] {
  return [from, ...(NEXT[from] ?? [])];
}
