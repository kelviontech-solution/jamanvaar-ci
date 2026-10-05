import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { BrandingService } from '../platform-settings/branding.service';

/**
 * Transactional email — previously nonexistent anywhere in the platform:
 * "Resend Invite" and the initial owner invite only ever stamped a
 * timestamp and wrote an audit log row, no message ever left the server.
 *
 * Same graceful-degradation shape as BackupStorageService for the S3
 * config: `configured` is checked up front, and callers that create a
 * restaurant/resend an invite must keep working (an operator can always
 * relay the activation token manually) when SMTP isn't set up yet — this
 * only throws if SMTP *is* configured but sending actually fails, since
 * that's a real misconfiguration worth surfacing loudly rather than a
 * normal, expected fallback path.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly branding: BrandingService
  ) {}

  get configured(): boolean {
    return Boolean(
      this.config.get<string>('SMTP_HOST') &&
        this.config.get<string>('SMTP_USER') &&
        this.config.get<string>('SMTP_PASSWORD')
    );
  }

  private getTransporter(): nodemailer.Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: this.config.get<string>('SMTP_HOST'),
        port: Number(this.config.get<string>('SMTP_PORT') ?? 587),
        secure: this.config.get<string>('SMTP_SECURE') === 'true',
        auth: {
          user: this.config.get<string>('SMTP_USER'),
          pass: this.config.get<string>('SMTP_PASSWORD')
        }
      });
    }
    return this.transporter;
  }

  /** Returns whether a message actually left the server — never a silent guess. */
  async send(
    to: string,
    subject: string,
    html: string,
    attachments?: Array<{ filename: string; content: Buffer; contentType: string }>
  ): Promise<boolean> {
    if (!this.configured) {
      this.logger.warn(`Email not sent (SMTP not configured on this server): "${subject}" to ${to}`);
      return false;
    }
    const fromName = this.config.get<string>('SMTP_FROM_NAME') ?? 'JAMANVAAR';
    const fromEmail = this.config.get<string>('SMTP_FROM_EMAIL') ?? this.config.get<string>('SMTP_USER');
    const footer = await this.branding.emailFooter();
    await this.getTransporter().sendMail({ from: `"${fromName}" <${fromEmail}>`, to, subject, html: html + footer, attachments });
    return true;
  }
}
