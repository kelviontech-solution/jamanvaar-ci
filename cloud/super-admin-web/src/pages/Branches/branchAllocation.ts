export type SavedAllocation = {
  appCode: string;
  enabled: boolean;
  deviceQuota: number | null;
  disabledFeatures?: string[];
  effectiveAt: string;
  expiresAt: string | null;
  cancelledAt: string | null;
  revision: number;
};
export function currentAllocation(rows: SavedAllocation[], appCode: string, now = Date.now()) {
  return rows
    .filter((r) => r.appCode === appCode && !r.cancelledAt && Date.parse(r.effectiveAt) <= now)
    .sort((a, b) => Date.parse(b.effectiveAt) - Date.parse(a.effectiveAt) || b.revision - a.revision)[0];
}
export function localDate(value: string | number = Date.now()) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
