import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CreateCashfreeOrderInput {
  orderId: string; // 3-45 chars, alphanumeric/underscore/hyphen — our own generated id
  amountPaise: number;
  currency: string;
  customerId: string;
  notifyUrl?: string;
}

export interface CashfreeOrderResult {
  cfOrderId: string;
  orderId: string;
  paymentSessionId: string;
  orderStatus: string;
}

export interface CashfreeOrderStatusResult {
  orderId: string;
  orderStatus: string;
  orderAmount: number;
}

export interface CreateCashfreeRefundInput {
  orderId: string;
  refundId: string;
  amountPaise: number;
  note?: string;
}

export interface CashfreeRefundResult {
  cfRefundId: string;
  refundId: string;
  refundStatus: string;
  refundAmount: number;
}

// Kiosk walk-up customers never provide a phone number, but Cashfree's
// Create Order API requires customer_details.customer_phone — a fixed
// placeholder is used since this flow collects no real one.
const PLACEHOLDER_CUSTOMER_PHONE = '9999999999';

/**
 * Thin wrapper over the Cashfree Payment Gateway REST API
 * (https://www.cashfree.com/docs/api-reference/payments/latest/overview).
 */
@Injectable()
export class CashfreeGatewayService {
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('CASHFREE_CLIENT_ID') &&
        this.config.get<string>('CASHFREE_CLIENT_SECRET') &&
        this.config.get<string>('CASHFREE_WEBHOOK_SECRET')
    );
  }

  private baseUrl(): string {
    return this.config.get<string>('CASHFREE_ENVIRONMENT') === 'production'
      ? 'https://api.cashfree.com/pg'
      : 'https://sandbox.cashfree.com/pg';
  }

  private headers(): Record<string, string> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Cashfree is not configured on this server (set CASHFREE_CLIENT_ID, CASHFREE_CLIENT_SECRET, CASHFREE_WEBHOOK_SECRET, and optionally CASHFREE_ENVIRONMENT / CASHFREE_API_VERSION)'
      );
    }
    return {
      'x-client-id': this.config.get<string>('CASHFREE_CLIENT_ID')!,
      'x-client-secret': this.config.get<string>('CASHFREE_CLIENT_SECRET')!,
      'x-api-version': this.config.get<string>('CASHFREE_API_VERSION') ?? '2025-01-01',
      'Content-Type': 'application/json'
    };
  }

  async createOrder(input: CreateCashfreeOrderInput): Promise<CashfreeOrderResult> {
    const res = await fetch(`${this.baseUrl()}/orders`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        order_id: input.orderId,
        order_amount: Number((input.amountPaise / 100).toFixed(2)),
        order_currency: input.currency,
        customer_details: { customer_id: input.customerId, customer_phone: PLACEHOLDER_CUSTOMER_PHONE },
        ...(input.notifyUrl ? { order_meta: { notify_url: input.notifyUrl } } : {})
      })
    });
    const body = await res.json();
    if (!res.ok) {
      throw new ServiceUnavailableException(`Cashfree order creation failed: ${body?.message ?? res.statusText}`);
    }
    return { cfOrderId: body.cf_order_id, orderId: body.order_id, paymentSessionId: body.payment_session_id, orderStatus: body.order_status };
  }

  async getOrderStatus(orderId: string): Promise<CashfreeOrderStatusResult> {
    const res = await fetch(`${this.baseUrl()}/orders/${encodeURIComponent(orderId)}`, { method: 'GET', headers: this.headers() });
    const body = await res.json();
    if (!res.ok) {
      throw new ServiceUnavailableException(`Cashfree order lookup failed: ${body?.message ?? res.statusText}`);
    }
    return { orderId: body.order_id, orderStatus: body.order_status, orderAmount: body.order_amount };
  }

  async createRefund(input: CreateCashfreeRefundInput): Promise<CashfreeRefundResult> {
    const res = await fetch(`${this.baseUrl()}/orders/${encodeURIComponent(input.orderId)}/refunds`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        refund_amount: Number((input.amountPaise / 100).toFixed(2)),
        refund_id: input.refundId,
        ...(input.note ? { refund_note: input.note } : {})
      })
    });
    const body = await res.json();
    if (!res.ok) {
      throw new ServiceUnavailableException(`Cashfree refund failed: ${body?.message ?? res.statusText}`);
    }
    return { cfRefundId: body.cf_refund_id, refundId: body.refund_id, refundStatus: body.refund_status, refundAmount: body.refund_amount };
  }

  /**
   * Cashfree signs webhooks as base64(HMAC-SHA256(timestamp + rawBody, secret))
   * (https://www.cashfree.com/docs/api-reference/vrs/webhook-signature-verification).
   */
  verifyWebhookSignature(rawBody: Buffer, timestamp: string, signature: string): boolean {
    const secret = this.config.get<string>('CASHFREE_WEBHOOK_SECRET');
    if (!secret) {
      throw new ServiceUnavailableException('CASHFREE_WEBHOOK_SECRET is not configured on this server');
    }
    const expected = Buffer.from(createHmac('sha256', secret).update(timestamp + rawBody.toString('utf8')).digest('base64'));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  }
}
