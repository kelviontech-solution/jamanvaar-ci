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

export interface CreateCashfreePaymentLinkInput {
  linkId: string; // our own id (alphanumeric/underscore/hyphen, max 50 chars) — becomes Cashfree's link_id
  amountRupees: number; // link_amount is rupees (2 decimals), unlike orders' amountPaise
  currency: string;
  purpose: string;
  customerPhone: string;
  customerName: string;
  expiryIso: string;
  notifyUrl?: string;
  orderSplits?: { vendorId: string; percentage: number }[];
}

export interface CashfreePaymentLinkResult {
  linkId: string;
  cfLinkId: string;
  linkUrl: string;
  linkStatus: string;
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
/** Cashfree has not approved this feature (for example the server-to-server Order Pay API) on the merchant account. Nothing in this system can fix it: the merchant must ask Cashfree. */
export class CashfreeFeatureNotEnabledException extends ServiceUnavailableException {}

@Injectable()
export class CashfreeGatewayService {
  constructor(private readonly config: ConfigService) {}

  /** Cashfree is switched off by default; payments run on Razorpay. Set CASHFREE_ENABLED=true to bring this code back into use. */
  isEnabled(): boolean {
    return this.config.get<string>('CASHFREE_ENABLED') === 'true';
  }

  isConfigured(): boolean {
    return Boolean(
      this.isEnabled() &&
      this.config.get<string>('CASHFREE_CLIENT_ID') &&
        this.config.get<string>('CASHFREE_CLIENT_SECRET') &&
        this.config.get<string>('CASHFREE_WEBHOOK_SECRET')
    );
  }

  private baseUrl(): string {
    if (this.config.get<string>('CASHFREE_ENVIRONMENT') === 'production') {
      return 'https://api.cashfree.com/pg';
    }
    // Sandbox only: lets a developer point the API at a local stand-in for Cashfree to rehearse the whole
    // flow without keys. Ignored in production, so live credentials can never be sent to another host.
    return this.config.get<string>('CASHFREE_BASE_URL_OVERRIDE') || 'https://sandbox.cashfree.com/pg';
  }

  private headers(): Record<string, string> {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException('Cashfree is switched off on this server; payments run on Razorpay');
    }
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

