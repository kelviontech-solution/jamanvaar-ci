import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CreateCashfreeOrderInput {
  orderId: string; // 3-45 chars, alphanumeric/underscore/hyphen — our own generated id
  amountPaise: number;
  currency: string;
  customerId: string;
  notifyUrl?: string;
  orderSplits?: { vendorId: string; percentage: number }[];
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

export interface CreateCashfreeVendorInput {
  vendorId: string; // alphanumeric/underscore only — a raw UUID's hyphens are rejected by Cashfree
  status: 'ACTIVE' | 'BLOCKED' | 'DELETED';
  name: string;
  email: string;
  phone: string;
  kycDetails: {
    accountType: 'BUSINESS' | 'INDIVIDUAL';
    businessType?: string;
    pan: string;
    gst?: string;
    cin?: string;
    uidai?: string;
  };
  bank?: { accountNumber: string; accountHolder: string; ifsc: string };
  upi?: { vpa: string; accountHolder: string };
}

export interface CashfreeVendorResult {
  vendorId: string;
  status: string;
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
        ...(input.notifyUrl ? { order_meta: { notify_url: input.notifyUrl } } : {}),
        ...(input.orderSplits && input.orderSplits.length > 0
          ? { order_splits: input.orderSplits.map((s) => ({ vendor_id: s.vendorId, percentage: s.percentage })) }
          : {})
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
    // A correctly signed but old delivery is a replay: refuse anything more than five minutes from now (timestamps are epoch ms or seconds).
    const ts = Number(timestamp);
    if (Number.isFinite(ts) && ts > 0) {
      const ms = ts < 1e12 ? ts * 1000 : ts;
      if (Math.abs(Date.now() - ms) > 5 * 60_000) return false;
    }
    const expected = Buffer.from(createHmac('sha256', secret).update(timestamp + rawBody.toString('utf8')).digest('base64'));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  }

  async createVendor(input: CreateCashfreeVendorInput): Promise<CashfreeVendorResult> {
    const res = await fetch(`${this.baseUrl()}/easy-split/vendors`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        vendor_id: input.vendorId,
        status: input.status,
        name: input.name,
        email: input.email,
        phone: input.phone,
        kyc_details: {
          account_type: input.kycDetails.accountType,
          ...(input.kycDetails.businessType ? { business_type: input.kycDetails.businessType } : {}),
          pan: input.kycDetails.pan,
          ...(input.kycDetails.gst ? { gst: input.kycDetails.gst } : {}),
          ...(input.kycDetails.cin ? { cin: input.kycDetails.cin } : {}),
          ...(input.kycDetails.uidai ? { uidai: input.kycDetails.uidai } : {})
        },
        ...(input.bank
          ? { bank: { account_number: input.bank.accountNumber, account_holder: input.bank.accountHolder, ifsc: input.bank.ifsc } }
          : {}),
        ...(input.upi ? { upi: { vpa: input.upi.vpa, account_holder: input.upi.accountHolder } } : {})
      })
    });
    const body = await res.json();
    if (!res.ok) {
      throw new ServiceUnavailableException(`Cashfree vendor creation failed: ${body?.message ?? res.statusText}`);
    }
    return { vendorId: body.vendor_id, status: body.status };
  }

  /**
   * Update Vendor (PATCH /pg/easy-split/vendors/{vendor_id}) —
   * https://www.cashfree.com/docs/api-reference/payments/latest/split/vendors/update
   *
   * Used on every re-approval after the first, so a disconnect → resubmit →
   * re-approve cycle carries the new bank/KYC details onto the vendor that
   * already exists at Cashfree, instead of re-issuing a create call with a
   * vendor_id Cashfree already holds (whose duplicate-create semantics are
   * undocumented). vendor_id travels in the URL path, never in the body.
   */
  async updateVendor(vendorId: string, input: Omit<CreateCashfreeVendorInput, 'vendorId'>): Promise<CashfreeVendorResult> {
    const res = await fetch(`${this.baseUrl()}/easy-split/vendors/${encodeURIComponent(vendorId)}`, {
      method: 'PATCH',
      headers: this.headers(),
      body: JSON.stringify({
        status: input.status,
        name: input.name,
        email: input.email,
        phone: input.phone,
        kyc_details: {
          account_type: input.kycDetails.accountType,
          ...(input.kycDetails.businessType ? { business_type: input.kycDetails.businessType } : {}),
          pan: input.kycDetails.pan,
          ...(input.kycDetails.gst ? { gst: input.kycDetails.gst } : {}),
          ...(input.kycDetails.cin ? { cin: input.kycDetails.cin } : {}),
          ...(input.kycDetails.uidai ? { uidai: input.kycDetails.uidai } : {})
        },
        ...(input.bank
          ? { bank: { account_number: input.bank.accountNumber, account_holder: input.bank.accountHolder, ifsc: input.bank.ifsc } }
          : {}),
        ...(input.upi ? { upi: { vpa: input.upi.vpa, account_holder: input.upi.accountHolder } } : {})
      })
    });
    const body = await res.json();
    if (!res.ok) {
      throw new ServiceUnavailableException(`Cashfree vendor update failed: ${body?.message ?? res.statusText}`);
    }
    return { vendorId: body.vendor_id, status: body.status };
  }

  async getVendorStatus(vendorId: string): Promise<CashfreeVendorResult> {
    const res = await fetch(`${this.baseUrl()}/easy-split/vendors/${encodeURIComponent(vendorId)}`, {
      method: 'GET',
      headers: this.headers()
    });
    const body = await res.json();
    if (!res.ok) {
      throw new ServiceUnavailableException(`Cashfree vendor lookup failed: ${body?.message ?? res.statusText}`);
    }
    return { vendorId: body.vendor_id, status: body.status };
  }
}
