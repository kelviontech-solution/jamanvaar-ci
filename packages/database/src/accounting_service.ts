import { db } from './db';
import { Order, BusinessDay, BusinessDayStatus, KOTRecord } from '@jamanvaar/types';
import {
  formatRestaurantDate,
  getBusinessDayDisplayDate
} from '@jamanvaar/utils';
import { BusinessDayRepository } from './repositories';

export interface BusinessDaySummary {
  business_day_id: string;
  business_date: string;
  display_date: string;
  status: BusinessDayStatus | 'SYNC_PENDING' | 'RECONCILIATION_REQUIRED';
  opened_at: string;
  closed_at?: string;
  opened_by: string;
  closed_by?: string;

  // Financial Metrics
  gross_sales: number;
  discounts: number;
  cgst_amount: number;
  sgst_amount: number;
  tax_amount: number;
  service_charge: number;
  round_off: number;
  net_sales: number;
  refunds: number;
  net_collected: number;

  // Payment Breakdown
  cash_sales: number;
  upi_sales: number;
  card_sales: number;
  other_sales: number;
  total_payments_recorded: number;

  // Order Counts
  total_orders: number;
  completed_orders: number;
  active_orders: number;
  cancelled_orders: number;
  refunded_orders: number;
  dine_in_orders: number;
  takeaway_orders: number;
  delivery_orders: number;

  // AOV
  average_order_value: number;

  // Cash Drawer Reconciliation
  opening_cash: number;
  cash_expected: number;
  cash_counted?: number;
  cash_variance?: number;

  // Blockers for Day Close
  unpaid_orders_count: number;
  active_kots_count: number;
  held_carts_count: number;
  has_blocking_items: boolean;
  blocking_reasons: string[];
}

export class BusinessDayAccountingService {
  /**
   * Resolves the current active business day record, creating (or auto-rolling-over) one if
   * needed. B2-017: this used to have its own separate, simpler logic — find whatever's already
   * marked OPEN, or fall back to `db.businessDays[0]`, or create a fresh one only if the array
   * was completely empty — with no 5 AM cutoff check at all. On a device that never creates an
   * order itself (Restaurant Admin queries this for its Dashboard/reports but never calls
   * `OrderRepository.createOrder()`), that meant this device's own "active" business day could
   * never roll over past midnight/the cutoff on its own — only an order-creating device
   * (`BusinessDayRepository.getActiveBusinessDay()`, which does apply the cutoff) would ever
   * advance it. Two devices' local stores then permanently disagreed on "today", exactly the
   * ₹410-vs-₹0 split this bug reported. Delegating here means every caller — order creation,
   * reporting, the POS header/day-history views — shares the one real implementation.
   */
  public static getActiveBusinessDay(): BusinessDay {
    return BusinessDayRepository.getActiveBusinessDay();
  }

