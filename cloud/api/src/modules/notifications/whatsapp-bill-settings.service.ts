import { createHash, createHmac } from 'crypto';
import { BadRequestException, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, TenantUserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeIndianMobile } from './receipt-whatsapp.service';

/**
 * The WhatsApp number a restaurant's admin chose to send customers' bills FROM.
 *
 * Stored as one server-side-only SyncedEntity row. 'WHATSAPP_BILL_SETTINGS' is deliberately NOT in
 * SYNCABLE_ENTITY_TYPES, so no device can push or pull it -- it never leaves the cloud, and needs no
 * schema migration. Only the saved number is trusted for sending; the WhatsApp service re-resolves it
 * against the restaurant's own Meta account on every send (see its bill_sender.py).
 */
const ENTITY_TYPE = 'WHATSAPP_BILL_SETTINGS';
const EXTERNAL_ID = 'restaurant';

/** The saved "send bills from" number for a restaurant (10 digits), or null. A plain function so the
 *  bill sender can read it with the PrismaService it already has -- no new module dependency. */
export async function readSavedBillNumber(prisma: PrismaService, restaurantId: string): Promise<string | null> {
  const row = await prisma.runAsTenant(restaurantId, (tx) =>
    tx.syncedEntity.findUnique({ where: { restaurantId_entityType_externalId: { restaurantId, entityType: ENTITY_TYPE, externalId: EXTERNAL_ID } } })
  );
  const number = (row?.payload as { number?: unknown } | null | undefined)?.number;
  return typeof number === 'string' && number ? number : null;
}

export type BillNumberStatus = 'NOT_SET' | 'READY' | 'NOT_FOUND' | 'NO_CREDENTIALS' | 'TOKEN_INVALID' | 'OWNED_BY_OTHER' | 'UNREACHABLE' | 'NOT_CONNECTED' | 'BAD_NUMBER';

export interface WhatsAppBillSettings {
  number: string | null;
  status: BillNumberStatus;
  message: string | null;
  displayNumber: string | null;
  verifiedName: string | null;
  quality: string | null;
  templateStatus: string | null;
  checkedAt: string | null;
}

const EMPTY: WhatsAppBillSettings = {
  number: null, status: 'NOT_SET', message: null, displayNumber: null, verifiedName: null, quality: null, templateStatus: null, checkedAt: null
};

