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

  /**
   * The captured payment made against one of our references since `fromUnix`, found by its notes. Used when a
   * kiosk asks for a payment's status, so a paid QR is recognised even before Razorpay's webhook is configured.
   */
  async findCapturedPaymentByRef(paymentRef: string, fromUnix: number): Promise<{ id: string; amount: number; currency: string } | null> {
    const res = await fetch(`https://api.razorpay.com/v1/payments?from=${fromUnix}&count=100`, { method: 'GET', headers: this.headers() });
    const body = await res.json();
    if (!res.ok) {
      throw new ServiceUnavailableException(`Razorpay payment lookup failed: ${body?.error?.description ?? res.statusText}`);
    }
    const items: { id: string; amount: number; currency: string; status: string; notes?: Record<string, string> }[] = Array.isArray(body?.items) ? body.items : [];
    const match = items.find((p) => p.status === 'captured' && p.notes?.payment_ref === paymentRef);
    return match ? { id: match.id, amount: match.amount, currency: match.currency } : null;
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
