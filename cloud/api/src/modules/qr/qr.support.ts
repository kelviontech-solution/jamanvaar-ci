import { HttpException, HttpStatus } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

export const QR_APP_CODE = 'QR_ORDERING' as const;

export const QR_STATUS = { ACTIVE: 'ACTIVE', DISABLED: 'DISABLED', REVOKED: 'REVOKED' } as const;
export const QR_MODE = { TABLE_ORDER: 'TABLE_ORDER', MENU_ONLY: 'MENU_ONLY' } as const;

export const QR_EVENT = {
  SCANNED: 'QR_SCANNED',
  MENU_VIEWED: 'QR_MENU_VIEWED',
  CART_CREATED: 'QR_CART_CREATED',
  ORDER_STARTED: 'QR_ORDER_STARTED',
  ORDER_PLACED: 'QR_ORDER_PLACED',
  ORDER_FAILED: 'QR_ORDER_FAILED'
} as const;

export const QR_AUDIT = {
  CREATED: 'QR_CREATED',
  DISABLED: 'QR_DISABLED',
  ENABLED: 'QR_ENABLED',
  REGENERATED: 'QR_REGENERATED',
  REVOKED: 'QR_REVOKED',
  SETTINGS_CHANGED: 'QR_SETTINGS_CHANGED',
  FEATURE_ENABLED: 'QR_FEATURE_ENABLED',
  FEATURE_DISABLED: 'QR_FEATURE_DISABLED'
} as const;

/** Customer-safe wording. Every unavailable state shows the same message: the reason is for the restaurant, not for the public. */
export const QR_UNAVAILABLE_MESSAGE = 'QR Ordering is currently unavailable for this restaurant.';

export type QrUnavailableCode =
  | 'INVALID_QR'
  | 'QR_NOT_FOUND'
  | 'QR_REVOKED'
  | 'QR_DISABLED'
  | 'QR_BRANCH_MISSING'
  | 'RESTAURANT_INACTIVE'
  | 'BRANCH_INACTIVE'
  | 'TABLE_INACTIVE'
  | 'ORDERING_OFF'
  | 'MODE_OFF'
  | 'MENU_NOT_PUBLISHED'
  | 'ENTITLEMENT_REQUIRED';

/**
 * A refusal a guest can see. `code` is machine-readable for the customer app; `message` is always the same safe
 * sentence (a public caller learns nothing about why, only that it is unavailable). Entitlement failures are 403
 * so an API client that bypasses the page still gets an authorization error; an unknown token is 404; every other
 * state is 410 (gone: this code will not work as printed).
 */
export class QrUnavailableException extends HttpException {
  constructor(public readonly code: QrUnavailableCode, status?: number) {
    super(
      { statusCode: status ?? statusFor(code), code, message: code === 'QR_REVOKED' || code === 'QR_DISABLED' ? 'This QR code is no longer valid. Please ask a team member.' : QR_UNAVAILABLE_MESSAGE },
      status ?? statusFor(code)
    );
  }
}

function statusFor(code: QrUnavailableCode): number {
  if (code === 'ENTITLEMENT_REQUIRED') return HttpStatus.FORBIDDEN;
  if (code === 'QR_NOT_FOUND') return HttpStatus.NOT_FOUND;
  if (code === 'INVALID_QR') return HttpStatus.BAD_REQUEST;
  return HttpStatus.GONE;
}

/** 24 random bytes (192 bits) as URL-safe text: unguessable, contains no table number, restaurant or sequence. */
export function newPublicToken(): string {
  return randomBytes(24).toString('base64url');
}

/** Tokens minted before the server took this over have their own shape; both are accepted at resolution. */
export const QR_TOKEN_PATTERN = /^[A-Za-z0-9_-]{10,200}$/;

const PUBLIC_ID_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L: readable at a counter

/**
 * The public reference of a guest's order, e.g. JQ-8F72KX9M4TQ2H6PZV3BN5WCD7Y. 26 random characters (about 128 bits), so it is
 * a real capability: it cannot be guessed and reveals nothing about volume or order. The counter shows the short QR-n number.
 * Earlier orders carry an 8-character reference, which still resolves.
 */
export function newPublicOrderId(): string {
  let out = '';
  const limit = 256 - (256 % PUBLIC_ID_ALPHABET.length); // reject the top values so every character is equally likely
  while (out.length < 26) {
    for (const b of randomBytes(32)) {
      if (b < limit && out.length < 26) out += PUBLIC_ID_ALPHABET[b % PUBLIC_ID_ALPHABET.length];
    }
  }
  return `JQ-${out}`;
}

export const PUBLIC_ORDER_ID_PATTERN = /^JQ-(?:[A-Z2-9]{8}|[A-Z2-9]{26})$/;

/** The customer's four-step view of the canonical order status (there is no separate QR status model). */
export type CustomerOrderStatus = 'RECEIVED' | 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED';

export function customerStatusFor(canonical: string): CustomerOrderStatus {
  switch (canonical) {
    case 'PREPARING':
    case 'CONFIRMED':
    case 'IN_PROGRESS':
      return 'PREPARING';
    case 'READY':
      return 'READY';
    case 'SERVED':
    case 'COMPLETED':
      return 'COMPLETED';
    case 'CANCELLED':
    case 'REFUNDED':
    case 'VOIDED':
      return 'CANCELLED';
    default:
      return 'RECEIVED';
  }
}

/** Midnight (start of today) in a restaurant's own timezone, as a UTC instant. */
export function startOfDayIn(timeZone: string, now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const sinceMidnightMs = ((get('hour') * 60 + get('minute')) * 60 + get('second')) * 1000 + now.getMilliseconds();
  return new Date(now.getTime() - sinceMidnightMs);
}

/** YYYYMMDD in the restaurant's timezone, the business date used for numbering. */
export function businessDateIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now).replace(/-/g, '');
}
