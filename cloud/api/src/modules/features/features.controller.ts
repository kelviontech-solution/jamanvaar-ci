import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, UsePipes } from '@nestjs/common';
import { FeaturesService } from './features.service';
import { createFeatureSchema, updateFeatureSchema } from './dto/feature.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';

@Controller('api/v1/features')
@UseGuards(PlatformAuthGuard)
export class FeaturesController {
  constructor(private readonly features: FeaturesService) {}

  @Get()
  list() {
    return this.features.list();
  }

  @Post()
  @UsePipes(new ZodValidationPipe(createFeatureSchema))
  create(@Body() body: ReturnType<typeof createFeatureSchema.parse>) {
    return this.features.create(body);
  }

  @Patch(':id')
  @UsePipes(new ZodValidationPipe(updateFeatureSchema))
  update(@Param('id') id: string, @Body() body: ReturnType<typeof updateFeatureSchema.parse>) {
    return this.features.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.features.remove(id);
  }
}
