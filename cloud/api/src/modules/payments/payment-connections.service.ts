import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformUser, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MIN_COMMISSION_BPS, DEFAULT_COMMISSION_BPS, getDefaultCommissionBps } from './commission.util';
import { encryptCredential, decryptCredential } from '../../common/security/credential-encryption.util';
import { requireStepUpPassword } from '../../common/security/step-up.util';
import { SubmitPaymentConnectionDto, SettlementBankDetailsDto } from './dto/payment-connection.dto';
import { lockSettlement } from './settlement-lock.util';

const RESUBMITTABLE_STATUSES = ['NOT_CONNECTED', 'PENDING_VERIFICATION', 'DISCONNECTED'];

function maskLast4(value: string | null | undefined): string | null {
  if (!value) return null;
  return `•••• ${value.slice(-4)}`;
}

@Injectable()
export class PaymentConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService
  ) {}

  private encryptionKey(): string {
    const key = this.config.get<string>('PAYMENT_CREDENTIAL_ENCRYPTION_KEY');
    if (!key) {
      throw new ServiceUnavailableException('PAYMENT_CREDENTIAL_ENCRYPTION_KEY is not configured on this server');
    }
    return key;
  }

  private async lockConnection(tx: Prisma.TransactionClient, restaurantId: string): Promise<void> {
    await lockSettlement(tx, restaurantId);
  }

  async requestPlatformPayments(restaurantId: string, actorId: string) {
    await this.prisma.runAsTenant(restaurantId, async (tx) => {
      await this.lockConnection(tx, restaurantId);
      const connection = await tx.restaurantPaymentConnection.findUnique({ where: { restaurantId } });
      if (connection && !['NOT_CONNECTED', 'DISCONNECTED'].includes(connection.status)) return;
      await tx.restaurantPaymentConnection.upsert({ where: { restaurantId },
        create: { restaurantId, status: 'PENDING_VERIFICATION' }, update: { status: 'PENDING_VERIFICATION' } });
      await this.audit.log({ actorType: 'TENANT', actorId, restaurantId, action: 'PLATFORM_COLLECTION_REQUESTED', category: 'PAYMENTS', details: {} }, tx);
    });
    return this.getOwn(restaurantId);
  }

  async setSettlementPreference(restaurantId: string, requested: boolean, actorId: string) {
    await this.prisma.runAsTenant(restaurantId, async (tx) => {
      await this.lockConnection(tx, restaurantId);
      const connection = await tx.restaurantPaymentConnection.findUnique({ where: { restaurantId } });
      if (requested && (!connection?.settlementAccountNumberEncrypted || !connection.settlementAccountName || !connection.settlementIfsc)) {
        throw new BadRequestException('Save your bank account details before requesting direct settlement');
      }
      await tx.restaurantPaymentConnection.upsert({ where: { restaurantId },
        create: { restaurantId, directSettlementRequested: requested }, update: { directSettlementRequested: requested } });
      await this.audit.log({ actorType: 'TENANT', actorId, restaurantId, action: 'SETTLEMENT_PREFERENCE_CHANGED', category: 'PAYMENTS', details: { directSettlementRequested: requested, effectivePayoutMode: 'MANUAL' } }, tx);
    });
    return this.getOwn(restaurantId);
  }

  async setBankDetails(restaurantId: string, bank: SettlementBankDetailsDto, actorId: string) {
    const encrypted = encryptCredential(bank.settlementAccountNumber, this.encryptionKey());
    await this.prisma.runAsTenant(restaurantId, async (tx) => {
      await this.lockConnection(tx, restaurantId);
      const unpaidBatch = await tx.restaurantPayout.count({ where: { restaurantId, status: { not: 'PAID' } } });
      if (unpaidBatch) throw new ConflictException('An unpaid payout batch exists. Contact Super Admin before changing the payout bank account.');
      const data = { settlementAccountName: bank.settlementAccountName, settlementAccountNumberEncrypted: encrypted,
        settlementBankName: bank.settlementBankName, settlementBankAccountType: bank.settlementBankAccountType,
        settlementIfsc: bank.settlementIfsc, settlementUpiVpa: null, bankVerificationStatus: 'PENDING' as const,
        bankVerifiedAt: null, bankVerifiedByPlatformUserId: null };
      await tx.restaurantPaymentConnection.upsert({ where: { restaurantId }, create: { restaurantId, ...data }, update: data });
      await this.audit.log({ actorType: 'TENANT', actorId, restaurantId, action: 'SETTLEMENT_BANK_SUBMITTED', category: 'PAYMENTS', details: { bankVerificationStatus: 'PENDING' } }, tx);
    });
    return this.getOwn(restaurantId);
  }

  async submit(restaurantId: string, dto: SubmitPaymentConnectionDto) {
    const defaultBps = await getDefaultCommissionBps(this.prisma);
    return this.prisma.runAsTenant(restaurantId, async (tx) => {
      await this.lockConnection(tx, restaurantId);
      const unpaidBatch = await tx.restaurantPayout.count({ where: { restaurantId, status: { not: 'PAID' } } });
      if (unpaidBatch) throw new ConflictException('An unpaid payout batch exists. Contact Super Admin before changing the payout bank account.');
      const existing = await tx.restaurantPaymentConnection.findUnique({ where: { restaurantId } });
      if (existing && !RESUBMITTABLE_STATUSES.includes(existing.status)) {
        throw new ForbiddenException(
          `Cannot resubmit while the connection is ${existing.status} — contact Super Admin to disconnect first.`
        );
      }

      const data = {
        accountType: dto.accountType,
        businessType: dto.businessType ?? null,
        pan: dto.pan,
        // security-audit MED-01: gst/cin/uidai are optional in the DTO, and the API now
        // returns them masked (not the real value) for the resubmit form to pre-fill
        // from — an omitted field on resubmit must therefore keep whatever real value
        // is already on file, not silently null it out. `pan`/`contactName`/etc. stay
        // full-replace: they are required by the DTO, so they're always re-supplied.
        gst: dto.gst ?? existing?.gst ?? null,
        cin: dto.cin ?? existing?.cin ?? null,
        uidai: dto.uidai ?? existing?.uidai ?? null,
        contactName: dto.contactName,
        contactEmail: dto.contactEmail,
        contactPhone: dto.contactPhone,
        settlementAccountName: dto.settlementAccountName ?? null,
        settlementAccountNumberEncrypted: dto.settlementAccountNumber
          ? encryptCredential(dto.settlementAccountNumber, this.encryptionKey())
          : null,
        settlementIfsc: dto.settlementIfsc ?? null,
        settlementUpiVpa: dto.settlementUpiVpa ?? null,
        // Legacy clients cannot supply this metadata; don't retain a previous bank's name/type.
        settlementBankName: null,
        settlementBankAccountType: null,
        // Settle to the restaurant's own bank account by default; the owner can switch it off in Settings.
        directSettlementRequested: Boolean(dto.settlementAccountNumber),
        // A resubmission is by definition not yet verified — clear the old
        // timestamp so a pending-re-review connection can't read as verified.
        verifiedAt: null,
        bankVerificationStatus: 'PENDING' as const,
        bankVerifiedAt: null,
        bankVerifiedByPlatformUserId: null,
        status: 'PENDING_VERIFICATION' as const
      };

      const connection = await tx.restaurantPaymentConnection.upsert({
        where: { restaurantId },
        create: { restaurantId, ...data },
        update: data
      });

      await this.audit.log(
        {
          actorType: 'TENANT',
          restaurantId,
          action: 'PAYMENT_CONNECTION_SUBMITTED',
          category: 'PAYMENTS',
          details: { connectionId: connection.id }
        },
        tx
      );

      return this.toOwnView(connection, defaultBps);
    });
  }

  async getOwn(restaurantId: string) {
    const [connection, defaultBps] = await Promise.all([this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.restaurantPaymentConnection.findUnique({ where: { restaurantId } })
    ), getDefaultCommissionBps(this.prisma)]);
    if (!connection) return { status: 'NOT_CONNECTED' as const, directSettlementRequested: false, collectionAccount: 'JAMANVAAR', payoutMode: 'MANUAL', routeStatus: 'PENDING', bankVerificationStatus: 'NOT_ADDED', effectiveCommissionBps: defaultBps };
    return this.toOwnView(connection, defaultBps);
  }

  private toOwnView(connection: {
    status: string;
    accountType: string | null;
    businessType: string | null;
    pan: string | null;
    gst: string | null;
    cin: string | null;
    uidai: string | null;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    settlementAccountName: string | null;
    settlementIfsc: string | null;
    settlementUpiVpa: string | null;
    verifiedAt: Date | null;
    directSettlementRequested: boolean;
    settlementAccountNumberEncrypted: string | null;
    settlementBankName: string | null;
    settlementBankAccountType: string | null;
    bankVerificationStatus: string;
    commissionOverrideBps: number | null;
  }, defaultBps = DEFAULT_COMMISSION_BPS) {
    // Deliberately never includes the settlement account number, even
    // decrypted for its own owner — once encrypted at submission time, the
    // plaintext is never sent back over the wire again.
    //
    // security-audit MED-01: pan/gst/cin/uidai (Aadhaar) used to be returned in full,
    // in plaintext, to OWNER/MANAGER — the same roles that can legitimately view this
    // screen, but Aadhaar in particular is government-ID material that has no reason to
    // round-trip over the wire again once submitted. Masked the same way the platform
    // (Super Admin) view of this data already was. The client no longer pre-fills its
    // edit form from these fields (see kiosk-admin's cloudClient.ts consumer) — a
    // resubmission requires re-entering the real value, the same convention used for a
    // password or CVV field.
    return {
      directSettlementRequested: connection.directSettlementRequested,
      collectionAccount: 'JAMANVAAR',
      payoutMode: 'MANUAL',
      routeStatus: 'PENDING',
      effectiveCommissionBps: connection.commissionOverrideBps ?? defaultBps,
      bankVerificationStatus: connection.bankVerificationStatus,
      settlementBankName: connection.settlementBankName,
      settlementBankAccountType: connection.settlementBankAccountType,
      settlementAccountNumberMasked: connection.settlementAccountNumberEncrypted ? this.bankMask(connection.settlementAccountNumberEncrypted) : null,
      status: connection.status,
      accountType: connection.accountType,
      businessType: connection.businessType,
      pan: maskLast4(connection.pan),
      gst: maskLast4(connection.gst),
      cin: maskLast4(connection.cin),
      uidai: maskLast4(connection.uidai),
      contactName: connection.contactName,
      contactEmail: connection.contactEmail,
      contactPhone: connection.contactPhone,
      settlementAccountName: connection.settlementAccountName,
      settlementIfsc: connection.settlementIfsc,
      settlementUpiVpa: connection.settlementUpiVpa,
      verifiedAt: connection.verifiedAt
    };
  }

  private bankMask(encrypted: string): string {
    try { return maskLast4(decryptCredential(encrypted, this.encryptionKey()))!; }
    catch { return '**** (unavailable)'; }
  }

  async listForPlatform() {
    return this.prisma.runAsPlatform(async (tx) => {
      const connections = await tx.restaurantPaymentConnection.findMany({
        include: { restaurant: { select: { id: true, name: true } } },
        orderBy: { updatedAt: 'desc' }
      });
      return connections.map((c) => this.toPlatformView(c));
    });
  }

  async getForPlatform(restaurantId: string) {
    const connection = await this.prisma.runAsPlatform((tx) =>
      tx.restaurantPaymentConnection.findUnique({
        where: { restaurantId },
        include: { restaurant: { select: { id: true, name: true } } }
      })
    );
    if (!connection) throw new NotFoundException('No payment connection for this restaurant');
    return this.toPlatformView(connection);
  }

  /**
   * Activation while Razorpay Route is pending: online payments switch on today, collected into the platform's
   * account and tracked per-restaurant exactly as before (PaymentTransaction.platformAmount/restaurantAmount).
   * The restaurant's share reaches it through the temporary manual payout path (RestaurantPayoutsService) instead
   * of an automatic Route transfer — see that service's own doc comment for the full design. Submitting bank
   * details here is what makes a restaurant eligible for that path once a Super Admin verifies them
   * (bankVerificationStatus); approval itself does not require them yet.
   */
  async approve(restaurantId: string, actor: PlatformUser, password?: string) {
    await requireStepUpPassword(actor, password);
    return this.prisma.runAsPlatform(async (tx) => {
      await this.lockConnection(tx, restaurantId);
      const connection = await tx.restaurantPaymentConnection.findUnique({ where: { restaurantId } });
      if (!connection) throw new NotFoundException('No payment connection for this restaurant');
      if (connection.status !== 'PENDING_VERIFICATION') {
        throw new ForbiddenException(`Cannot approve from status ${connection.status}`);
      }
      const updated = await tx.restaurantPaymentConnection.update({ where: { restaurantId }, data: { status: 'ACTIVE', verifiedAt: new Date() } });
      await this.audit.log({ actorType: 'PLATFORM', actorId: actor.id, restaurantId, action: 'PAYMENT_CONNECTION_APPROVED', category: 'PAYMENTS', details: {} }, tx);
      return { status: updated.status };
    });
  }

  private async transitionStatus(restaurantId: string, actor: PlatformUser, allowedFrom: string[], to: string, auditAction: string) {
    return this.prisma.runAsPlatform(async (tx) => {
      await this.lockConnection(tx, restaurantId);
      const connection = await tx.restaurantPaymentConnection.findUnique({ where: { restaurantId } });
      if (!connection) throw new NotFoundException('No payment connection for this restaurant');
      if (!allowedFrom.includes(connection.status)) {
        throw new ForbiddenException(`Cannot transition from ${connection.status} to ${to}`);
      }
      const updated = await tx.restaurantPaymentConnection.update({
        where: { restaurantId },
        data: { status: to as 'NOT_CONNECTED' | 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'DISCONNECTED' }
      });
      await this.audit.log({ actorType: 'PLATFORM', actorId: actor.id, restaurantId, action: auditAction, category: 'PAYMENTS', details: {} }, tx);
      return { status: updated.status };
    });
  }

  async suspend(restaurantId: string, actor: PlatformUser, password?: string) {
    await requireStepUpPassword(actor, password);
    return this.transitionStatus(restaurantId, actor, ['ACTIVE'], 'SUSPENDED', 'PAYMENT_CONNECTION_SUSPENDED');
  }

  async reactivate(restaurantId: string, actor: PlatformUser) {
    return this.transitionStatus(restaurantId, actor, ['SUSPENDED'], 'ACTIVE', 'PAYMENT_CONNECTION_REACTIVATED');
  }

  async disconnect(restaurantId: string, actor: PlatformUser, password?: string) {
    await requireStepUpPassword(actor, password);
    return this.transitionStatus(restaurantId, actor, ['ACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION'], 'DISCONNECTED', 'PAYMENT_CONNECTION_DISCONNECTED');
  }

  async setCommissionOverride(restaurantId: string, overrideBps: number | null, actor: PlatformUser, password?: string) {
    if (overrideBps !== null && (!Number.isInteger(overrideBps) || overrideBps < 0 || overrideBps > 10000)) {
      throw new BadRequestException('overrideBps must be null or an integer between 0 and 10000');
    }
    await requireStepUpPassword(actor, password);
    if (overrideBps !== null && overrideBps < MIN_COMMISSION_BPS) throw new BadRequestException("The commission must be at least 2%, because Razorpay's 2% fee is paid out of it.");
    return this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.restaurantPaymentConnection.findUnique({ where: { restaurantId } });
      if (!existing) throw new NotFoundException('No payment connection for this restaurant');
      const updated = await tx.restaurantPaymentConnection.update({ where: { restaurantId }, data: { commissionOverrideBps: overrideBps } });
      await this.audit.log(
        {
          actorType: 'PLATFORM',
          actorId: actor.id,
          restaurantId,
          action: 'COMMISSION_CHANGED',
          category: 'PAYMENTS',
          details: { scope: 'RESTAURANT_OVERRIDE', oldBps: existing.commissionOverrideBps, newBps: overrideBps }
        },
        tx
      );
      return { commissionOverrideBps: updated.commissionOverrideBps };
    });
  }

  private toPlatformView(connection: {
    id: string;
    restaurantId: string;
    restaurant: { id: string; name: string };
    status: string;
    accountType: string | null;
    businessType: string | null;
    pan: string | null;
    gst: string | null;
    cin: string | null;
    uidai: string | null;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    settlementAccountName: string | null;
    settlementAccountNumberEncrypted: string | null;
    settlementIfsc: string | null;
    settlementUpiVpa: string | null;
    verifiedAt: Date | null;
    lastWebhookAt: Date | null;
    lastPaymentAt: Date | null;
    commissionOverrideBps: number | null;
    directSettlementRequested: boolean;
    settlementBankName: string | null;
    settlementBankAccountType: string | null;
    bankVerificationStatus: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    let settlementAccountNumberMasked: string | null = null;
    if (connection.settlementAccountNumberEncrypted) {
      try {
        settlementAccountNumberMasked = maskLast4(decryptCredential(connection.settlementAccountNumberEncrypted, this.encryptionKey()));
      } catch {
        // Encryption key unset/rotated, or corrupt data — degrade gracefully
        // rather than break the whole list for every restaurant.
        settlementAccountNumberMasked = '•••• (unavailable)';
      }
    }

    return {
      id: connection.id,
      restaurantId: connection.restaurantId,
      restaurant: connection.restaurant,
      status: connection.status,
      accountType: connection.accountType,
      businessType: connection.businessType,
      panMasked: maskLast4(connection.pan),
      gstMasked: maskLast4(connection.gst),
      cinMasked: maskLast4(connection.cin),
      uidaiMasked: maskLast4(connection.uidai),
      contactName: connection.contactName,
      contactEmail: connection.contactEmail,
      contactPhone: connection.contactPhone,
      settlementAccountName: connection.settlementAccountName,
      settlementAccountNumberMasked,
      settlementIfsc: connection.settlementIfsc,
      // A UPI VPA is a complete, valid settlement destination — masked here
      // for the same reason as the bank account number and the KYC ids.
      settlementUpiVpaMasked: maskLast4(connection.settlementUpiVpa),
      commissionOverrideBps: connection.commissionOverrideBps,
      bankVerificationStatus: connection.bankVerificationStatus,
      directSettlementRequested: connection.directSettlementRequested,
      collectionAccount: 'JAMANVAAR', payoutMode: 'MANUAL', routeStatus: 'PENDING',
      settlementBankName: connection.settlementBankName,
      settlementBankAccountType: connection.settlementBankAccountType,
      verifiedAt: connection.verifiedAt,
      lastWebhookAt: connection.lastWebhookAt,
      lastPaymentAt: connection.lastPaymentAt,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt
    };
  }
}
