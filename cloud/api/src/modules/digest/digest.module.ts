import { Module } from '@nestjs/common';
import { DigestService } from './digest.service';
import { DashboardModule } from '../dashboard/dashboard.module';

@Module({
  imports: [DashboardModule],
  providers: [DigestService],
  exports: [DigestService]
})
export class DigestModule {}
