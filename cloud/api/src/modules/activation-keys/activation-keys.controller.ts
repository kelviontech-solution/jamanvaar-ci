import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { ActivationKeysService } from './activation-keys.service';
import { bulkRevokeKeysSchema, generateActivationKeySchema } from './dto/activation-key.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';

@Controller('api/v1/activation-keys')
@UseGuards(PlatformAuthGuard)
export class ActivationKeysController {
  constructor(private readonly activationKeys: ActivationKeysService) {}

  @Get()
  list(@Query() query: Record<string, string>) {
    return this.activationKeys.list(query);
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

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.activationKeys.getById(id);
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
}
