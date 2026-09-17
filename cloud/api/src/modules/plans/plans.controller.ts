import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { PlansService } from './plans.service';
import { createPlanSchema, updatePlanSchema } from './dto/plan.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';

@Controller('api/v1/plans')
@UseGuards(PlatformAuthGuard)
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  list(@Query('excludeTestFixtures') excludeTestFixtures?: string) {
    return this.plans.list({ excludeTestFixtures: excludeTestFixtures === 'true' });
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.plans.getById(id);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(createPlanSchema))
  create(@Body() body: ReturnType<typeof createPlanSchema.parse>, @CurrentPlatformUser() actor: PlatformUser) {
    return this.plans.create(body, actor);
  }

  @Patch(':id')
  @UsePipes(new ZodValidationPipe(updatePlanSchema))
  update(
    @Param('id') id: string,
    @Body() body: ReturnType<typeof updatePlanSchema.parse>,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.plans.update(id, body, actor);
  }

  @Patch(':id/activate')
  activate(@Param('id') id: string, @CurrentPlatformUser() actor: PlatformUser) {
    return this.plans.setStatus(id, 'ACTIVE', actor);
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string, @CurrentPlatformUser() actor: PlatformUser) {
    return this.plans.setStatus(id, 'INACTIVE', actor);
  }
}
