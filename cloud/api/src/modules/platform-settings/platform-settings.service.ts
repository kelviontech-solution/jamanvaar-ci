import { Injectable, NotFoundException } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class PlatformSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async getAll() {
    return this.prisma.runAsPlatform(async (tx) => {
      const settings = await tx.platformSetting.findMany({
        orderBy: { category: 'asc' }
      });
      return settings;
    });
  }

  async getByKey(key: string) {
    return this.prisma.runAsPlatform(async (tx) => {
      const setting = await tx.platformSetting.findUnique({ where: { key } });
      if (!setting) throw new NotFoundException(`Setting ${key} not found`);
      return setting;
    });
  }

  async updateSetting(key: string, value: any, actor: PlatformUser) {
    return this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.platformSetting.findUnique({ where: { key } });
      if (!existing) throw new NotFoundException(`Setting ${key} not found`);

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

      return updated;
    });
  }
}
