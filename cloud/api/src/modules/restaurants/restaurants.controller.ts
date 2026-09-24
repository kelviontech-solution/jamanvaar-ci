import { Body, Controller, Get, Param, Patch, Post, UseGuards, UsePipes } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { RestaurantsService } from './restaurants.service';
import { createRestaurantSchema } from './dto/create-restaurant.dto';
import { updateRestaurantSchema } from './dto/update-restaurant.dto';
import { importMenuSchema, menuPermissionSchema } from './dto/import-menu.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';
import { PlatformRoleName } from '../../common/rbac/access';

@Controller('api/v1/restaurants')
@UseGuards(PlatformAuthGuard)
export class RestaurantsController {
  constructor(private readonly restaurants: RestaurantsService) {}

  @Post()
  @UsePipes(new ZodValidationPipe(createRestaurantSchema))
  create(@Body() body: ReturnType<typeof createRestaurantSchema.parse>, @CurrentPlatformUser() actor: PlatformUser) {
    return this.restaurants.createRestaurant(body, actor);
  }

  @Get()
  list() {
    return this.restaurants.listRestaurants();
  }

  @Get(':id')
  detail(@Param('id') id: string, @CurrentPlatformUser() actor: PlatformUser) {
    return this.restaurants.getRestaurantById(id, actor.role as PlatformRoleName);
  }

  @Patch(':id')
  @UsePipes(new ZodValidationPipe(updateRestaurantSchema))
  update(
    @Param('id') id: string,
    @Body() body: ReturnType<typeof updateRestaurantSchema.parse>,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.restaurants.update(id, body, actor);
  }

  @Patch(':id/suspend')
  suspend(@Param('id') id: string, @CurrentPlatformUser() actor: PlatformUser) {
    return this.restaurants.setStatus(id, 'SUSPENDED', actor);
  }

  @Patch(':id/reactivate')
  reactivate(@Param('id') id: string, @CurrentPlatformUser() actor: PlatformUser) {
    return this.restaurants.setStatus(id, 'ACTIVE', actor);
  }

  @Get(':id/menu')
  getMenu(@Param('id') id: string) {
    return this.restaurants.getMenu(id);
  }

  @Post(':id/menu/import')
  @UsePipes(new ZodValidationPipe(importMenuSchema))
  importMenu(
    @Param('id') id: string,
    @Body() body: ReturnType<typeof importMenuSchema.parse>,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.restaurants.importMenu(id, body, actor);
  }

  @Patch(':id/menu/permission')
  @UsePipes(new ZodValidationPipe(menuPermissionSchema))
  setMenuPermission(
    @Param('id') id: string,
    @Body() body: ReturnType<typeof menuPermissionSchema.parse>,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.restaurants.setMenuPermission(id, body.enabled, actor);
  }
}
