import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BrandingService } from './branding.service';
import { SETTING_DEFAULTS, SETTING_SCHEMAS } from './setting-schemas';
import { WelcomeDesignsService } from './welcome-designs.service';
import { WelcomePolicy, WELCOME_POLICY_KEY } from './welcome-policy';

const SETTING_CATEGORY: Record<string, { category: string; description: string }> = {
  'platform.kioskWelcome': { category: 'CATALOG', description: 'Kiosk welcome design access and restaurant limits' },
  'platform.billing': { category: 'BILLING', description: 'Seller details printed on invoices and receipts' }
};

@Injectable()
export class PlatformSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly branding: BrandingService,
    private readonly welcome: WelcomeDesignsService
  ) {}

  async getAll() {
    return this.prisma.runAsPlatform(async (tx) => {
      const settings = await tx.platformSetting.findMany({
        where: { NOT: [{ key: { startsWith: 'welcome.asset.' } }, { key: { startsWith: 'welcome.design.' } }] },
        orderBy: { category: 'asc' }
      });
      // Settings added after an install was seeded show their defaults until first saved.
      const missing = Object.entries(SETTING_CATEGORY)
        .filter(([key]) => !settings.some((s) => s.key === key))
        .map(([key, meta]) => ({ id: `default:${key}`, key, value: SETTING_DEFAULTS[key], category: meta.category, description: meta.description, updatedBy: null, updatedAt: new Date(0), createdAt: new Date(0) }));
      return [...settings, ...missing];
    });
  }

  async getByKey(key: string) {
    return this.prisma.runAsPlatform(async (tx) => {
      const setting = await tx.platformSetting.findUnique({ where: { key } });
      if (!setting) throw new NotFoundException(`Setting ${key} not found`);
      return setting;
    });
  }

  async updateSetting(key: string, rawValue: unknown, actor: PlatformUser) {
    const schema = SETTING_SCHEMAS[key];
    if (!schema) throw new BadRequestException(`Setting ${key} cannot be edited here`);
    if (rawValue === null || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
      throw new BadRequestException('A setting value must be an object');
    }

    return this.prisma.runAsPlatform(async (tx) => {
      let existing = await tx.platformSetting.findUnique({ where: { key } });
      if (!existing) {
        // A setting introduced after the install was seeded starts from its defaults on first save.
        const meta = SETTING_CATEGORY[key];
        if (!meta) throw new NotFoundException(`Setting ${key} not found`);
        existing = await tx.platformSetting.create({ data: { key, value: SETTING_DEFAULTS[key] as object, category: meta.category, description: meta.description } });
      }

      // A PATCH changes the fields it sends and keeps the rest, then the WHOLE result must be valid.
      // (Replacing the value outright would silently drop any field the caller left out.)
      const merged = { ...(SETTING_DEFAULTS[key] ?? {}), ...((existing.value as Record<string, unknown> | null) ?? {}), ...(rawValue as Record<string, unknown>) };
      const parsed = schema.safeParse(merged);
      if (!parsed.success) {
        throw new BadRequestException({
          statusCode: 400,
          message: parsed.error.issues[0]?.message ?? 'Invalid value',
          issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
        });
      }
      const value = parsed.data;
      if (key === WELCOME_POLICY_KEY) await this.welcome.validatePolicy(value as WelcomePolicy);

      const updated = await tx.platformSetting.update({
        where: { key },
        data: {
          value,
          updatedBy: actor.id
        }
      });

      await this.audit.log(
        {
          actorType: 'PLATFORM',
          actorId: actor.id,
          action: 'PLATFORM_SETTING_UPDATED',
          category: 'SETTINGS',
          details: { key, oldValue: existing.value, newValue: value }
        },
        tx
      );

      this.branding.invalidate();
      return updated;
    });
  }
}
