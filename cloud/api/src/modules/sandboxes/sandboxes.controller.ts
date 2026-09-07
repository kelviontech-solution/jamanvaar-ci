import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { CreateSandboxDto, SandboxesService } from './sandboxes.service';

@Controller('api/v1/platform/sandboxes')
@UseGuards(PlatformAuthGuard)
export class SandboxesController {
  constructor(private readonly sandboxesService: SandboxesService) {}

  @Get()
  list() {
    return this.sandboxesService.list();
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.sandboxesService.getById(id);
  }

  @Post()
  create(@Body() dto: CreateSandboxDto, @CurrentPlatformUser() actor: PlatformUser) {
    return this.sandboxesService.create(dto, actor);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentPlatformUser() actor: PlatformUser) {
    return this.sandboxesService.delete(id, actor);
  }
}
