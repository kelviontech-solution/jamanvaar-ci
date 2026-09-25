import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateFeatureDto, UpdateFeatureDto } from './dto/feature.dto';

type TxClient = Prisma.TransactionClient;

@Injectable()
export class FeaturesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.runAsPlatform((tx) => tx.feature.findMany({ orderBy: { code: 'asc' }, include: { category: true } }));
  }

  private async assertDependenciesExist(tx: TxClient, ids: string[]) {
    if (ids.length === 0) return;
    const found = await tx.feature.findMany({ where: { id: { in: ids } }, select: { id: true } });
    const foundIds = new Set(found.map((f) => f.id));
    const missing = ids.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(`dependsOnFeatureIds references a feature that does not exist: ${missing.join(', ')}`);
    }
  }

  async create(dto: CreateFeatureDto) {
    return this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.feature.findUnique({ where: { code: dto.code } });
      if (existing) throw new ConflictException(`A feature with code "${dto.code}" already exists`);
      await this.assertDependenciesExist(tx, dto.dependsOnFeatureIds ?? []);
      return tx.feature.create({
        data: {
          code: dto.code,
          name: dto.name,
          description: dto.description,
          categoryId: dto.categoryId,
          appCode: dto.appCode ?? null,
          defaultDeviceQuota: dto.defaultDeviceQuota ?? null,
          dependsOnFeatureIds: dto.dependsOnFeatureIds ?? []
        }
      });
    });
  }

  async update(id: string, dto: UpdateFeatureDto) {
    return this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.feature.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Feature not found');
      if (dto.dependsOnFeatureIds) await this.assertDependenciesExist(tx, dto.dependsOnFeatureIds);
      return tx.feature.update({ where: { id }, data: dto });
    });
  }

  async remove(id: string) {
    return this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.feature.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Feature not found');
      if (existing.isActive) {
        throw new BadRequestException('Deactivate this feature (isActive: false) before deleting it');
      }
      const dependents = await tx.feature.findMany({ where: { dependsOnFeatureIds: { has: id } } });
      if (dependents.length > 0) {
        throw new ConflictException(
          `This feature is required by ${dependents.length} other feature${dependents.length === 1 ? '' : 's'} (${dependents.map((d) => d.name).join(', ')}). Remove that dependency first.`
        );
      }
      await tx.feature.delete({ where: { id } });
      return { success: true };
    });
  }
}