  /**
   * The Single Authoritative Aggregation Function for any Business Day
   */
  public static getBusinessDaySummary(businessDayId?: string): BusinessDaySummary {
    const activeDay = this.getActiveBusinessDay();
    const targetId = businessDayId || activeDay.id;
    const targetDayRecord: BusinessDay = db.businessDays.find((b) => b.id === targetId) || activeDay;

    // Filter all orders belonging to this business_day_id
    const dayOrders = db.orders.filter(o => BusinessDayRepository.orderBelongsToBusinessDay(o, targetDayRecord));

    let gross_sales = 0;
    let discounts = 0;
    let cgst_amount = 0;
    let sgst_amount = 0;
    let tax_amount = 0;
    let service_charge = 0;
    let round_off = 0;
    let net_sales = 0;
    let refunds = 0;

    let cash_sales = 0;
    let upi_sales = 0;
    let card_sales = 0;
    let other_sales = 0;

    let total_orders = dayOrders.length;
    let completed_orders = 0;
    let active_orders = 0;
    let cancelled_orders = 0;
    let refunded_orders = 0;

    let dine_in_orders = 0;
    let takeaway_orders = 0;
    let delivery_orders = 0;

    let unpaid_orders_count = 0;

    dayOrders.forEach((o) => {
      // Order type breakdown
      if (o.orderType === 'DINE_IN') dine_in_orders++;
      else if (o.orderType === 'TAKEAWAY') takeaway_orders++;
      else if (o.orderType === 'DELIVERY') delivery_orders++;

      // Status handling
      if (o.orderStatus === 'CANCELLED') {
        cancelled_orders++;
        return; // Cancelled orders do not contribute to revenue totals
      }

      if (o.orderStatus === 'REFUNDED') {
        refunded_orders++;
        refunds += (o.totalAmount || 0);
      }

      if (o.orderStatus === 'COMPLETED') {
        completed_orders++;
      } else {
        active_orders++;
      }

      // Check if order is unpaid
      if (o.paymentStatus !== 'SUCCESS') {
        unpaid_orders_count++;
      }

      // Aggregate revenue
      gross_sales += (o.subtotal || 0);
      discounts += (o.discountAmount || 0);
      cgst_amount += (o.cgstAmount || 0);
      sgst_amount += (o.sgstAmount || 0);
      tax_amount += (o.taxAmount || (o.cgstAmount || 0) + (o.sgstAmount || 0));
      service_charge += (o.serviceChargeAmount || 0);
      round_off += (o.roundOffAmount || 0);
      net_sales += (o.totalAmount || 0);

      // Payment Method Breakdown (only for successful payments)
      if (o.paymentStatus === 'SUCCESS') {
        const method = (o.paymentMethod || '').toUpperCase();
        if (method === 'CASH' || method === 'CASH_AT_COUNTER') {
          cash_sales += (o.totalAmount || 0);
        } else if (
          method === 'UPI' ||
          method === 'UPI_QR' ||
          method === 'DYNAMIC_QR' ||
          method === 'UPI_INTENT' ||
          method === 'BHARAT_QR'
        ) {
          upi_sales += (o.totalAmount || 0);
        } else if (
          method === 'CARD' ||
          method === 'DEBIT_CARD' ||
          method === 'CREDIT_CARD' ||
          method === 'EDC_MACHINE' ||
          method === 'CARD_TERMINAL' ||
          method === 'POS_CARD'
        ) {
          card_sales += (o.totalAmount || 0);
        } else if (method === 'SPLIT') {
          const half = Math.round((o.totalAmount || 0) / 2);
          cash_sales += half;
          upi_sales += ((o.totalAmount || 0) - half);
        } else {
          other_sales += (o.totalAmount || 0);
        }
      }
    });

    const total_payments_recorded = cash_sales + upi_sales + card_sales + other_sales;
    const net_collected = Math.max(0, total_payments_recorded - refunds);
    const average_order_value = completed_orders > 0 ? Math.round(net_sales / completed_orders) : 0;

    // Cash drawer math
    const opening_cash = targetDayRecord.openingCash || 2000;
    const cash_expected = opening_cash + cash_sales;
    const cash_counted = targetDayRecord.closingCash;
    const cash_variance = cash_counted !== undefined ? cash_counted - cash_expected : undefined;

    // Check Active KOTs and Held Carts for Day Close Blocking
    const activeKots = (db.kots || []).filter((k: KOTRecord) => {
      const kotOrder = db.orders.find((o) => o.id === k.orderId);
      const belongs = kotOrder ? BusinessDayRepository.orderBelongsToBusinessDay(kotOrder, targetDayRecord) : true;
      return belongs && k.status !== 'SERVED' && k.status !== 'CANCELLED';
    });
    const active_kots_count = activeKots.length;

    const held_carts_count = (db.heldOrders || []).length;

    const blocking_reasons: string[] = [];
    if (unpaid_orders_count > 0) {
      blocking_reasons.push(`${unpaid_orders_count} orders are currently unpaid or pending settlement.`);
    }
    if (active_kots_count > 0) {
      blocking_reasons.push(`${active_kots_count} active KOT tickets are currently in preparation.`);
    }
    if (held_carts_count > 0) {
      blocking_reasons.push(`${held_carts_count} cart sessions are currently placed on hold.`);
    }

    const has_blocking_items = blocking_reasons.length > 0;

    return {
      business_day_id: targetDayRecord.id,
      business_date: targetDayRecord.businessDate,
      display_date: targetDayRecord.displayDate || getBusinessDayDisplayDate(targetDayRecord.businessDate),
      status: targetDayRecord.status,
      opened_at: targetDayRecord.openedAt,
      closed_at: targetDayRecord.closedAt,
      opened_by: targetDayRecord.openedBy,
      closed_by: targetDayRecord.closedBy,

      gross_sales,
      discounts,
      cgst_amount,
      sgst_amount,
      tax_amount,
      service_charge,
      round_off,
      net_sales,
      refunds,
      net_collected,

      cash_sales,
      upi_sales,
      card_sales,
      other_sales,
      total_payments_recorded,

      total_orders,
      completed_orders,
      active_orders,
      cancelled_orders,
      refunded_orders,
      dine_in_orders,
      takeaway_orders,
      delivery_orders,

      average_order_value,

      opening_cash,
      cash_expected,
      cash_counted,
      cash_variance,

      unpaid_orders_count,
      active_kots_count,
      held_carts_count,
      has_blocking_items,
      blocking_reasons
    };
  }

  /**
   * Returns summaries for all recorded business days (sorted latest first)
   */
  public static getAllBusinessDaysSummaries(): BusinessDaySummary[] {
    return db.businessDays.map((b) => this.getBusinessDaySummary(b.id));
  }
}
