import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PlatformUser } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { requireStepUpPassword } from '../../common/security/step-up.util';
import { decryptCredential } from '../../common/security/credential-encryption.util';
import { businessDateIn } from '../qr/qr.support';
import { lockSettlement } from './settlement-lock.util';

function maskLast4(value: string | null | undefined): string | null {
  if (!value) return null;
  return `•••• ${value.slice(-4)}`;
}

/**
 * The temporary manual payout path while Razorpay Route is pending (see payment-connections.service.ts's
 * approve() — restaurants are active and taking payments today with no automatic routing). A customer's payment
 * already carries its own split (PaymentTransaction.platformAmount/restaurantAmount, frozen at creation — see
 * commission.util.ts); this service only batches the restaurant's share into something a Super Admin can actually
 * pay out by bank transfer and mark PAID with a UTR. Nothing here changes what the customer paid or what Razorpay
 * recorded.
 *
 * When Route goes live, this becomes one of (at least) two payout providers behind the same restaurant-facing
 * ledger — the ledger (PaymentTransaction's own commission fields) does not change; only how the restaurant's
 * share physically reaches its bank account does.
 */
@Injectable()
export class RestaurantPayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService
  ) {}

  private encryptionKey(): string {
    const key = this.config.get<string>('PAYMENT_CREDENTIAL_ENCRYPTION_KEY');
    if (!key) throw new ServiceUnavailableException('PAYMENT_CREDENTIAL_ENCRYPTION_KEY is not configured on this server');
    return key;
  }

  /**
   * Super Admin confirms (or rejects) a restaurant's bank details are real — the one gate the EOD batch checks
   * before a restaurant's collections become payable. A restaurant can never set this on itself (no tenant-facing
   * endpoint writes it); see kiosk-payment-connection.controller.ts for where the restaurant only ever *submits*.
   */
  async setBankVerification(restaurantId: string, status: 'VERIFIED' | 'REJECTED', actor: PlatformUser, password?: string) {
    await requireStepUpPassword(actor, password);
    return this.prisma.runAsPlatform(async (tx) => {
      await lockSettlement(tx, restaurantId);
      const connection = await tx.restaurantPaymentConnection.findUnique({ where: { restaurantId } });
      if (!connection) throw new NotFoundException('No payment connection for this restaurant');
      if (!connection.settlementAccountNumberEncrypted && !connection.settlementUpiVpa) {
        throw new BadRequestException('This restaurant has not submitted bank details yet');
      }
      const updated = await tx.restaurantPaymentConnection.update({
        where: { restaurantId },
        data: { bankVerificationStatus: status, bankVerifiedAt: new Date(), bankVerifiedByPlatformUserId: actor.id }
      });
      await this.audit.log({
        actorType: 'PLATFORM',
        actorId: actor.id,
        restaurantId,
        action: status === 'VERIFIED' ? 'BANK_DETAILS_VERIFIED' : 'BANK_DETAILS_REJECTED',
        category: 'PAYMENTS',
        details: {}
      }, tx);
      return { bankVerificationStatus: updated.bankVerificationStatus };
    });
  }

  /**
   * One restaurant's share of its EOD batch: claims every unclaimed, captured, never-refunded payment into one new
   * payout row and marks those payments claimed, atomically — a payment can never end up in two payout batches,
   * and a second run (the whole job, or just this restaurant) that finds nothing left to claim does nothing.
   * Returns null when there was nothing to pay out (no eligible payments, or the day's batch already exists).
   */
  private async claimForRestaurant(
    restaurantId: string,
    businessDateOverride: string | undefined,
    bank: { accountNumberEncrypted: string | null; ifsc: string | null }
  ): Promise<{ id: string; netAmount: number } | null> {
    return this.prisma.runAsTenant(restaurantId, async (tx) => {
      await lockSettlement(tx, restaurantId);
      // Re-read inside the lock: the bank may have changed after the job selected restaurants.
      const connection = await tx.restaurantPaymentConnection.findUnique({ where: { restaurantId } });
      if (connection?.status !== 'ACTIVE' || connection.bankVerificationStatus !== 'VERIFIED') return null;
      bank = { accountNumberEncrypted: connection.settlementAccountNumberEncrypted, ifsc: connection.settlementIfsc };
      const restaurant = await tx.restaurant.findUnique({ where: { id: restaurantId }, select: { timezone: true } });
      const businessDate = businessDateOverride ?? businessDateIn(restaurant?.timezone ?? 'Asia/Kolkata');
      if (await tx.restaurantPayout.findUnique({ where: { restaurantId_businessDate: { restaurantId, businessDate } } })) return null;

      const eligible = await tx.paymentTransaction.findMany({
        where: {
          restaurantId,
          payoutId: null,
          status: 'SUCCESS',
          restaurantAmount: { not: null },
          // Conservative refund rule (no fee-adjustment policy has been defined yet): a payment that has any
          // successful refund is left out of the batch entirely rather than guessing what it should net to.
          refunds: { none: { status: { in: ['SUCCESS', 'PENDING'] } } }
        },
        select: { id: true, amount: true, platformAmount: true, restaurantAmount: true }
      });
      if (eligible.length === 0) return null;

      const grossAmount = eligible.reduce((sum, p) => sum + p.amount, 0);
      const feeAmount = eligible.reduce((sum, p) => sum + (p.platformAmount ?? 0), 0);
      const netAmount = eligible.reduce((sum, p) => sum + (p.restaurantAmount ?? 0), 0);
      if (netAmount <= 0) return null;

      let bankAccountMasked: string | null = null;
      try {
        bankAccountMasked = bank.accountNumberEncrypted ? maskLast4(decryptCredential(bank.accountNumberEncrypted, this.encryptionKey())) : null;
      } catch {
        bankAccountMasked = null;
      }

      let payout;
      try {
        payout = await tx.restaurantPayout.create({
          data: {
            restaurantId,
            businessDate,
            grossAmount,
            feeAmount,
            netAmount,
            paymentCount: eligible.length,
            bankAccountMasked,
            bankIfsc: bank.ifsc
          }
        });
      } catch (err) {
        // P2002: a payout for (restaurantId, businessDate) already exists — a concurrent run of this same job won
        // the race. The eligible payments above are still unclaimed (nothing committed yet in this transaction),
        // so this rolls back to a clean no-op rather than a duplicate or a half-claimed batch.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null;
        throw err;
      }

      await tx.paymentTransaction.updateMany({ where: { id: { in: eligible.map((p) => p.id) }, payoutId: null }, data: { payoutId: payout.id } });

      await this.audit.log(
        { actorType: 'SYSTEM', restaurantId, action: 'PAYOUT_CREATED', category: 'PAYMENTS', details: { payoutId: payout.id, netAmount, paymentCount: eligible.length } },
        tx
      );

      return { id: payout.id, netAmount };
    });
  }

  /**
   * The EOD batch job (see jobs.service.ts). Every restaurant with an ACTIVE connection and VERIFIED bank details
   * is considered; nothing is transferred — this only creates PENDING payout rows for a Super Admin to actually
   * pay and mark PAID. Safe to call more than once for the same day: each restaurant's own claim is idempotent.
   */
  async runEodBatch(businessDateOverride?: string): Promise<{ restaurantsConsidered: number; payoutsCreated: number }> {
    const connections = await this.prisma.runAsPlatform((tx) =>
      tx.restaurantPaymentConnection.findMany({
        where: { status: 'ACTIVE', bankVerificationStatus: 'VERIFIED' },
        select: { restaurantId: true, settlementAccountNumberEncrypted: true, settlementIfsc: true }
      })
    );
    let payoutsCreated = 0;
    for (const connection of connections) {
      const result = await this.claimForRestaurant(connection.restaurantId, businessDateOverride, {
        accountNumberEncrypted: connection.settlementAccountNumberEncrypted,
        ifsc: connection.settlementIfsc
      });
      if (result) payoutsCreated += 1;
    }
    return { restaurantsConsidered: connections.length, payoutsCreated };
  }

  async list(filters: { restaurantId?: string; status?: string; page: number; limit: number }) {
    return this.prisma.runAsPlatform(async (tx) => {
      const where = {
        ...(filters.restaurantId ? { restaurantId: filters.restaurantId } : {}),
        ...(filters.status ? { status: filters.status as never } : {})
      };
      const [rows, total] = await Promise.all([
        tx.restaurantPayout.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (filters.page - 1) * filters.limit,
          take: filters.limit,
          include: { restaurant: { select: { id: true, name: true } } }
        }),
        tx.restaurantPayout.count({ where })
      ]);
      return { rows, total, page: filters.page, limit: filters.limit };
    });
  }

  async getById(id: string) {
    const payout = await this.prisma.runAsPlatform((tx) => tx.restaurantPayout.findUnique({ where: { id }, include: { restaurant: { select: { id: true, name: true } } } }));
    if (!payout) throw new NotFoundException('Payout not found');
    return payout;
  }

  /** Super Admin records that the bank transfer has actually happened. Requires a UTR — never allowed without one. */
  async markPaid(id: string, utr: string, actor: PlatformUser, password?: string) {
    await requireStepUpPassword(actor, password);
    if (!utr.trim()) throw new BadRequestException('A UTR / transfer reference is required to mark a payout paid');
    return this.prisma.runAsPlatform(async (tx) => {
      const initial = await tx.restaurantPayout.findUnique({ where: { id } });
      if (!initial) throw new NotFoundException('Payout not found');
      await lockSettlement(tx, initial.restaurantId);
      await tx.$queryRaw`SELECT id FROM "RestaurantPayout" WHERE id = ${id} FOR UPDATE`;
      const payout = await tx.restaurantPayout.findUnique({ where: { id } });
      if (!payout) throw new NotFoundException('Payout not found');
      if (payout.status === 'PAID') throw new ConflictException('This payout is already marked paid');
      if (payout.status !== 'PENDING' && payout.status !== 'APPROVED') {
        throw new ForbiddenException(`Cannot mark a payout PAID from status ${payout.status}`);
      }
      const bank = await tx.restaurantPaymentConnection.findUnique({ where: { restaurantId: payout.restaurantId } });
      if (bank?.bankVerificationStatus !== 'VERIFIED') throw new ConflictException('Verify the payout bank details before recording the transfer');
      const unsafe = await tx.paymentTransaction.count({ where: { payoutId: id, OR: [
        { status: { not: 'SUCCESS' } }, { refunds: { some: { status: { in: ['PENDING', 'SUCCESS'] } } } }
      ] } });
      if (unsafe) throw new ConflictException('This batch includes refunds or unresolved payments. Reconcile it before recording a bank transfer.');
      const updated = await tx.restaurantPayout.update({
        where: { id },
        data: { status: 'PAID', utr: utr.trim(), paidAt: new Date(), paidByPlatformUserId: actor.id }
      });
      await this.audit.log(
        {
          actorType: 'PLATFORM',
          actorId: actor.id,
          restaurantId: payout.restaurantId,
          action: 'PAYOUT_MARKED_PAID',
          category: 'PAYMENTS',
          details: { payoutId: id, netAmount: payout.netAmount, utr: utr.trim() }
        },
        tx
      );
      return updated;
    });
  }

  async hold(id: string, reason: string, actor: PlatformUser, password?: string) {
    await requireStepUpPassword(actor, password);
    return this.prisma.runAsPlatform(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "RestaurantPayout" WHERE id = ${id} FOR UPDATE`;
      const payout = await tx.restaurantPayout.findUnique({ where: { id } });
      if (!payout) throw new NotFoundException('Payout not found');
      if (payout.status === 'PAID') throw new ConflictException('A paid payout cannot be put on hold');
      const updated = await tx.restaurantPayout.update({ where: { id }, data: { status: 'ON_HOLD', holdReason: reason || null } });
      await this.audit.log(
        { actorType: 'PLATFORM', actorId: actor.id, restaurantId: payout.restaurantId, action: 'PAYOUT_ON_HOLD', category: 'PAYMENTS', details: { payoutId: id, reason } },
        tx
      );
      return updated;
    });
  }

  async release(id: string, actor: PlatformUser, password?: string) {
    await requireStepUpPassword(actor, password);
    return this.prisma.runAsPlatform(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "RestaurantPayout" WHERE id = ${id} FOR UPDATE`;
      const payout = await tx.restaurantPayout.findUnique({ where: { id } });
      if (!payout) throw new NotFoundException('Payout not found');
      if (payout.status !== 'ON_HOLD') throw new ForbiddenException('Only an ON_HOLD payout can be released');
      if (await tx.paymentTransaction.count({ where: { payoutId: id, refunds: { some: { status: { in: ['PENDING', 'SUCCESS'] } } } } })) {
        throw new ConflictException('Refunds in this batch need reconciliation before it can be released');
      }
      const updated = await tx.restaurantPayout.update({ where: { id }, data: { status: 'PENDING', holdReason: null } });
      await this.audit.log(
        { actorType: 'PLATFORM', actorId: actor.id, restaurantId: payout.restaurantId, action: 'PAYOUT_APPROVED', category: 'PAYMENTS', details: { payoutId: id } },
        tx
      );
      return updated;
    });
  }

  private async collectionSummary(tx: Prisma.TransactionClient, restaurantId?: string) {
    // One snapshot prevents a collection moving into an EOD batch between aggregates
    // from appearing twice (or disappearing) in Pending.
    await tx.$executeRawUnsafe('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const tenant = restaurantId ? { restaurantId } : {};
    const captured: Prisma.PaymentTransactionWhereInput = {
      ...tenant, status: { in: ['SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED', 'REFUND_PENDING'] }
    };
    const blockedPayment: Prisma.PaymentTransactionWhereInput = { OR: [
      { status: { not: 'SUCCESS' } },
      { refunds: { some: { status: { in: ['PENDING', 'SUCCESS'] } } } }
    ] };
    const blockedBatch: Prisma.RestaurantPayoutWhereInput = { OR: [
      { status: { in: ['ON_HOLD', 'FAILED'] } }, { payments: { some: blockedPayment } }
    ] };
    const [collected, unbatched, heldUnbatched, pending, heldBatches, paid, refunds, unallocated] = await Promise.all([
      tx.paymentTransaction.aggregate({ where: captured, _sum: { amount: true, platformAmount: true, restaurantAmount: true } }),
      tx.paymentTransaction.aggregate({ where: { ...captured, payoutId: null, NOT: blockedPayment }, _sum: { restaurantAmount: true } }),
      tx.paymentTransaction.aggregate({ where: { ...captured, payoutId: null, ...blockedPayment }, _sum: { restaurantAmount: true } }),
      tx.restaurantPayout.aggregate({ where: { ...tenant, status: { not: 'PAID' }, NOT: blockedBatch }, _sum: { netAmount: true } }),
      tx.restaurantPayout.aggregate({ where: { ...tenant, status: { not: 'PAID' }, ...blockedBatch }, _sum: { netAmount: true } }),
      tx.restaurantPayout.aggregate({ where: { ...tenant, status: 'PAID' }, _sum: { netAmount: true } }),
      tx.refund.aggregate({ where: { ...tenant, status: 'SUCCESS' }, _sum: { amount: true } }),
      tx.paymentTransaction.aggregate({ where: { ...captured, payoutId: null, restaurantAmount: null }, _sum: { amount: true } })
    ]);
    const pendingPayout = (unbatched._sum.restaurantAmount ?? 0) + (pending._sum.netAmount ?? 0);
    const paidPayout = paid._sum.netAmount ?? 0;
    return {
      grossCollection: collected._sum.amount ?? 0,
      platformFee: collected._sum.platformAmount ?? 0,
      netBeforeAdjustments: collected._sum.restaurantAmount ?? 0,
      netPayable: pendingPayout + paidPayout,
      pendingPayout, paidPayout,
      heldPayable: (heldUnbatched._sum.restaurantAmount ?? 0) + (heldBatches._sum.netAmount ?? 0),
      refundedAmount: refunds._sum.amount ?? 0,
      unallocatedCollection: unallocated._sum.amount ?? 0,
      payoutMode: 'MANUAL', routeStatus: 'PENDING'
    };
  }

  /** Totals use frozen splits; refunds stay on hold until a fee-adjustment policy is defined. */
  async platformOverview() {
    return this.prisma.runAsPlatform(async (tx) => {
      const summary = await this.collectionSummary(tx);
      return { ...summary, restaurantPayable: summary.netPayable };
    });
  }

  async restaurantSummary(restaurantId: string) {
    return this.prisma.runAsTenant(restaurantId, (tx) => this.collectionSummary(tx, restaurantId));
  }

  async restaurantPayoutHistory(restaurantId: string, page: number, limit: number) {
    return this.prisma.runAsTenant(restaurantId, async (tx) => {
      const [rows, total] = await Promise.all([
        tx.restaurantPayout.findMany({ where: { restaurantId }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
        tx.restaurantPayout.count({ where: { restaurantId } })
      ]);
      return { rows, total, page, limit };
    });
  }
}
