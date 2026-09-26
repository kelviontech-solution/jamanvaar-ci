import { Body, Controller, Get, Post, Put, Query, UseGuards, UsePipes } from '@nestjs/common';
import { Device } from '@prisma/client';
import { DeviceSyncThrottle } from '../../common/throttle';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { CurrentDevice } from '../../common/decorators/current-device.decorator';
import { BranchOverrideDto, MenuPublicationsService, PublishMenuDto, branchOverrideSchema, publishMenuSchema } from './menu-publications.service';

@DeviceSyncThrottle()
@Controller('api/v1/menu')
@UseGuards(DeviceAuthGuard)
export class MenuPublicationsController {
  constructor(private readonly menu: MenuPublicationsService) {}

  @Get('version')
  version(@CurrentDevice() device: Device) {
    return this.menu.latest(device.restaurantId);
  }

  @Get('draft-status')
  draftStatus(@CurrentDevice() device: Device) {
    return this.menu.draftStatus(device);
  }

  @Get('preview')
  preview(@CurrentDevice() device: Device, @Query('branchId') branchId?: string) {
    return this.menu.preview(device, branchId || null);
  }

  @Post('publish')
  @UsePipes(new ZodValidationPipe(publishMenuSchema))
  publish(@Body() body: PublishMenuDto, @CurrentDevice() device: Device) {
    return this.menu.publish(device, body);
  }

  @Get('branch-overrides')
  branchOverrides(@CurrentDevice() device: Device, @Query('branchId') branchId?: string) {
    return this.menu.listBranchOverrides(device, branchId);
  }

  @Put('branch-overrides')
  @UsePipes(new ZodValidationPipe(branchOverrideSchema))
  setBranchOverride(@Body() body: BranchOverrideDto, @CurrentDevice() device: Device) {
    return this.menu.setBranchOverride(device, body);
  }
}
