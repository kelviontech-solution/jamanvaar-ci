import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateFeatureCategoryDto, UpdateFeatureCategoryDto } from './dto/feature-category.dto';

@Injectable()
export class FeatureCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.runAsPlatform((tx) =>
      tx.featureCategory.findMany({ orderBy: { sortOrder: 'asc' }, include: { features: true } })
    );
  }

  async create(dto: CreateFeatureCategoryDto) {
    return this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.featureCategory.findUnique({ where: { code: dto.code } });
      if (existing) throw new ConflictException(`A feature category with code "${dto.code}" already exists`);
      return tx.featureCategory.create({ data: dto });
    });
  }

  async update(id: string, dto: UpdateFeatureCategoryDto) {
    return this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.featureCategory.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Feature category not found');
      return tx.featureCategory.update({ where: { id }, data: dto });
    });
  }
}
