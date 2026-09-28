export type ConnectionLevel = 'ok' | 'slow' | 'lost';

/**
 * Whether a screen is still hearing from the server. Screens poll every few seconds, so silence means trouble:
 * fine up to 12 s, slow up to 30 s, lost beyond that or the moment the browser says it is offline.
 */
export function connectionLevel(msSinceContact: number | null, browserOnline: boolean, msSinceStart: number): ConnectionLevel {
  if (!browserOnline) return 'lost';
  if (msSinceContact === null) return msSinceStart < 15000 ? 'ok' : 'lost';
  if (msSinceContact <= 12000) return 'ok';
  if (msSinceContact <= 30000) return 'slow';
  return 'lost';
}
