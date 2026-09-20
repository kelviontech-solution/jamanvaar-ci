import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SETTING_DEFAULTS } from './setting-schemas';

export interface SellerEntity {
  name: string;
  legalName: string;
  address: string;
  city: string;
  state: string;
  country: string;
  pincode: string;
  gstin: string;
  sacCode: string;
  sacDescription: string;
  supportEmail: string;
  supportPhone: string;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankIfsc: string;
  upiId: string;
}

export interface PlatformBranding {
  platformName: string;
  companyName: string;
  supportEmail: string;
  supportPhone: string;
}

const TTL_MS = 15_000;
const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ESCAPES[c]);

/**
 * The single reader of the branding and billing settings (BUG-092): invoices, receipts and emails ask
 * here instead of carrying their own copy of the company's details. Missing or partial rows fall back
 * to the defaults, so a fresh install still produces a complete invoice.
 */
@Injectable()
export class BrandingService {
  private cache: { at: number; branding: PlatformBranding; seller: SellerEntity } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  invalidate() {
    this.cache = null;
  }

  private async load() {
    if (this.cache && Date.now() - this.cache.at < TTL_MS) return this.cache;
    const rows = await this.prisma.platformDb.platformSetting.findMany({ where: { key: { in: ['platform.branding', 'platform.billing'] } } });
    const stored = (key: string) => (rows.find((r) => r.key === key)?.value as Record<string, string> | undefined) ?? {};
    const branding = { ...SETTING_DEFAULTS['platform.branding'], ...stored('platform.branding') } as unknown as PlatformBranding;
    const billing = { ...SETTING_DEFAULTS['platform.billing'], ...stored('platform.billing') } as Record<string, string>;
    const seller: SellerEntity = {
      name: billing.tradeName,
      legalName: billing.legalName,
      address: billing.address,
      city: billing.city,
      state: billing.state,
      country: billing.country,
      pincode: billing.pincode,
      gstin: billing.gstin,
      sacCode: billing.sacCode,
      sacDescription: billing.sacDescription,
      supportEmail: billing.billingEmail || branding.supportEmail,
      supportPhone: branding.supportPhone,
      bankName: billing.bankName,
      bankAccountName: billing.bankAccountName,
      bankAccountNumber: billing.bankAccountNumber,
      bankIfsc: billing.bankIfsc,
      upiId: billing.upiId
    };
    this.cache = { at: Date.now(), branding, seller };
    return this.cache;
  }

  async seller(): Promise<SellerEntity> {
    return (await this.load()).seller;
  }

  async branding(): Promise<PlatformBranding> {
    return (await this.load()).branding;
  }

  /** Appended to every transactional email so a recipient always knows who to contact. */
  async emailFooter(): Promise<string> {
    const b = await this.branding();
    const contact = [b.supportEmail && esc(b.supportEmail), b.supportPhone && esc(b.supportPhone)].filter(Boolean).join(' · ');
    return `<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 24px auto 0; padding-top: 12px; border-top: 1px solid #e2e8f0; color: #7a8b9e; font-size: 12px;">Sent by ${esc(b.companyName)}.${contact ? ` Questions? ${contact}` : ''}</div>`;
  }
}
