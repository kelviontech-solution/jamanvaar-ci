import { upstreamJson } from '../../common/upstream-fetch';
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

  publicKey() { return this.config.get<string>('RAZORPAY_KEY_ID') ?? ''; }
  mode() { return this.publicKey().startsWith('rzp_test_') ? 'TEST' : this.publicKey().startsWith('rzp_live_') ? 'LIVE' : 'UNKNOWN'; }

  async createCheckoutOrder(input: { reference: string; amount: number; currency: string }) {
    const { response, body } = await upstreamJson('https://api.razorpay.com/v1/orders', { method: 'POST', headers: this.headers(), body: JSON.stringify({ amount: input.amount, currency: input.currency, receipt: input.reference, notes: { payment_ref: input.reference } }) });
    if (!response.ok || typeof body?.id !== 'string' || !body.id.startsWith('order_') || body.amount !== input.amount || body.currency !== input.currency) throw new ServiceUnavailableException('Secure checkout could not be opened. Check payment status before retrying.');
    return body as { id: string; amount: number; currency: string; receipt: string };
  }

  /** Recover a timed-out create by its unique receipt. Never mint a new reference for an unknown outcome. */
  async findCheckoutOrder(reference: string, since: Date) {
    for (let skip = 0; skip < 1000; skip += 100) {
      const { response, body } = await upstreamJson(`https://api.razorpay.com/v1/orders?from=${Math.floor(since.getTime() / 1000) - 60}&count=100&skip=${skip}`, { method: 'GET', headers: this.headers() });
      if (!response.ok || !Array.isArray(body?.items)) throw new ServiceUnavailableException('The previous payment attempt could not be checked.');
      const found = body.items.find((o: any) => o.receipt === reference && o.notes?.payment_ref === reference);
      if (found) return found as { id: string; amount: number; currency: string; receipt: string };
      if (body.items.length < 100) break;
    }
    throw new ServiceUnavailableException('The previous checkout result is unknown. Please check again or ask staff; a second charge has not been started.');
  }

  async fetchCheckoutPayments(orderId: string): Promise<Array<{ id: string; order_id: string; amount: number; currency: string; status: string }>> {
    const { response, body } = await upstreamJson(`https://api.razorpay.com/v1/orders/${encodeURIComponent(orderId)}/payments`, { method: 'GET', headers: this.headers() });
    if (!response.ok || !Array.isArray(body?.items)) throw new ServiceUnavailableException('Payment status could not be checked. Please try again.');
    return body.items;
  }

  verifyCheckoutSignature(orderId: string, paymentId: string, signature: string) {
    const secret = this.config.get<string>('RAZORPAY_KEY_SECRET');
    if (!secret || !/^[a-f0-9]{64}$/i.test(signature)) return false;
    const expected = createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest();
    return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
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
    const { response: res, body } = await upstreamJson('https://api.razorpay.com/v1/payments/qr_codes', {
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
  async createPaymentLink(input: { referenceId: string; amountPaise: number; description: string; customerName: string; customerPhone: string; expireByUnix: number; currency?: string; callbackUrl?: string }): Promise<{ linkId: string; shortUrl: string; status: string }> {
    const name = input.customerName.trim();
    const contact = input.customerPhone.trim().replace(/[\s-]/g, '');
    const customer = { ...(name ? { name } : {}), ...(contact ? { contact } : {}) };
    const { response: res, body } = await upstreamJson('https://api.razorpay.com/v1/payment_links', {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        amount: input.amountPaise,
        currency: input.currency ?? 'INR',
        accept_partial: false,
        description: input.description,
        reference_id: input.referenceId,
        // Guest details are optional. Razorpay rejects an empty customer object.
        ...(Object.keys(customer).length ? { customer } : {}),
        notify: { sms: false, email: false },
        reminder_enable: false,
        expire_by: input.expireByUnix,
        ...(input.callbackUrl ? { callback_url: input.callbackUrl, callback_method: 'get' } : {})
      })
    });
    if (!res.ok) {
      throw new ServiceUnavailableException({ code: [400, 422].includes(res.status) ? 'PAYMENT_LINK_REJECTED' : 'UPSTREAM_RESULT_UNKNOWN', message: `Razorpay payment link creation failed: ${body?.error?.description ?? res.statusText}` });
    }
    if (typeof body.id !== 'string' || !body.id.startsWith('plink_') || typeof body.short_url !== 'string' || !body.short_url.startsWith('https://')) throw new ServiceUnavailableException({ code: 'UPSTREAM_RESULT_UNKNOWN', message: 'Checkout could not be confirmed. Check payment status before trying again.' });
    return { linkId: body.id, shortUrl: body.short_url, status: body.status };
  }

  async fetchPaymentLink(id: string): Promise<{ id: string; reference_id: string; amount: number; amount_paid: number; currency: string; status: string; payments?: Array<{ payment_id: string; amount: number; status: string }> }> {
    const { response, body } = await upstreamJson(`https://api.razorpay.com/v1/payment_links/${encodeURIComponent(id)}`, { method: 'GET', headers: this.headers() });
    if (!response.ok) throw new ServiceUnavailableException('Payment status could not be checked. Please try again.');
    return body;
  }

  /** Recover an ambiguous create without changing its unique provider reference. */
  async findPaymentLink(referenceId: string): Promise<{ id: string; reference_id: string; amount: number; currency: string; short_url: string; status: string; expire_by?: number } | null> {
    const { response, body } = await upstreamJson(`https://api.razorpay.com/v1/payment_links/?reference_id=${encodeURIComponent(referenceId)}`, { method: 'GET', headers: this.headers() });
    if (!response.ok) throw new ServiceUnavailableException('The previous payment attempt could not be checked. Please try again.');
    if (!Array.isArray(body.payment_links) && typeof body.id !== 'string') throw new ServiceUnavailableException('The previous payment attempt returned an unreadable status. Please try again.');
    const links = Array.isArray(body.payment_links) ? body.payment_links : body.id ? [body] : [];
    return links.find((link: { reference_id?: string }) => link.reference_id === referenceId) ?? null;
  }

  async cancelPaymentLink(id: string): Promise<{ id: string; status: string; amount_paid: number }> {
    const { response, body } = await upstreamJson(`https://api.razorpay.com/v1/payment_links/${encodeURIComponent(id)}/cancel`, { method: 'POST', headers: this.headers() });
    if (!response.ok) throw new ServiceUnavailableException('The online payment could not be closed safely. Check its status before paying at the counter.');
    return body;
  }

  /** A refund of part or all of one captured Razorpay payment (https://razorpay.com/docs/api/refunds/create-normal/). */
  async createRefund(input: { razorpayPaymentId: string; amountPaise: number; receipt: string; notes?: Record<string, string> }): Promise<{ refundId: string; status: string; amountPaise: number }> {
    const { response: res, body } = await upstreamJson(`https://api.razorpay.com/v1/payments/${encodeURIComponent(input.razorpayPaymentId)}/refund`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ amount: input.amountPaise, receipt: input.receipt, ...(input.notes ? { notes: input.notes } : {}) })
    });
    if (!res.ok) {
      throw new ServiceUnavailableException(`Razorpay refund failed: ${body?.error?.description ?? res.statusText}`);
    }
    return { refundId: body.id, status: body.status, amountPaise: body.amount };
  }

  /** Payments made on one QR code (https://razorpay.com/docs/api/qr-codes/fetch-payments/). Only this QR is looked at, never the whole account. */
  async listQrPayments(qrId: string): Promise<{ id: string; amount: number; currency: string; status: string }[]> {
    const { response: res, body } = await upstreamJson(`https://api.razorpay.com/v1/payments/qr_codes/${encodeURIComponent(qrId)}/payments`, { method: 'GET', headers: this.headers() });
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
