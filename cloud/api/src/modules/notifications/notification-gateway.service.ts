import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SendWhatsAppTemplateInput {
  phoneNumber: string;
  templateParams: string[];
}

export interface SendSmsInput {
  phoneNumber: string;
  templateParams: string[];
}

export interface NotificationSendResult {
  success: boolean;
  providerMessageId?: string;
  errorMessage?: string;
}

@Injectable()
export class NotificationGatewayService {
  constructor(private readonly config: ConfigService) {}

  isWhatsAppConfigured(): boolean {
    return Boolean(
      this.config.get<string>('WHATSAPP_CLOUD_API_TOKEN') &&
        this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID') &&
        this.config.get<string>('WHATSAPP_TEMPLATE_NAME')
    );
  }

  isSmsConfigured(): boolean {
    return Boolean(
      this.config.get<string>('MSG91_AUTH_KEY') && this.config.get<string>('MSG91_SMS_FLOW_ID')
    );
  }

  async sendWhatsAppTemplate(input: SendWhatsAppTemplateInput): Promise<NotificationSendResult> {
    if (!this.isWhatsAppConfigured()) {
      throw new ServiceUnavailableException(
        'WhatsApp is not configured on this server (set WHATSAPP_CLOUD_API_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TEMPLATE_NAME, and optionally WHATSAPP_TEMPLATE_LANGUAGE / WHATSAPP_API_VERSION)'
      );
    }
    const phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    const version = this.config.get<string>('WHATSAPP_API_VERSION') ?? 'v21.0';
    const res = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.get<string>('WHATSAPP_CLOUD_API_TOKEN')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: input.phoneNumber,
        type: 'template',
        template: {
          name: this.config.get<string>('WHATSAPP_TEMPLATE_NAME'),
          language: { code: this.config.get<string>('WHATSAPP_TEMPLATE_LANGUAGE') ?? 'en' },
          components: [
            {
              type: 'body',
              parameters: input.templateParams.map((text) => ({ type: 'text', text }))
            }
          ]
        }
      })
    });
    const body = await res.json();
    if (!res.ok) {
      return { success: false, errorMessage: body?.error?.message ?? `WhatsApp send failed (${res.status})` };
    }
    return { success: true, providerMessageId: body?.messages?.[0]?.id };
  }

  async sendSms(input: SendSmsInput): Promise<NotificationSendResult> {
    if (!this.isSmsConfigured()) {
      throw new ServiceUnavailableException(
        'SMS is not configured on this server (set MSG91_AUTH_KEY, MSG91_SMS_FLOW_ID, and optionally MSG91_SENDER_ID)'
      );
    }
    const recipient: Record<string, string> = { mobiles: input.phoneNumber };
    input.templateParams.forEach((value, i) => {
      recipient[`VAR${i + 1}`] = value;
    });
    const res = await fetch('https://api.msg91.com/api/v5/flow/', {
      method: 'POST',
      headers: { authkey: this.config.get<string>('MSG91_AUTH_KEY')!, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        flow_id: this.config.get<string>('MSG91_SMS_FLOW_ID'),
        sender: this.config.get<string>('MSG91_SENDER_ID') ?? undefined,
        recipients: [recipient]
      })
    });
    const body = await res.json();
    if (body?.type !== 'success') {
      return { success: false, errorMessage: body?.message ?? `SMS send failed (${res.status})` };
    }
    return { success: true, providerMessageId: body.message };
  }

  isQrLoyaltyOtpConfigured(): boolean {
    return Boolean(this.config.get<string>('MSG91_AUTH_KEY') && this.config.get<string>('QR_LOYALTY_MSG91_FLOW_ID'));
  }

  /** Dedicated approved OTP flow; never reuse an onboarding or receipt template for verification. */
  async sendQrLoyaltyOtp(phoneNumber: string, otp: string): Promise<NotificationSendResult> {
    if (!this.isQrLoyaltyOtpConfigured()) throw new ServiceUnavailableException('QR loyalty phone verification is not configured');
    const response = await fetch('https://api.msg91.com/api/v5/flow/', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { authkey: this.config.getOrThrow<string>('MSG91_AUTH_KEY'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ flow_id: this.config.getOrThrow<string>('QR_LOYALTY_MSG91_FLOW_ID'), sender: this.config.get<string>('MSG91_SENDER_ID') ?? undefined, recipients: [{ mobiles: phoneNumber, VAR1: otp }] })
    });
    const result = await response.json();
    return response.ok && result?.type === 'success' ? { success: true, providerMessageId: result.message } : { success: false, errorMessage: 'Verification message could not be delivered' };
  }
}
