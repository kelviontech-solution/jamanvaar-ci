import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { Device, PlatformUser } from '@prisma/client';
import { Response } from 'express';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { CurrentDevice } from '../../common/decorators/current-device.decorator';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';
import { WelcomeDesignsService } from './welcome-designs.service';

@Controller('api/v1/platform/settings/kiosk-welcome/designs')
@UseGuards(PlatformAuthGuard)
export class PlatformWelcomeDesignsController {
  constructor(private readonly designs: WelcomeDesignsService) {}
  @Get() catalog() { return this.designs.catalog(); }
  @Post() add(@Body() body: unknown, @CurrentPlatformUser() actor: PlatformUser) { return this.designs.add(body, actor); }
}
@Controller('api/v1/devices/me/welcome-designs')
@UseGuards(DeviceAuthGuard)
export class DeviceWelcomeDesignsController {
  constructor(private readonly designs: WelcomeDesignsService) {}
  @Get() catalog(@CurrentDevice() device: Device) { return this.designs.forRestaurant(device.restaurantId); }
}
@Controller('api/v1/public/welcome-designs')
export class PublicWelcomeDesignsController {
  constructor(private readonly designs: WelcomeDesignsService) {}
  @Get(':id/:variant') async image(@Param('id') id: string, @Param('variant') variant: string, @Res() res: Response) {
    const image = await this.designs.image(id, variant);
    res.set({ 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' }).send(image);
  }
}
