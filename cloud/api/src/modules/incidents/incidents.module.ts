import { Module } from '@nestjs/common';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PlatformAuthModule, AuditModule],
  controllers: [IncidentsController],
  providers: [IncidentsService]
})
export class IncidentsModule {}
