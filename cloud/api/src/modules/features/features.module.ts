import { Module } from '@nestjs/common';
import { FeatureCategoriesController } from './feature-categories.controller';
import { FeatureCategoriesService } from './feature-categories.service';
import { FeaturesController } from './features.controller';
import { FeaturesService } from './features.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';

@Module({
  imports: [PrismaModule, PlatformAuthModule],
  controllers: [FeatureCategoriesController, FeaturesController],
  providers: [FeatureCategoriesService, FeaturesService]
})
export class FeaturesModule {}
