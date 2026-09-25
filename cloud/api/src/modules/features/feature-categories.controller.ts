import { Body, Controller, Get, Param, Patch, Post, UseGuards, UsePipes } from '@nestjs/common';
import { FeatureCategoriesService } from './feature-categories.service';
import { createFeatureCategorySchema, updateFeatureCategorySchema } from './dto/feature-category.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';

@Controller('api/v1/feature-categories')
@UseGuards(PlatformAuthGuard)
export class FeatureCategoriesController {
  constructor(private readonly categories: FeatureCategoriesService) {}

  @Get()
  list() {
    return this.categories.list();
  }

  @Post()
  @UsePipes(new ZodValidationPipe(createFeatureCategorySchema))
  create(@Body() body: ReturnType<typeof createFeatureCategorySchema.parse>) {
    return this.categories.create(body);
  }

  @Patch(':id')
  @UsePipes(new ZodValidationPipe(updateFeatureCategorySchema))
  update(@Param('id') id: string, @Body() body: ReturnType<typeof updateFeatureCategorySchema.parse>) {
    return this.categories.update(id, body);
  }
}
