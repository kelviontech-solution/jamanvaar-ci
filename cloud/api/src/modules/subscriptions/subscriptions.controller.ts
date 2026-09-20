import { Body, Controller, Get, Param, Patch, Post, UseGuards, UsePipes } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { SubscriptionsService } from './subscriptions.service';
import { assignSubscriptionSchema, changePlanSchema, extendSchema, renewSchema } from './dto/subscription.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';

@Controller('api/v1/subscriptions')
@UseGuards(PlatformAuthGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get()
  list() {
    return this.subscriptions.list();
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.subscriptions.getById(id);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(assignSubscriptionSchema))
  assign(
    @Body() body: ReturnType<typeof assignSubscriptionSchema.parse>,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.subscriptions.assign(body, actor);
  }

  @Patch(':id/change-plan')
  @UsePipes(new ZodValidationPipe(changePlanSchema))
  changePlan(
    @Param('id') id: string,
    @Body() body: ReturnType<typeof changePlanSchema.parse>,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.subscriptions.changePlan(id, body.planId, actor);
  }

  @Patch(':id/renew')
  @UsePipes(new ZodValidationPipe(renewSchema))
  renew(
    @Param('id') id: string,
    @Body() body: ReturnType<typeof renewSchema.parse>,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.subscriptions.renew(id, body.expiresAt, actor);
  }

  @Patch(':id/extend')
  @UsePipes(new ZodValidationPipe(extendSchema))
  extend(
    @Param('id') id: string,
    @Body() body: ReturnType<typeof extendSchema.parse>,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.subscriptions.extend(id, body.days, actor);
  }

  @Patch(':id/suspend')
  suspend(@Param('id') id: string, @CurrentPlatformUser() actor: PlatformUser) {
    return this.subscriptions.setStatus(id, 'SUSPENDED', actor);
  }

  @Patch(':id/reactivate')
  reactivate(@Param('id') id: string, @CurrentPlatformUser() actor: PlatformUser) {
    return this.subscriptions.setStatus(id, 'ACTIVE', actor);
  }
}