  /**
   * Order Pay API with the UPI `qrcode` channel
   * (https://www.cashfree.com/docs/api-reference/payments/latest/payments/pay):
   * Cashfree returns the QR for this exact order and amount and the merchant
   * (our kiosk) renders it, so the customer scans it with their own phone.
   * `expiresAtIso` is sent as transaction_expiry_time so an old QR stops working.
   */
  async createUpiQr(paymentSessionId: string, expiresAtIso: string): Promise<{ qrPayload: string; contentType: string | null; cfPaymentId: string | null }> {
    const res = await fetch(`${this.baseUrl()}/orders/sessions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        payment_session_id: paymentSessionId,
        payment_method: { upi: { channel: 'qrcode' } },
        transaction_expiry_time: expiresAtIso
      })
    });
    const body = await res.json();
    if (!res.ok) {
      const notEnabled = body?.type === 'feature_not_enabled' || /not_approved|not_enabled/i.test(String(body?.code ?? ''));
      if (notEnabled) throw new CashfreeFeatureNotEnabledException(`Cashfree QR creation failed: ${body?.message ?? res.statusText}`);
      throw new ServiceUnavailableException(`Cashfree QR creation failed: ${body?.message ?? res.statusText}`);
    }
    const payload = body?.data?.payload;
    if (typeof payload !== 'string' || payload.length === 0) {
      throw new ServiceUnavailableException('Cashfree did not return a QR code for this payment');
    }
    return { qrPayload: payload, contentType: body?.data?.content_type ?? null, cfPaymentId: body?.cf_payment_id ? String(body.cf_payment_id) : null };
  }

  /**
   * On-demand vendor settlement
   * (https://www.cashfree.com/docs/api-reference/payments/latest/easy-split/create-on-demand-transfer).
   * Cashfree requires a vendor balance of at least Rs. 1000 and payments processed at least
   * 15 minutes earlier; it answers with an error otherwise, which is surfaced as-is. The
   * idempotency key makes a retried click safe.
   */
  async settleVendorOnDemand(vendorId: string, amountPaise: number, idempotencyKey: string): Promise<{ settlementId: string | null; raw: Record<string, unknown> }> {
    const res = await fetch(`${this.baseUrl()}/easy-split/vendors/${encodeURIComponent(vendorId)}/transfer`, {
      method: 'POST',
      headers: { ...this.headers(), 'x-idempotency-key': idempotencyKey },
      body: JSON.stringify({
        transfer_from: 'VENDOR',
        transfer_type: 'ON_DEMAND',
        transfer_amount: Number((amountPaise / 100).toFixed(2)),
        remark: 'JAMANVAAR on-demand settlement'
      })
    });
    const body = await res.json();
    if (!res.ok) {
      throw new ServiceUnavailableException(`Cashfree on-demand settlement failed: ${body?.message ?? res.statusText}`);
    }
    return { settlementId: body?.settlement_id !== undefined && body?.settlement_id !== null ? String(body.settlement_id) : null, raw: body };
  }

  /**
   * Payment Links (https://www.cashfree.com/docs/api-reference/payments/latest/payment-links/create):
   * a DIFFERENT Cashfree product from Orders/createOrder above, not a variant of it. Orders'
   * payment_session_id has no plain, pasteable "open this to pay" URL at all — Cashfree's own
   * hosted checkout only opens via their JS SDK (`cashfree.checkout({paymentSessionId})`) running
   * on a real webpage, confirmed live (a hand-built `.../order/#/checkout?payment_session_id=...`
   * URL this codebase tried first — see git history — 404s/errors in a browser). Payment Links is
   * the product actually meant for a plain shareable URL in a chat message: it returns a real
   * `link_url` a customer can open directly, and Cashfree documents this exact use (WhatsApp Link
   * Setup) for it. Used only by the WhatsApp connector's checkout — kiosk's own device-based
   * flow keeps using Orders + createUpiQr below unchanged, since a kiosk screen can run the JS SDK.
   */
  async createPaymentLink(input: CreateCashfreePaymentLinkInput): Promise<CashfreePaymentLinkResult> {
    const res = await fetch(`${this.baseUrl()}/links`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        link_id: input.linkId,
        link_amount: Number(input.amountRupees.toFixed(2)),
        link_currency: input.currency,
        link_purpose: input.purpose,
        customer_details: { customer_phone: input.customerPhone, customer_name: input.customerName },
        // Our own channel (the WhatsApp bot) sends the link in its own message -- Cashfree must
        // never also independently SMS/email the customer about the same order.
        link_notify: { send_sms: false, send_email: false },
        link_expiry_time: input.expiryIso,
        ...(input.notifyUrl ? { link_meta: { notify_url: input.notifyUrl } } : {}),
        ...(input.orderSplits && input.orderSplits.length > 0
          ? { order_splits: input.orderSplits.map((s) => ({ vendor_id: s.vendorId, percentage: s.percentage })) }
          : {})
      })
    });
    const body = await res.json();
    if (!res.ok) {
      throw new ServiceUnavailableException(`Cashfree payment link creation failed: ${body?.message ?? res.statusText}`);
    }
    return { linkId: body.link_id, cfLinkId: body.cf_link_id, linkUrl: body.link_url, linkStatus: body.link_status };
  }

  /**
   * Get Payment Link Details (GET /pg/links/{link_id}) — the read-side counterpart to
   * createPaymentLink above, useful independently of the webhook (e.g. a manual reconcile,
   * or local testing with no webhook tunnel configured yet).
   */
  async getPaymentLinkDetails(linkId: string): Promise<{ linkStatus: string; amountPaid: number; raw: Record<string, unknown> }> {
    const res = await fetch(`${this.baseUrl()}/links/${encodeURIComponent(linkId)}`, { method: 'GET', headers: this.headers() });
    const body = await res.json();
    if (!res.ok) {
      throw new ServiceUnavailableException(`Cashfree payment link lookup failed: ${body?.message ?? res.statusText}`);
    }
    return { linkStatus: body.link_status, amountPaid: body.link_amount_paid, raw: body };
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
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException('Cashfree is switched off on this server; payments run on Razorpay');
    }
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

  /**
   * Get Split and Settlement Details by Order ID
   * (https://www.cashfree.com/docs/api-reference/payments/latest/split/configuration/split-after-payment)
   * — what Cashfree actually recorded for an order's vendor split, used by
   * PaymentReconciliationService to compare against this system's own
   * PaymentTransaction snapshot.
   */
  async getOrderSplitDetails(providerOrderId: string): Promise<{ splits: { vendorId: string; status: string }[] }> {
    const res = await fetch(`${this.baseUrl()}/easy-split/orders/${encodeURIComponent(providerOrderId)}/split`, {
      method: 'GET',
      headers: this.headers()
    });
    const body = await res.json();
    if (!res.ok) {
      throw new ServiceUnavailableException(`Cashfree split-details lookup failed: ${body?.message ?? res.statusText}`);
    }
    const splits = Array.isArray(body?.splits) ? body.splits : [];
    return { splits: splits.map((s: { vendor_id: string; status: string }) => ({ vendorId: s.vendor_id, status: s.status })) };
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
