import { Body, Controller, Get, Param, Patch, Post, UseGuards, UsePipes } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { AnnouncementsService } from './announcements.service';
import { createAnnouncementSchema, CreateAnnouncementDto } from './dto/announcement.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';

/** Routed under /platform/settings so it inherits the existing 'settings' RBAC area (Platform Owner write, Super Admin read-only — a broadcast to every restaurant owner is an owner-level action). */
@Controller('api/v1/platform/settings/announcements')
@UseGuards(PlatformAuthGuard)
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  list() {
    return this.announcements.list();
  }

  @Post()
  @UsePipes(new ZodValidationPipe(createAnnouncementSchema))
  create(@Body() body: CreateAnnouncementDto, @CurrentPlatformUser() actor: PlatformUser) {
    return this.announcements.create(body, actor);
  }

  @Patch(':id/withdraw')
  withdraw(@Param('id') id: string, @CurrentPlatformUser() actor: PlatformUser) {
    return this.announcements.withdraw(id, actor);
  }
}
