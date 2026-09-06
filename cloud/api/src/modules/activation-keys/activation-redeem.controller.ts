import { Body, Controller, Post, UsePipes } from '@nestjs/common';
import { ActivationKeysService } from './activation-keys.service';
import { redeemActivationKeySchema } from './dto/activation-key.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

/**
 * Deliberately a separate, unguarded controller from ActivationKeysController
 * (which carries a class-level @UseGuards(PlatformAuthGuard)) — a device
 * redeeming a code has no platform or tenant session at this point.
 */
@Controller('api/v1/activation')
export class ActivationRedeemController {
  constructor(private readonly activationKeys: ActivationKeysService) {}

  @Post('redeem')
  @UsePipes(new ZodValidationPipe(redeemActivationKeySchema))
  redeem(@Body() body: ReturnType<typeof redeemActivationKeySchema.parse>) {
    return this.activationKeys.redeem(body);
  }
}
