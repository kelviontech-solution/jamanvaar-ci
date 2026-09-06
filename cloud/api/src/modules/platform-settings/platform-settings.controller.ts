import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { PlatformSettingsService } from './platform-settings.service';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';

@Controller('api/v1/platform/settings')
@UseGuards(PlatformAuthGuard)
export class PlatformSettingsController {
  constructor(private readonly settings: PlatformSettingsService) {}

  @Get()
  getAll() {
    return this.settings.getAll();
  }

  @Patch(':key')
  update(
    @Param('key') key: string,
    @Body() body: { value: any },
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.settings.updateSetting(key, body.value, actor);
  }
}
