import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { DeviceSyncThrottle } from '../../common/throttle';
import { Device, DeviceCommandType, PlatformUser } from '@prisma/client';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';
import { CurrentDevice } from '../../common/decorators/current-device.decorator';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { DeviceCommandsService, IssueCommandDto } from './device-commands.service';

@DeviceSyncThrottle()
@Controller('api/v1/devices')
export class DeviceCommandsController {
  constructor(private readonly deviceCommandsService: DeviceCommandsService) {}

  // --- Terminal / Device Polling Endpoints ---
  // Declared FIRST on purpose: `GET me/commands` would otherwise be captured by
  // `GET :id/commands` (id = "me"), which needs a platform login - so a terminal
  // could never fetch its commands.

  @Get('me/commands')
  @UseGuards(DeviceAuthGuard)
  getPendingCommands(@CurrentDevice() device: Device) {
    return this.deviceCommandsService.getPendingForDevice(device);
  }

  @Post('me/commands/:id/ack')
  @UseGuards(DeviceAuthGuard)
  acknowledgeCommand(
    @CurrentDevice() device: Device,
    @Param('id') commandId: string,
    @Body() body: { status: 'SUCCEEDED' | 'FAILED'; result?: Record<string, unknown>; error?: string }
  ) {
    return this.deviceCommandsService.acknowledgeCommand(device, commandId, body);
  }

  // --- Platform Super Admin Endpoints ---

  @Get(':id/commands')
  @UseGuards(PlatformAuthGuard)
  listCommands(@Param('id') deviceId: string) {
    return this.deviceCommandsService.listForDevice(deviceId);
  }

  @Post(':id/commands')
  @UseGuards(PlatformAuthGuard)
  issueCommand(
    @Param('id') deviceId: string,
    @Body() dto: IssueCommandDto,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.deviceCommandsService.issueCommand(deviceId, dto, actor);
  }

  @Post(':id/lock')
  @UseGuards(PlatformAuthGuard)
  lockDevice(
    @Param('id') deviceId: string,
    @Body('reason') reason: string,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.deviceCommandsService.lockDevice(deviceId, reason, actor);
  }

  @Post(':id/unlock')
  @UseGuards(PlatformAuthGuard)
  unlockDevice(
    @Param('id') deviceId: string,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.deviceCommandsService.unlockDevice(deviceId, actor);
  }

  @Post(':id/force-logout')
  @UseGuards(PlatformAuthGuard)
  forceLogout(
    @Param('id') deviceId: string,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.deviceCommandsService.forceLogout(deviceId, actor);
  }

  @Post(':id/wipe')
  @UseGuards(PlatformAuthGuard)
  wipeDevice(
    @Param('id') deviceId: string,
    @Body('confirmationPhrase') confirmationPhrase: string,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.deviceCommandsService.wipeDevice(deviceId, confirmationPhrase, actor);
  }
}
