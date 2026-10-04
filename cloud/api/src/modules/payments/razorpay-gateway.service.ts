import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CreateRazorpayUpiQrInput {
  paymentRef: string;
  amountPaise: number;
  closeByUnix: number;
  description?: string;
}

export interface RazorpayUpiQrResult {
  qrId: string;
  imageUrl: string | null;
  status: string;
}

@Injectable()
export class RazorpayGatewayService {
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>('RAZORPAY_KEY_ID') && this.config.get<string>('RAZORPAY_KEY_SECRET'));
  }

  private headers(): Record<string, string> {
    const keyId = this.config.get<string>('RAZORPAY_KEY_ID');
    const keySecret = this.config.get<string>('RAZORPAY_KEY_SECRET');
    if (!keyId || !keySecret) {
      throw new ServiceUnavailableException('Razorpay is not configured on this server (set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET)');
    }
    return {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * A single-use UPI QR for one exact amount (https://razorpay.com/docs/api/qr-codes/create/). Scanned from a phone
   * camera, it opens any UPI app directly. `paymentRef` comes back in the webhook's notes, which is how the payment
   * is matched. close_by must be at least two minutes ahead, so the caller passes it as Unix seconds.
   */
  async createUpiQr(input: CreateRazorpayUpiQrInput): Promise<RazorpayUpiQrResult> {
    const res = await fetch('https://api.razorpay.com/v1/payments/qr_codes', {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        type: 'upi_qr',
        name: 'JAMANVAAR kiosk payment',
        usage: 'single_use',
        fixed_amount: true,
        payment_amount: input.amountPaise,
        close_by: input.closeByUnix,
        ...(input.description ? { description: input.description } : {}),
        notes: { payment_ref: input.paymentRef }
      })
    });
    const body = await res.json();
    if (!res.ok) {
      throw new ServiceUnavailableException(`Razorpay QR creation failed: ${body?.error?.description ?? res.statusText}`);
    }
    return {
      qrId: body.id,
      imageUrl: typeof body.image_url === 'string' ? body.image_url : null,
      status: body.status
    };
  }

  /** A one-time payment link for a WhatsApp order (https://razorpay.com/docs/api/payments/payment-links/create/). Razorpay sends no SMS or email; the connector sends the link itself. */
  async createPaymentLink(input: { referenceId: string; amountPaise: number; description: string; customerName: string; customerPhone: string; expireByUnix: number }): Promise<{ linkId: string; shortUrl: string; status: string }> {
    const res = await fetch('https://api.razorpay.com/v1/payment_links', {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        amount: input.amountPaise,
        currency: 'INR',
        accept_partial: false,
        description: input.description,
        reference_id: input.referenceId,
        customer: { name: input.customerName, contact: input.customerPhone },
        notify: { sms: false, email: false },
        reminder_enable: false,
        expire_by: input.expireByUnix
      })
    });
    const body = await res.json();
    if (!res.ok) {
      throw new ServiceUnavailableException(`Razorpay payment link creation failed: ${body?.error?.description ?? res.statusText}`);
    }
    return { linkId: body.id, shortUrl: body.short_url, status: body.status };
  }

  /** A refund of part or all of one captured Razorpay payment (https://razorpay.com/docs/api/refunds/create-normal/). */
  async createRefund(input: { razorpayPaymentId: string; amountPaise: number; receipt: string; notes?: Record<string, string> }): Promise<{ refundId: string; status: string; amountPaise: number }> {
    const res = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(input.razorpayPaymentId)}/refund`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ amount: input.amountPaise, receipt: input.receipt, ...(input.notes ? { notes: input.notes } : {}) })
    });
    const body = await res.json();
    if (!res.ok) {
      throw new ServiceUnavailableException(`Razorpay refund failed: ${body?.error?.description ?? res.statusText}`);
    }
    return { refundId: body.id, status: body.status, amountPaise: body.amount };
  }

  /** Payments made on one QR code (https://razorpay.com/docs/api/qr-codes/fetch-payments/). Only this QR is looked at, never the whole account. */
  async listQrPayments(qrId: string): Promise<{ id: string; amount: number; currency: string; status: string }[]> {
    const res = await fetch(`https://api.razorpay.com/v1/payments/qr_codes/${encodeURIComponent(qrId)}/payments`, { method: 'GET', headers: this.headers() });
    const body = await res.json();
    if (!res.ok) {
      throw new ServiceUnavailableException(`Razorpay QR payment lookup failed: ${body?.error?.description ?? res.statusText}`);
    }
    return Array.isArray(body?.items) ? body.items : [];
  }

  /** Razorpay signs webhooks as hex(HMAC-SHA256(rawBody, webhookSecret)) in the X-Razorpay-Signature header. */
  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
    const secret = this.config.get<string>('RAZORPAY_WEBHOOK_SECRET');
    if (!secret) {
      throw new ServiceUnavailableException('RAZORPAY_WEBHOOK_SECRET is not configured on this server');
    }
    const expected = Buffer.from(createHmac('sha256', secret).update(rawBody).digest('hex'));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  }
}
