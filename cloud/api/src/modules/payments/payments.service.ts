import { randomUUID } from 'crypto';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CashfreeGatewayService } from './cashfree-gateway.service';
import { MenuSyncService } from './menu-sync.service';
import { priceCart, PriceValidationError, MenuSnapshotItemLookup } from './pricing.util';
import { CreatePaymentOrderDto } from './dto/create-payment-order.dto';

const NON_TERMINAL_STATUSES = ['CREATED', 'PENDING', 'AUTHORIZED'];

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly cashfree: CashfreeGatewayService,
    private readonly menuSync: MenuSyncService
  ) {}

  async createOrGetPaymentOrder(restaurantId: string, kioskId: string, dto: CreatePaymentOrderDto) {
    const existingOrder = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.order.findUnique({
        where: { restaurantId_externalOrderId: { restaurantId, externalOrderId: dto.externalOrderId } },
        include: { paymentTransactions: { orderBy: { createdAt: 'desc' } } }
      })
    );

    if (existingOrder) {
      const latest = existingOrder.paymentTransactions[0];
      if (existingOrder.status === 'PAID' || (latest && NON_TERMINAL_STATUSES.includes(latest.status))) {
        return this.toOrderResponse(existingOrder, latest);
      }
      // Every prior attempt is terminal-failed: open a fresh attempt at the same, already-validated total.
      const payment = await this.createCashfreeAttempt(existingOrder.id, restaurantId, existingOrder.totalAmount, existingOrder.currency);
      return this.toOrderResponse(existingOrder, payment);
    }

    const connection = await this.prisma.runAsTenant(restaurantId, (tx) => tx.restaurantPaymentConnection.findUnique({ where: { restaurantId } }));
    if (!connection || connection.status !== 'ACTIVE') {
      throw new ForbiddenException('Online payments are not active for this restaurant yet');
    }

    const menuItems = await this.menuSync.loadItemsByExternalIds(restaurantId, dto.lines.map((l) => l.externalItemId));
    const lookup = new Map<string, MenuSnapshotItemLookup>(
      menuItems.map((item) => [
        item.externalItemId,
        {
          externalItemId: item.externalItemId,
          name: item.name,
          basePrice: item.basePrice,
          taxRate: item.taxRate,
          isAvailable: item.isAvailable,
          modifierGroups: (item.modifierGroups as unknown as MenuSnapshotItemLookup['modifierGroups']) ?? []
        }
      ])
    );

    let priced;
    try {
      priced = priceCart(dto.lines, lookup);
    } catch (err) {
      if (err instanceof PriceValidationError) throw new BadRequestException(err.message);
      throw err;
    }

    const order = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.order.create({
        data: {
          restaurantId,
          kioskId,
          externalOrderId: dto.externalOrderId,
          items: priced.lines as unknown as Prisma.InputJsonValue,
          subtotal: priced.subtotal,
          taxAmount: priced.taxAmount,
          discountAmount: 0,
          totalAmount: priced.totalAmount,
          status: 'PENDING_PAYMENT'
        }
      })
    );

    const payment = await this.createCashfreeAttempt(order.id, restaurantId, order.totalAmount, order.currency);
    return this.toOrderResponse(order, payment);
  }

  private async createCashfreeAttempt(orderId: string, restaurantId: string, amount: number, currency: string) {
    const payment = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.create({
        data: { orderId, restaurantId, providerOrderId: `pay_${randomUUID()}`, amount, currency, status: 'CREATED' }
      })
    );

    const cfOrder = await this.cashfree.createOrder({
      orderId: payment.providerOrderId,
      amountPaise: amount,
      currency,
      customerId: orderId,
      notifyUrl: this.config.get<string>('CASHFREE_WEBHOOK_NOTIFY_URL')
    });

    return this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.update({ where: { id: payment.id }, data: { paymentSessionId: cfOrder.paymentSessionId, status: 'PENDING' } })
    );
  }

  private toOrderResponse(
    order: { id: string; totalAmount: number; currency: string },
    payment: { id: string; paymentSessionId: string | null; status: string }
  ) {
    return { orderId: order.id, paymentId: payment.id, paymentSessionId: payment.paymentSessionId, amount: order.totalAmount, currency: order.currency, status: payment.status };
  }

  async getPaymentStatus(restaurantId: string, paymentId: string) {
    const payment = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.findFirst({ where: { id: paymentId, restaurantId }, include: { order: true } })
    );
    if (!payment) throw new NotFoundException('Payment not found');
    return { paymentId: payment.id, orderId: payment.orderId, status: payment.status, amount: payment.amount, currency: payment.currency, orderStatus: payment.order.status };
  }
}
