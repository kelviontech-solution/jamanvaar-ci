import { ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
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
        gst: dto.gst ?? null,
        cin: dto.cin ?? null,
        uidai: dto.uidai ?? null,
        contactName: dto.contactName,
        contactEmail: dto.contactEmail,
        contactPhone: dto.contactPhone,
        settlementAccountName: dto.settlementAccountName ?? null,
        settlementAccountNumberEncrypted: dto.settlementAccountNumber
          ? encryptCredential(dto.settlementAccountNumber, this.encryptionKey())
          : null,
        settlementIfsc: dto.settlementIfsc ?? null,
        settlementUpiVpa: dto.settlementUpiVpa ?? null,
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
    return {
      status: connection.status,
      accountType: connection.accountType,
      businessType: connection.businessType,
      pan: connection.pan,
      gst: connection.gst,
      cin: connection.cin,
      uidai: connection.uidai,
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
    return this.prisma.runAsPlatform(async (tx) => {
      const connection = await tx.restaurantPaymentConnection.findUnique({ where: { restaurantId } });
      if (!connection) throw new NotFoundException('No payment connection for this restaurant');
      if (connection.status !== 'PENDING_VERIFICATION') {
        throw new ForbiddenException(`Cannot approve a connection in status ${connection.status}`);
      }
      if (!connection.pan || !connection.accountType || !connection.contactName || !connection.contactEmail || !connection.contactPhone) {
        throw new ForbiddenException('Submission is incomplete — missing required KYC/contact fields');
      }

      const vendorId = `rest_${restaurantId.replace(/-/g, '')}`;
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

      const result = await this.cashfree.createVendor({
        vendorId,
        status: 'ACTIVE',
        name: connection.contactName,
        email: connection.contactEmail,
        phone: connection.contactPhone,
        kycDetails: {
          accountType: connection.accountType as 'BUSINESS' | 'INDIVIDUAL',
          businessType: connection.businessType ?? undefined,
          pan: connection.pan,
          gst: connection.gst ?? undefined,
          cin: connection.cin ?? undefined,
          uidai: connection.uidai ?? undefined
        },
        bank,
        upi
      });

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

  async refreshStatus(restaurantId: string) {
    return this.prisma.runAsPlatform(async (tx) => {
      const connection = await tx.restaurantPaymentConnection.findUnique({ where: { restaurantId } });
      if (!connection) throw new NotFoundException('No payment connection for this restaurant');
      if (!connection.cashfreeVendorId) {
        throw new ForbiddenException('No Cashfree vendor exists yet for this connection — approve it first');
      }
      const result = await this.cashfree.getVendorStatus(connection.cashfreeVendorId);
      await tx.restaurantPaymentConnection.update({ where: { restaurantId }, data: { cashfreeVendorStatus: result.status } });
      return { cashfreeVendorStatus: result.status };
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
      settlementUpiVpa: connection.settlementUpiVpa,
      cashfreeVendorId: connection.cashfreeVendorId,
      cashfreeVendorStatus: connection.cashfreeVendorStatus,
      verifiedAt: connection.verifiedAt,
      lastWebhookAt: connection.lastWebhookAt,
      lastPaymentAt: connection.lastPaymentAt,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt
    };
  }
}
