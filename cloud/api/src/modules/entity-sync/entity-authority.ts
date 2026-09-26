import type { DeviceType } from '@prisma/client';
import type { SyncableEntityType } from './dto/push-entity-sync.dto';

/**
 * Who may write and who may read each kind of synced record. A device credential proves "some terminal of this restaurant";
 * this table says what THAT KIND of terminal is allowed to do with each record type, so the least-trusted, most exposed
 * terminals (a public kiosk, a kitchen screen) cannot change prices, tax, staff, customers, cash or payment records.
 * The lists match what the apps really push today (POS syncs menu, customers and shifts; Restaurant Admin syncs menu, customers
 * and staff; Captain syncs the floor plan; Kiosk Admin syncs menu, combos, coupons and the floor plan; the Kiosk reports
 * coupon redemptions and guest ratings). A type missing from a table is not writable / not readable by anyone but the two
 * consoles.
 */
const ALL: readonly DeviceType[] = ['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS', 'KIOSK', 'KIOSK_ADMIN'];
const CONSOLES: readonly DeviceType[] = ['POS_ADMIN'];

export const ENTITY_WRITE_AUTHORITY: Record<SyncableEntityType, readonly DeviceType[]> = {
  // The catalogue that prices every sale.
  MENU_ITEM: ['POS', 'POS_ADMIN', 'KIOSK_ADMIN'],
  MENU_CATEGORY: ['POS', 'POS_ADMIN', 'KIOSK_ADMIN'],
  MODIFIER_GROUP: ['POS', 'POS_ADMIN', 'KIOSK_ADMIN'],
  TAX_GROUP: ['POS', 'POS_ADMIN', 'KIOSK_ADMIN'],
  COMBO: ['POS_ADMIN', 'KIOSK_ADMIN'],
  // The kiosk reports how often a coupon was redeemed, so it may write coupons (the value of a coupon is protected below).
  COUPON: ['POS_ADMIN', 'KIOSK_ADMIN', 'KIOSK'],
  DINING_TABLE: ['POS', 'POS_ADMIN', 'CAPTAIN', 'KIOSK_ADMIN'],
  CUSTOMER: ['POS', 'POS_ADMIN'],
  CUSTOMER_FEEDBACK: ['KIOSK', 'KIOSK_ADMIN', 'POS_ADMIN'],
  STAFF_USER: ['POS', 'POS_ADMIN'],
  INVENTORY_ITEM: CONSOLES,
  PAYMENT_TRANSACTION: ['POS', 'POS_ADMIN'],
  SHIFT: ['POS', 'POS_ADMIN'],
  CASH_MOVEMENT: ['POS', 'POS_ADMIN'],
  SERVICE_MESSAGE: ALL
};

/** Types only some devices may even receive (everything else is readable by every terminal of the restaurant). */
export const ENTITY_READ_AUTHORITY: Partial<Record<SyncableEntityType, readonly DeviceType[]>> = {
  CUSTOMER: ['POS', 'POS_ADMIN', 'CAPTAIN'],
  SHIFT: ['POS', 'POS_ADMIN'],
  CASH_MOVEMENT: ['POS', 'POS_ADMIN'],
  PAYMENT_TRANSACTION: ['POS', 'POS_ADMIN'],
  INVENTORY_ITEM: ['POS', 'POS_ADMIN']
};

/** Which staff roles may sign in on which terminal. Mirrors `StaffRepository.TERMINAL_ROLES`; a role not listed is not restricted. */
const TERMINAL_OF_DEVICE: Partial<Record<DeviceType, 'POS' | 'KDS' | 'CAPTAIN' | 'KIOSK'>> = { POS: 'POS', KDS: 'KDS', CAPTAIN: 'CAPTAIN', KIOSK: 'KIOSK' };
const TERMINAL_ROLES: Record<string, ReadonlyArray<'POS' | 'KDS' | 'CAPTAIN' | 'KIOSK'>> = {
  'role-super-admin': ['POS', 'KDS', 'CAPTAIN', 'KIOSK'],
  'role-manager': ['POS', 'KDS', 'CAPTAIN', 'KIOSK'],
  'role-cashier': ['POS', 'KIOSK'],
  'role-captain': ['CAPTAIN'],
  'role-chef': ['KDS']
};
export const MANAGER_ROLES: readonly string[] = ['role-manager', 'role-super-admin'];

export function mayWrite(entityType: SyncableEntityType, deviceType: DeviceType): boolean {
  return (ENTITY_WRITE_AUTHORITY[entityType] ?? CONSOLES).includes(deviceType);
}

export function mayRead(entityType: SyncableEntityType, deviceType: DeviceType): boolean {
  const list = ENTITY_READ_AUTHORITY[entityType];
  return !list || list.includes(deviceType);
}

/**
 * Staff records a terminal receives. Each one carries a PIN hash, and a 4-digit PIN falls to an offline guess in minutes, so a terminal
 * only gets the people who can sign in ON THAT KIND of terminal: a kitchen screen gets chefs and managers, the Captain app gets captains
 * and managers, a public kiosk gets nobody (its manager override is checked by the server, see StaffApprovalService), and the
 * counter and the consoles get everyone. Deleted records (tombstones) are always passed so removals still propagate.
 */
export function staffVisibleTo(deviceType: DeviceType, payload: Record<string, unknown> | null): boolean {
  if (!payload || payload.deleted === true) return true;
  if (deviceType === 'POS' || deviceType === 'POS_ADMIN' || deviceType === 'KIOSK_ADMIN') return true; // sign-in consoles and the counter
  const terminal = TERMINAL_OF_DEVICE[deviceType];
  if (!terminal || terminal === 'KIOSK') return false; // the public kiosk verifies a manager PIN on the server
  const role = typeof payload.roleId === 'string' ? payload.roleId : undefined;
  const allowed = role ? TERMINAL_ROLES[role] : undefined;
  return allowed ? allowed.includes(terminal) : true;
}

/** May this staff role sign in on this kind of terminal? A role not listed is not restricted; consoles and the counter accept everyone. */
export function roleMaySignInOn(roleId: string, deviceType: DeviceType): boolean {
  const terminal = TERMINAL_OF_DEVICE[deviceType];
  if (!terminal) return true;
  const allowed = TERMINAL_ROLES[roleId];
  return allowed ? allowed.includes(terminal) : true;
}
