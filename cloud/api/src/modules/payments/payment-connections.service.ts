import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformUser } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CashfreeGatewayService } from './cashfree-gateway.service';
import { encryptCredential, decryptCredential } from '../../common/security/credential-encryption.util';
import { SubmitPaymentConnectionDto } from './dto/payment-connection.dto';

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
    private readonly cashfree: CashfreeGatewayService,
    private readonly audit: AuditService
  ) {}

  private encryptionKey(): string {
    const key = this.config.get<string>('PAYMENT_CREDENTIAL_ENCRYPTION_KEY');
    if (!key) {
      throw new ServiceUnavailableException('PAYMENT_CREDENTIAL_ENCRYPTION_KEY is not configured on this server');
    }
    return key;
  }

  async submit(restaurantId: string, dto: SubmitPaymentConnectionDto) {
    return this.prisma.runAsTenant(restaurantId, async (tx) => {
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
        // A resubmission is by definition not yet verified — clear the old
        // timestamp so a pending-re-review connection can't read as verified.
        // cashfreeVendorId is deliberately RETAINED: approve() reuses it to
        // PATCH the existing Cashfree vendor rather than re-creating one.
        // cashfreeVendorStatus is likewise left alone — it still reflects the
        // real last-known Cashfree state, and approve()'s phase-3 write
        // overwrites it on the next successful approval.
        verifiedAt: null,
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

      return this.toOwnView(connection);
    });
  }

  async getOwn(restaurantId: string) {
    const connection = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.restaurantPaymentConnection.findUnique({ where: { restaurantId } })
    );
    if (!connection) return { status: 'NOT_CONNECTED' as const };
    return this.toOwnView(connection);
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
    cashfreeVendorId: string | null;
    verifiedAt: Date | null;
  }) {
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
      cashfreeVendorId: connection.cashfreeVendorId,
      verifiedAt: connection.verifiedAt
    };
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

  async approve(restaurantId: string, actor: PlatformUser) {
    // Deliberately split into three phases rather than one runAsPlatform
    // transaction spanning the whole method: runAsPlatform wraps its
    // callback in a real Postgres transaction, and holding that open across
    // the Cashfree network round-trip below risks statement/idle-in-tx
    // timeouts turning a slow-but-legitimate call into a spurious failure,
    // plus a narrow window where Cashfree creates the vendor but our own
    // commit then fails, leaving us with no record of a vendor that exists.
    // Phase 1 (read-only) gathers everything needed for the Cashfree call;
    // phase 2 makes that call with no transaction open; phase 3 re-checks
    // status (guarding a status change that raced phases 1-2, e.g. a
    // concurrent disconnect or a second concurrent approve) before writing.
    const prepared = await this.prisma.runAsPlatform(async (tx) => {
      const connection = await tx.restaurantPaymentConnection.findUnique({ where: { restaurantId } });
      if (!connection) throw new NotFoundException('No payment connection for this restaurant');
      if (connection.status !== 'PENDING_VERIFICATION') {
        throw new ForbiddenException(`Cannot approve a connection in status ${connection.status}`);
      }
      if (!connection.pan || !connection.accountType || !connection.contactName || !connection.contactEmail || !connection.contactPhone) {
        throw new ForbiddenException('Submission is incomplete — missing required KYC/contact fields');
      }

      const vendorId = `rest_${restaurantId.replace(/-/g, '')}`;
      // Null only on the first-ever approval. Once set, it is stable for the
      // life of the connection across any number of disconnect/resubmit/
      // re-approve cycles, and phase 2 updates that vendor instead of
      // creating a second one under the same deterministic id.
      const existingVendorId = connection.cashfreeVendorId;
      const bank =
        connection.settlementAccountNumberEncrypted && connection.settlementIfsc && connection.settlementAccountName
          ? {
              accountNumber: decryptCredential(connection.settlementAccountNumberEncrypted, this.encryptionKey()),
              accountHolder: connection.settlementAccountName,
              ifsc: connection.settlementIfsc
            }
          : undefined;
      const upi =
        !bank && connection.settlementUpiVpa
          ? { vpa: connection.settlementUpiVpa, accountHolder: connection.settlementAccountName ?? connection.contactName }
          : undefined;

      return {
        vendorId,
        existingVendorId,
        bank,
        upi,
        name: connection.contactName,
        email: connection.contactEmail,
        phone: connection.contactPhone,
        accountType: connection.accountType as 'BUSINESS' | 'INDIVIDUAL',
        businessType: connection.businessType ?? undefined,
        pan: connection.pan,
        gst: connection.gst ?? undefined,
        cin: connection.cin ?? undefined,
        uidai: connection.uidai ?? undefined
      };
    });

    // Phase 2: the Cashfree network call, made with no DB transaction open.
    // Create is only ever reached once per restaurant (the first approval);
    // every later approval PATCHes the vendor that already exists, so this
    // never depends on Cashfree's undocumented duplicate-create behaviour.
    const vendorInput = {
      status: 'ACTIVE' as const,
      name: prepared.name,
      email: prepared.email,
      phone: prepared.phone,
      kycDetails: {
        accountType: prepared.accountType,
        businessType: prepared.businessType,
        pan: prepared.pan,
        gst: prepared.gst,
        cin: prepared.cin,
        uidai: prepared.uidai
      },
      bank: prepared.bank,
      upi: prepared.upi
    };
    const result = prepared.existingVendorId
      ? await this.cashfree.updateVendor(prepared.existingVendorId, vendorInput)
      : await this.cashfree.createVendor({ vendorId: prepared.vendorId, ...vendorInput });

    // Phase 3: re-check status before writing — it may have changed while
    // phase 2 was in flight (a concurrent disconnect, or a second concurrent
    // approve). If so, the Cashfree vendor from phase 2 was already created;
    // cleaning that up at Cashfree is out of scope here, so we simply refuse
    // to overwrite whatever the connection's current state now is.
    return this.prisma.runAsPlatform(async (tx) => {
      const connection = await tx.restaurantPaymentConnection.findUnique({ where: { restaurantId } });
      if (!connection) throw new NotFoundException('No payment connection for this restaurant');
      if (connection.status !== 'PENDING_VERIFICATION') {
        throw new ForbiddenException(
          `Connection moved to ${connection.status} while contacting Cashfree — a vendor (${result.vendorId}) may already exist at Cashfree; resolve manually before retrying`
        );
      }

      const updated = await tx.restaurantPaymentConnection.update({
        where: { restaurantId },
        data: { status: 'ACTIVE', cashfreeVendorId: result.vendorId, cashfreeVendorStatus: result.status, verifiedAt: new Date() }
      });

      await this.audit.log(
        { actorType: 'PLATFORM', actorId: actor.id, restaurantId, action: 'PAYMENT_CONNECTION_APPROVED', category: 'PAYMENTS', details: { vendorId: result.vendorId } },
        tx
      );

      return { status: updated.status, cashfreeVendorId: updated.cashfreeVendorId };
    });
  }

  private async transitionStatus(restaurantId: string, actor: PlatformUser, allowedFrom: string[], to: string, auditAction: string) {
    return this.prisma.runAsPlatform(async (tx) => {
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

  async suspend(restaurantId: string, actor: PlatformUser) {
    return this.transitionStatus(restaurantId, actor, ['ACTIVE'], 'SUSPENDED', 'PAYMENT_CONNECTION_SUSPENDED');
  }

  async reactivate(restaurantId: string, actor: PlatformUser) {
    return this.transitionStatus(restaurantId, actor, ['SUSPENDED'], 'ACTIVE', 'PAYMENT_CONNECTION_REACTIVATED');
  }

  async disconnect(restaurantId: string, actor: PlatformUser) {
    return this.transitionStatus(restaurantId, actor, ['ACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION'], 'DISCONNECTED', 'PAYMENT_CONNECTION_DISCONNECTED');
  }

  async setCommissionOverride(restaurantId: string, overrideBps: number | null, actor: PlatformUser) {
    if (overrideBps !== null && (!Number.isInteger(overrideBps) || overrideBps < 0 || overrideBps > 10000)) {
      throw new BadRequestException('overrideBps must be null or an integer between 0 and 10000');
    }
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

  async refreshStatus(restaurantId: string) {
    // Same split as approve() and for the same reason: runAsPlatform opens a
    // real Postgres transaction, and holding one across the Cashfree network
    // round-trip risks idle-in-transaction/statement timeouts. No
    // re-check-before-write is needed here (unlike approve()) — this only
    // ever writes one field to a value Cashfree just reported, and never
    // transitions our own `status`, so there is no TOCTOU window that matters.
    const connection = await this.prisma.runAsPlatform((tx) =>
      tx.restaurantPaymentConnection.findUnique({ where: { restaurantId } })
    );
    if (!connection) throw new NotFoundException('No payment connection for this restaurant');
    if (!connection.cashfreeVendorId) {
      throw new ForbiddenException('No Cashfree vendor exists yet for this connection — approve it first');
    }
    const result = await this.cashfree.getVendorStatus(connection.cashfreeVendorId);
    return this.prisma.runAsPlatform(async (tx) => {
      const updated = await tx.restaurantPaymentConnection.update({
        where: { restaurantId },
        data: { cashfreeVendorStatus: result.status }
      });
      return { cashfreeVendorStatus: updated.cashfreeVendorStatus };
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
    cashfreeVendorId: string | null;
    cashfreeVendorStatus: string | null;
    verifiedAt: Date | null;
    lastWebhookAt: Date | null;
    lastPaymentAt: Date | null;
    commissionOverrideBps: number | null;
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
      cashfreeVendorId: connection.cashfreeVendorId,
      cashfreeVendorStatus: connection.cashfreeVendorStatus,
      commissionOverrideBps: connection.commissionOverrideBps,
      verifiedAt: connection.verifiedAt,
      lastWebhookAt: connection.lastWebhookAt,
      lastPaymentAt: connection.lastPaymentAt,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt
    };
  }
}
