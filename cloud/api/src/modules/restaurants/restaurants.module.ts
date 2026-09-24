import { Module } from '@nestjs/common';
import { RestaurantsController } from './restaurants.controller';
import { RestaurantLookupController } from './restaurant-lookup.controller';
import { RestaurantsService } from './restaurants.service';
import { AuditModule } from '../audit/audit.module';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';
import { EntitySyncModule } from '../entity-sync/entity-sync.module';

@Module({
  imports: [AuditModule, PlatformAuthModule, EntitySyncModule],
  controllers: [RestaurantsController, RestaurantLookupController],
  providers: [RestaurantsService],
  exports: [RestaurantsService]
})
export class RestaurantsModule {}
