import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { ActivationKeysService } from './activation-keys.service';
import { bulkKeysSchema, bulkRevokeKeysSchema, generateActivationKeySchema, reactivateKeySchema } from './dto/activation-key.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';
import { PlatformRoleName } from '../../common/rbac/access';

@Controller('api/v1/activation-keys')
@UseGuards(PlatformAuthGuard)
export class ActivationKeysController {
  constructor(private readonly activationKeys: ActivationKeysService) {}

  @Get()
  list(@Query() query: Record<string, string>, @CurrentPlatformUser() actor: PlatformUser) {
    return this.activationKeys.list(query, actor.role as PlatformRoleName);
  }

  @Get('by-restaurant')
  byRestaurant(@Query() query: Record<string, string>) {
    return this.activationKeys.byRestaurant(query);
  }

  @Post('bulk-revoke')
  @UsePipes(new ZodValidationPipe(bulkRevokeKeysSchema))
  bulkRevoke(@Body() body: ReturnType<typeof bulkRevokeKeysSchema.parse>, @CurrentPlatformUser() actor: PlatformUser) {
    return this.activationKeys.bulkRevoke(body.ids, actor);
  }

  @Post('bulk-delete')
  @UsePipes(new ZodValidationPipe(bulkKeysSchema))
  bulkDelete(@Body() body: ReturnType<typeof bulkKeysSchema.parse>, @CurrentPlatformUser() actor: PlatformUser) {
    return this.activationKeys.bulkRemove(body.ids, actor);
  }

  @Post('bulk-reactivate')
  @UsePipes(new ZodValidationPipe(bulkKeysSchema))
  bulkReactivate(@Body() body: ReturnType<typeof bulkKeysSchema.parse>, @CurrentPlatformUser() actor: PlatformUser) {
    return this.activationKeys.bulkReactivate(body.ids, actor);
  }

  @Get(':id')
  detail(@Param('id') id: string, @CurrentPlatformUser() actor: PlatformUser) {
    return this.activationKeys.getById(id, actor.role as PlatformRoleName);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(generateActivationKeySchema))
  generate(
    @Body() body: ReturnType<typeof generateActivationKeySchema.parse>,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.activationKeys.generate(body, actor);
  }

  @Patch(':id/revoke')
  revoke(@Param('id') id: string, @CurrentPlatformUser() actor: PlatformUser) {
    return this.activationKeys.revoke(id, actor);
  }

  @Patch(':id/reactivate')
  reactivate(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reactivateKeySchema)) body: ReturnType<typeof reactivateKeySchema.parse>,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.activationKeys.reactivate(id, actor, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentPlatformUser() actor: PlatformUser) {
    return this.activationKeys.remove(id, actor);
  }
}
