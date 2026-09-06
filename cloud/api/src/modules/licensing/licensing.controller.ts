import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { LicensingService } from './licensing.service';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';

/**
 * Super-Admin-issued offline license certificates (ENT-001 fix). Lets an operator
 * generate a signed, portable credential for a restaurant that has no live cloud
 * connection — the restaurant's local app verifies it cryptographically instead
 * of trusting a plaintext tier string.
 */
@Controller('api/v1/restaurants/:id/license-certificate')
@UseGuards(PlatformAuthGuard)
export class LicensingController {
  constructor(private readonly licensing: LicensingService) {}

  @Get()
  issue(@Param('id') restaurantId: string, @CurrentPlatformUser() actor: PlatformUser) {
    return this.licensing.issueCertificate(restaurantId, actor);
  }
}
