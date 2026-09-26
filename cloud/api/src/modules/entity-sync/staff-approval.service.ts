import { ForbiddenException, HttpException, Injectable } from '@nestjs/common';
import { pbkdf2Sync, timingSafeEqual } from 'node:crypto';
import { Device } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DbCounters } from '../../common/db-counters';
import { MANAGER_ROLES, roleMaySignInOn } from './entity-authority';
import { StaffSessionService } from './staff-session.service';

const WINDOW_MS = 10 * 60_000;
const MAX_FAILURES_PER_DEVICE = 5;
const MAX_FAILURES_PER_RESTAURANT = 20;

interface FoundStaff { id: string; fullName: string; roleId: string }

/**
 * The server is the judge of a PIN. A public kiosk holds no PIN hashes, and a POS or Captain terminal proves WHO is signed in by
 * getting a signed session from here. The PIN is checked against the restaurant's staff records (PBKDF2-SHA256, 100,000 iterations,
 * the format the apps write), refused after a few wrong tries per terminal and per restaurant, and every attempt is audited. Only the
 * current PIN format is accepted: a legacy weak hash must be re-issued first.
 */
@Injectable()
export class StaffApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly counters: DbCounters,
    private readonly sessions: StaffSessionService
  ) {}

  /** Refuses a terminal or restaurant that has guessed wrong too often. */
  private async assertNotLocked(device: Device): Promise<void> {
    const [deviceFails, restaurantFails] = await Promise.all([
      this.counters.count(`mgrpin:d:${device.id}`, WINDOW_MS),
      this.counters.count(`mgrpin:r:${device.restaurantId}`, WINDOW_MS)
    ]);
    if (deviceFails >= MAX_FAILURES_PER_DEVICE || restaurantFails >= MAX_FAILURES_PER_RESTAURANT) {
      throw new HttpException({ statusCode: 429, code: 'PIN_LOCKED', message: 'Too many wrong PINs. Ask a manager to try again in a few minutes.' }, 429);
    }
  }

  private async findStaff(device: Device, pin: string, accept: (roleId: string) => boolean): Promise<FoundStaff | null> {
    const rid = device.restaurantId;
    const rows = await this.prisma.runAsTenant(rid, (tx) => tx.syncedEntity.findMany({ where: { restaurantId: rid, entityType: 'STAFF_USER' }, select: { externalId: true, payload: true } }));
    let matched: FoundStaff | null = null;
    for (const row of rows) {
      const p = row.payload as { deleted?: unknown; isActive?: unknown; roleId?: unknown; pinHash?: unknown; fullName?: unknown; id?: unknown; pinScope?: unknown } | null;
      if (!p || p.deleted === true || p.isActive === false || typeof p.roleId !== 'string' || !accept(p.roleId) || typeof p.pinHash !== 'string') continue;
      // The PIN was hashed under the restaurant id the console had at the time: normally the real one, but staff made before the console was
      // bound to its restaurant carry `pinScope` (or the built-in placeholder id).
      const scopes = [...new Set([rid, typeof p.pinScope === 'string' ? p.pinScope : '', 'rest-jamanvaar-main'].filter(Boolean))];
      if (scopes.some((scope) => this.matches(pin, scope, p.pinHash as string))) matched = { id: typeof p.id === 'string' ? p.id : row.externalId, fullName: typeof p.fullName === 'string' ? p.fullName : 'Staff', roleId: p.roleId };
    }
    return matched;
  }

  private async reject(device: Device, action: string): Promise<never> {
    await Promise.all([this.counters.add(`mgrpin:d:${device.id}`, WINDOW_MS), this.counters.add(`mgrpin:r:${device.restaurantId}`, WINDOW_MS)]);
    await this.audit.log({ actorType: 'TENANT', actorId: device.id, restaurantId: device.restaurantId, action, category: 'AUTH', details: { deviceType: device.type } });
    throw new ForbiddenException({ statusCode: 403, code: 'PIN_INVALID', message: 'That PIN was not accepted.' });
  }

  /** Is this a manager PIN? Also returns a short approval token the terminal stamps onto the sensitive action it just unlocked. */
  async verifyManagerPin(device: Device, pin: string): Promise<{ approved: true; staffName: string; roleId: string; approvalToken: string; approvalExpiresAt: string }> {
    await this.assertNotLocked(device);
    const staff = await this.findStaff(device, pin, (r) => MANAGER_ROLES.includes(r));
    if (!staff) return this.reject(device, 'MANAGER_PIN_REJECTED');
    await this.audit.log({ actorType: 'TENANT', actorId: device.id, restaurantId: device.restaurantId, action: 'MANAGER_PIN_APPROVED', category: 'AUTH', details: { deviceType: device.type, staff: staff.fullName } });
    const t = this.sessions.issue('approval', { restaurantId: device.restaurantId, deviceId: device.id, staffId: staff.id, role: staff.roleId, name: staff.fullName });
    return { approved: true, staffName: staff.fullName, roleId: staff.roleId, approvalToken: t.token, approvalExpiresAt: t.expiresAt };
  }

  /** A staff member signs in on a terminal: the server checks the PIN and that the role may use this kind of terminal, then issues the session. */
  async signIn(device: Device, pin: string): Promise<{ staffId: string; staffName: string; roleId: string; sessionToken: string; expiresAt: string }> {
    await this.assertNotLocked(device);
    const staff = await this.findStaff(device, pin, (r) => roleMaySignInOn(r, device.type));
    if (!staff) return this.reject(device, 'STAFF_SIGNIN_REJECTED');
    await this.audit.log({ actorType: 'TENANT', actorId: device.id, restaurantId: device.restaurantId, action: 'STAFF_SIGNIN', category: 'AUTH', details: { deviceType: device.type, staff: staff.fullName, role: staff.roleId } });
    const t = this.sessions.issue('session', { restaurantId: device.restaurantId, deviceId: device.id, staffId: staff.id, role: staff.roleId, name: staff.fullName });
    return { staffId: staff.id, staffName: staff.fullName, roleId: staff.roleId, sessionToken: t.token, expiresAt: t.expiresAt };
  }

  private matches(pin: string, restaurantId: string, stored: string): boolean {
    if (!stored.startsWith('pinv2:')) return false;
    const [saltHex, hashHex] = stored.slice('pinv2:'.length).split(':');
    if (!saltHex || !hashHex || !/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(hashHex)) return false;
    const derived = pbkdf2Sync(`${restaurantId}:${pin}`, Buffer.from(saltHex, 'hex'), 100_000, 32, 'sha256');
    const expected = Buffer.from(hashHex, 'hex');
    return expected.length === derived.length && timingSafeEqual(expected, derived);
  }
}
