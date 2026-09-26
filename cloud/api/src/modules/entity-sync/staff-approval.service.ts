import { ForbiddenException, HttpException, Injectable } from '@nestjs/common';
import { pbkdf2Sync, timingSafeEqual } from 'node:crypto';
import { Device } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DbCounters } from '../../common/db-counters';
import { MANAGER_ROLES } from './entity-authority';

const WINDOW_MS = 10 * 60_000;
const MAX_FAILURES_PER_DEVICE = 5;
const MAX_FAILURES_PER_RESTAURANT = 20;

/**
 * A public kiosk asks "is this a manager PIN?" without ever holding a PIN hash. The server checks the PIN against the restaurant's
 * manager records (PBKDF2-SHA256, 100,000 iterations, the format the apps write), refuses after a few wrong tries per terminal and per
 * restaurant, and audits every attempt. Only the current PIN format is accepted: a legacy weak hash must be re-issued first.
 */
@Injectable()
export class StaffApprovalService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly counters: DbCounters) {}

  async verifyManagerPin(device: Device, pin: string): Promise<{ approved: true; staffName: string; roleId: string }> {
    const rid = device.restaurantId;
    const [deviceFails, restaurantFails] = await Promise.all([
      this.counters.count(`mgrpin:d:${device.id}`, WINDOW_MS),
      this.counters.count(`mgrpin:r:${rid}`, WINDOW_MS)
    ]);
    if (deviceFails >= MAX_FAILURES_PER_DEVICE || restaurantFails >= MAX_FAILURES_PER_RESTAURANT) {
      throw new HttpException({ statusCode: 429, code: 'PIN_LOCKED', message: 'Too many wrong PINs. Ask a manager to try again in a few minutes.' }, 429);
    }

    const rows = await this.prisma.runAsTenant(rid, (tx) => tx.syncedEntity.findMany({ where: { restaurantId: rid, entityType: 'STAFF_USER' }, select: { payload: true } }));
    let matched: { fullName: string; roleId: string } | null = null;
    for (const row of rows) {
      const p = row.payload as { deleted?: unknown; isActive?: unknown; roleId?: unknown; pinHash?: unknown; fullName?: unknown } | null;
      if (!p || p.deleted === true || p.isActive === false || typeof p.roleId !== 'string' || !MANAGER_ROLES.includes(p.roleId) || typeof p.pinHash !== 'string') continue;
      if (this.matches(pin, rid, p.pinHash)) matched = { fullName: typeof p.fullName === 'string' ? p.fullName : 'Manager', roleId: p.roleId };
    }

    if (!matched) {
      await Promise.all([this.counters.add(`mgrpin:d:${device.id}`, WINDOW_MS), this.counters.add(`mgrpin:r:${rid}`, WINDOW_MS)]);
      await this.audit.log({ actorType: 'TENANT', actorId: device.id, restaurantId: rid, action: 'MANAGER_PIN_REJECTED', category: 'AUTH', details: { deviceType: device.type } });
      throw new ForbiddenException({ statusCode: 403, code: 'PIN_INVALID', message: 'That PIN is not a manager PIN.' });
    }
    await this.audit.log({ actorType: 'TENANT', actorId: device.id, restaurantId: rid, action: 'MANAGER_PIN_APPROVED', category: 'AUTH', details: { deviceType: device.type, staff: matched.fullName } });
    return { approved: true, staffName: matched.fullName, roleId: matched.roleId };
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
