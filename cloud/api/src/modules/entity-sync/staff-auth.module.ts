import { Module } from '@nestjs/common';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { DbCounters } from '../../common/db-counters';
import { AuditModule } from '../audit/audit.module';
import { StaffApprovalController } from './staff-approval.controller';
import { StaffApprovalService } from './staff-approval.service';
import { StaffSessionService } from './staff-session.service';

/** Who is at a terminal: staff sign-in, manager approval, and the signed tokens that prove both to the rest of the API. */
@Module({
  imports: [AuditModule],
  controllers: [StaffApprovalController],
  providers: [StaffApprovalService, StaffSessionService, DbCounters, DeviceAuthGuard],
  exports: [StaffSessionService]
})
export class StaffAuthModule {}
