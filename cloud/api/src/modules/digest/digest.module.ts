import { Module } from '@nestjs/common';
import { DigestService } from './digest.service';
import { RestaurantDigestService } from './restaurant-digest.service';
import { DashboardModule } from '../dashboard/dashboard.module';

@Module({
  imports: [DashboardModule],
  providers: [DigestService, RestaurantDigestService],
  exports: [DigestService, RestaurantDigestService]
})
export class DigestModule {}
