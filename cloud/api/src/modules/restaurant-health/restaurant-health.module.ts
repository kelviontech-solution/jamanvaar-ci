import { Module } from '@nestjs/common';
import { RestaurantHealthController } from './restaurant-health.controller';
import { RestaurantHealthService } from './restaurant-health.service';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';

@Module({
  imports: [PlatformAuthModule],
  controllers: [RestaurantHealthController],
  providers: [RestaurantHealthService]
})
export class RestaurantHealthModule {}
