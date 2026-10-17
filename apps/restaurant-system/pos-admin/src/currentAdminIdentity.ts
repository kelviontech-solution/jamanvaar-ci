import { SessionPersistence } from '@jamanvaar/business';

/**
 * R11: audit log entries across this app (loyalty awards, price changes, restores, status
 * changes...) used to hardcode username: 'Manager' regardless of who was actually signed in —
 * the real name was sitting unused in the 'admin' session SessionPersistence.save() writes on
 * login (App.tsx's completeLogin). 'Manager' is now only the fallback for the rare case where
 * no session is found (e.g. a call that races the very first render before login settles).
 */
export function getCurrentAdminName(): string {
  return SessionPersistence.load('admin')?.fullName || 'Manager';
}
