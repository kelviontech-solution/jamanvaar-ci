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
}
