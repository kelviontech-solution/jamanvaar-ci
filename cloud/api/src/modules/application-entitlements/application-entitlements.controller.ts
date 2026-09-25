import { Body, Controller, Get, Param, Patch, UseGuards, UsePipes } from '@nestjs/common';
import { AppCode, PlatformUser } from '@prisma/client';
import { ApplicationEntitlementsService } from './application-entitlements.service';
import { updateApplicationEntitlementSchema } from './dto/application-entitlement.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';
import { getFeatureCatalog } from './feature-catalog';
import { PrismaService } from '../../prisma/prisma.service';

// Two thin controllers sharing one service, each mounted under the resource
// it naturally belongs to (subscriptions/:id/applications for
// enable/disable + quota edits, restaurants/:id/applications as the
// convenience read the Restaurant Detail page's new Applications tab uses)
// rather than inventing a third top-level /application-entitlements route.
@Controller()
@UseGuards(PlatformAuthGuard)
export class SubscriptionApplicationsController {
  constructor(private readonly entitlements: ApplicationEntitlementsService) {}

  @Get('api/v1/subscriptions/:id/applications')
  listForSubscription(@Param('id') id: string) {
    return this.entitlements.listForSubscription(id);
  }

  @Patch('api/v1/subscriptions/:id/applications/:appCode')
  @UsePipes(new ZodValidationPipe(updateApplicationEntitlementSchema))
  update(
    @Param('id') id: string,
    @Param('appCode') appCode: AppCode,
    @Body() body: ReturnType<typeof updateApplicationEntitlementSchema.parse>,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.entitlements.update(id, appCode, body, actor);
  }
}

@Controller()
@UseGuards(PlatformAuthGuard)
export class RestaurantApplicationsController {
  constructor(private readonly entitlements: ApplicationEntitlementsService) {}

  @Get('api/v1/restaurants/:id/applications')
  listForRestaurant(@Param('id') id: string) {
    return this.entitlements.listForRestaurant(id);
  }
}

@Controller('api/v1/application-entitlements')
@UseGuards(PlatformAuthGuard)
export class ApplicationCatalogController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('catalog')
  getCatalog() {
    return this.prisma.runAsPlatform((tx) => getFeatureCatalog(tx));
  }
}