@Injectable()
export class WhatsAppBillSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  /** The saved 10-digit number, or null -- what the bill sender passes along as `fromNumber`. */
  async savedNumber(restaurantId: string): Promise<string | null> {
    return (await this.read(restaurantId)).number;
  }

  async get(restaurantId: string): Promise<WhatsAppBillSettings> {
    return this.read(restaurantId);
  }

  /** Saves the number, then asks the WhatsApp service whether it is a usable sender. The number is
   *  kept even when the check fails, so the admin sees what they typed next to the reason. */
  async save(restaurantId: string, role: TenantUserRole, rawNumber: string): Promise<WhatsAppBillSettings> {
    this.requireManager(role);
    const normalized = normalizeIndianMobile(rawNumber);
    if (!normalized) throw new BadRequestException('Enter a valid 10-digit Indian mobile number');
    const number = normalized;

    const check = await this.callService(restaurantId, '/api/v1/webhooks/jamanvaar/bill-number', { number }).catch((err) => {
      if (err instanceof ServiceUnavailableException) return { ok: false, status: 'UNREACHABLE', message: err.message } as Record<string, unknown>;
      throw err;
    });
    const settings: WhatsAppBillSettings = {
      number,
      status: (check.status as BillNumberStatus) ?? 'UNREACHABLE',
      message: (check.message as string) || null,
      displayNumber: (check.displayNumber as string) ?? null,
      verifiedName: (check.verifiedName as string) ?? null,
      quality: (check.quality as string) ?? null,
      templateStatus: (check.templateStatus as string) ?? null,
      checkedAt: new Date().toISOString()
    };
    await this.write(restaurantId, settings);
    return settings;
  }

  /** Re-checks the saved number (e.g. after the admin finished adding it in Meta). */
  async recheck(restaurantId: string, role: TenantUserRole): Promise<WhatsAppBillSettings> {
    const current = await this.read(restaurantId);
    if (!current.number) throw new BadRequestException('No WhatsApp number is set for bills yet');
    return this.save(restaurantId, role, current.number);
  }

  /** Submits the standard Utility bill template to Meta if it doesn't exist yet. */
  async ensureTemplate(restaurantId: string, role: TenantUserRole): Promise<WhatsAppBillSettings> {
    this.requireManager(role);
    const current = await this.read(restaurantId);
    if (!current.number) throw new BadRequestException('Set the WhatsApp number for bills first');
    const out = await this.callService(restaurantId, '/api/v1/webhooks/jamanvaar/bill-template', {});
    const next = { ...current, templateStatus: (out.templateStatus as string) ?? current.templateStatus, checkedAt: new Date().toISOString() };
    await this.write(restaurantId, next);
    return next;
  }

  async clear(restaurantId: string, role: TenantUserRole): Promise<WhatsAppBillSettings> {
    this.requireManager(role);
    await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.syncedEntity.deleteMany({ where: { restaurantId, entityType: ENTITY_TYPE, externalId: EXTERNAL_ID } })
    );
    return { ...EMPTY };
  }

  // ---------------------------------------------------------------------------------------------

  /** Choosing the sender changes whose name appears on every customer's bill -- owner/manager only. */
  private requireManager(role: TenantUserRole) {
    if (role !== TenantUserRole.OWNER && role !== TenantUserRole.MANAGER) {
      throw new ForbiddenException('Only an owner or manager can change the WhatsApp number used for bills');
    }
  }

  private async read(restaurantId: string): Promise<WhatsAppBillSettings> {
    const row = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.syncedEntity.findUnique({ where: { restaurantId_entityType_externalId: { restaurantId, entityType: ENTITY_TYPE, externalId: EXTERNAL_ID } } })
    );
    return row ? { ...EMPTY, ...(row.payload as unknown as Partial<WhatsAppBillSettings>) } : { ...EMPTY };
  }

  private async write(restaurantId: string, settings: WhatsAppBillSettings): Promise<void> {
    const payload = settings as unknown as Prisma.InputJsonValue;
    await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.syncedEntity.upsert({
        where: { restaurantId_entityType_externalId: { restaurantId, entityType: ENTITY_TYPE, externalId: EXTERNAL_ID } },
        create: { restaurantId, entityType: ENTITY_TYPE, externalId: EXTERNAL_ID, payload },
        update: { payload }
      })
    );
  }

  private async callService(restaurantId: string, path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const baseUrl = this.config.get<string>('WHATSAPP_CONNECTOR_BASE_URL');
    const secret = this.config.get<string>('JAMANVAAR_SERVICE_SECRET');
    if (!baseUrl || !secret) throw new ServiceUnavailableException('WhatsApp billing is not configured on this server');

    const rawBody = JSON.stringify({ restaurantId, ...body });
    const timestamp = String(Date.now());
    const bodyHash = createHash('sha256').update(rawBody).digest('hex');
    const signature = createHmac('sha256', secret).update(`POST\n${path}\n${timestamp}\n${bodyHash}`).digest('hex');
    let res: Response;
    try {
      res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Signature': signature, 'X-Timestamp': timestamp },
        body: rawBody,
        signal: AbortSignal.timeout(20_000)
      });
    } catch {
      throw new ServiceUnavailableException('Could not reach the WhatsApp service — try again in a moment');
    }
    if (!res.ok) throw new ServiceUnavailableException(`WhatsApp service refused the request (${res.status})`);
    return ((await res.json().catch(() => null)) as Record<string, unknown> | null) ?? {};
  }
}
