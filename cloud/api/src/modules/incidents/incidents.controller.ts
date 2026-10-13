import { Body, Controller, Get, Param, Patch, Post, UseGuards, UsePipes } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { IncidentsService } from './incidents.service';
import { createIncidentSchema, CreateIncidentDto, addIncidentUpdateSchema, AddIncidentUpdateDto } from './dto/incident.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';

/** Routed under /platform/telemetry so it inherits the existing 'ops' RBAC area, same as System Telemetry and Backups. */
@Controller('api/v1/platform/telemetry/incidents')
@UseGuards(PlatformAuthGuard)
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Get()
  list() {
    return this.incidents.list();
  }

  @Post()
  @UsePipes(new ZodValidationPipe(createIncidentSchema))
  open(@Body() body: CreateIncidentDto, @CurrentPlatformUser() actor: PlatformUser) {
    return this.incidents.open(body, actor);
  }

  @Patch(':id/updates')
  @UsePipes(new ZodValidationPipe(addIncidentUpdateSchema))
  addUpdate(@Param('id') id: string, @Body() body: AddIncidentUpdateDto, @CurrentPlatformUser() actor: PlatformUser) {
    return this.incidents.addUpdate(id, body, actor);
  }
}
