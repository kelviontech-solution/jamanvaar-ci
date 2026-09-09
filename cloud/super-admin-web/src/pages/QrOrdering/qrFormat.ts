/**
 * Formatting helpers shared by the QR Ordering control pages.
 *
 * Every glyph outside ASCII is declared here as an escape sequence so the source
 * files stay pure ASCII (this repo has previously suffered mojibake damage from
 * a literal rupee sign being re-encoded).
 */
import type { BadgeTone } from '../../components/ui';
import type { RestaurantQrStatus } from '../../api/types';

/** Indian rupee sign. */
export const RUPEE = '\u20B9';
/** Em dash - the canonical "no measurement exists" marker on this page. */
export const EM_DASH = '\u2014';
/** Middle dot separator. */
export const DOT = '\u00B7';

export const NO_USAGE_LABEL = 'No usage reported';
export const NO_USAGE_HINT =
  'Usage figures appear here once this restaurant\'s POS reports QR activity to the platform.';

/** Formats a plain rupee amount (already in rupees, not paise). */
export function formatRupees(amount: number): string {
  if (!Number.isFinite(amount)) return `${RUPEE}0`;
  return `${RUPEE}${Math.round(amount).toLocaleString('en-IN')}`;
}

export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return value.toLocaleString('en-IN');
}

/** Absolute date + time, or an em dash when the timestamp is genuinely absent. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return EM_DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return EM_DASH;
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/** Short relative age ("4m ago"), or an em dash when the timestamp is absent. */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return EM_DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return EM_DASH;
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return formatDateTime(iso);
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDateTime(iso);
}

export const QR_STATUS_LABELS: Record<RestaurantQrStatus, string> = {
  ACTIVE: 'Active',
  DISABLED: 'Disabled',
  LIMIT_REACHED: 'Limit reached',
  NOT_ENTITLED: 'Not entitled'
};

export function qrStatusTone(status: RestaurantQrStatus): BadgeTone {
  switch (status) {
    case 'ACTIVE':
      return 'success';
    case 'DISABLED':
      return 'error';
    case 'LIMIT_REACHED':
      return 'warning';
    default:
      return 'neutral';
  }
}

export const QR_STATUS_DESCRIPTIONS: Record<RestaurantQrStatus, string> = {
  ACTIVE: 'Entitled and serving guest QR scans.',
  DISABLED: 'Entitled, but QR ordering is switched off by the platform or the tenant.',
  LIMIT_REACHED: 'Active table count has reached the quota on this account.',
  NOT_ENTITLED: 'The subscribed plan does not include the QR ordering suite.'
};

/** Turns a SNAKE_CASE audit action into readable words. */
export function humanizeAction(action: string): string {
  return action
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/** Turns a camelCase entitlement key into a readable label. */
export function humanizeKey(key: string): string {
  const spaced = key.replace(/([A-Z])/g, ' $1').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
