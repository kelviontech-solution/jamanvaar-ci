import { Body, Controller, Get, Param, Post, UseGuards, UsePipes } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { ApplicationsService } from './applications.service';
import { publishReleaseSchema } from './dto/application.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';

@Controller('api/v1/applications')
@UseGuards(PlatformAuthGuard)
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Get()
  list() {
    return this.applications.list();
  }

  @Get(':appCode/releases')
  getReleases(@Param('appCode') appCode: string) {
    return this.applications.getReleases(appCode);
  }

  @Post('releases')
  @UsePipes(new ZodValidationPipe(publishReleaseSchema))
  publish(
    @Body() body: ReturnType<typeof publishReleaseSchema.parse>,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.applications.publishRelease(body, actor);
  }
}
