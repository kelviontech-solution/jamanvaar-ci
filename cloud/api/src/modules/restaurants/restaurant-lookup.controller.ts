import { Body, Controller, HttpCode, Post, UsePipes } from '@nestjs/common';
import { RestaurantsService } from './restaurants.service';
import { resolveRestaurantCodeSchema, ResolveRestaurantCodeDto } from './dto/restaurant-lookup.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

/**
 * Deliberately unguarded — same reasoning as ActivationRedeemController: a login or
 * activation screen calling this has no session yet. Read-only, no PII beyond the
 * restaurant's own display name (see RestaurantsService.resolveByCode's doc comment).
 */
@Controller('api/v1/restaurant-lookup')
export class RestaurantLookupController {
  constructor(private readonly restaurants: RestaurantsService) {}

  @Post('resolve')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(resolveRestaurantCodeSchema))
  resolve(@Body() body: ResolveRestaurantCodeDto) {
    return this.restaurants.resolveByCode(body.restaurantCode);
  }
}
