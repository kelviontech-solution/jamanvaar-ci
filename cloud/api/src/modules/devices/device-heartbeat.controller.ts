import { Body, Controller, Get, Param, Patch, Post, Put, Req, UseGuards, UsePipes } from '@nestjs/common';
import { DeviceSyncThrottle } from '../../common/throttle';
import { Device } from '@prisma/client';
import { DevicesService } from './devices.service';
import { heartbeatSchema, restaurantIdentitySchema } from './dto/heartbeat.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { CurrentDevice } from '../../common/decorators/current-device.decorator';

/**
 * Deliberately a separate controller from DevicesController (PlatformAuthGuard
 * at the class level) — a device authenticates as itself here, never as a
 * Super Admin, and can only ever update its OWN row (there is no :id param;
 * the device is identified entirely by the credential DeviceAuthGuard verified).
 */
@DeviceSyncThrottle()
@Controller('api/v1/devices/me')
@UseGuards(DeviceAuthGuard)
export class DeviceHeartbeatController {
  constructor(private readonly devices: DevicesService) {}

  @Patch('heartbeat')
  @UsePipes(new ZodValidationPipe(heartbeatSchema))
  heartbeat(@Body() body: ReturnType<typeof heartbeatSchema.parse>, @CurrentDevice() device: Device, @Req() req: { ip?: string }) {
    // The address the server actually saw, not one the terminal claims.
    return this.devices.reportHeartbeat(device, { ...body, ipAddress: req.ip?.replace(/^::ffff:/, '') });
  }

  /**
   * The self-order kiosks this restaurant has really activated, with their health, for Kiosk Admin's terminal
   * list (BUG-132). It used to know only kiosks that happened to share its browser or LAN, so a real, online
   * kiosk showed as "No Kiosk Terminals Yet".
   */
  /** Restaurant Admin assigns the kitchen station of a KDS screen. Body: { station: "Bar" } or { station: null } to clear. */
  @Put('fleet/:targetId/station')
  setStation(@Param('targetId') targetId: string, @Body() body: { station?: string | null }, @CurrentDevice() device: Device) {
    const station = typeof body?.station === 'string' ? body.station.trim().slice(0, 40) || null : null;
    return this.devices.setKitchenStation(device, targetId, station);
  }

  @Get('kiosks')
  kiosks(@CurrentDevice() device: Device) {
    return this.devices.listKiosksForRestaurant(device.restaurantId, device.branchId);
  }

  /** The device roster a Branch Core caches so it can authorize devices while offline. Console devices only. */
  @Get('roster')
  roster(@CurrentDevice() device: Device) {
    return this.devices.getBranchRoster(device);
  }

  /** A Branch Core reporting the state of the devices it serves, so the cloud fleet view stays accurate. */
  @Post('branch-report')
  branchReport(@Body() body: { devices?: unknown }, @CurrentDevice() device: Device) {
    const list = Array.isArray(body?.devices) ? (body.devices as never[]) : [];
    return this.devices.reportBranchDevices(device, list);
  }

  /** B2-054: the restaurant's current identity (name/GSTIN/FSSAI/address), for every activated terminal to pull. */
  @Get('restaurant')
  getRestaurant(@CurrentDevice() device: Device) {
    return this.devices.getRestaurantIdentity(device.restaurantId);
  }

  /** B2-054: Restaurant Admin's Settings save writing the restaurant's own identity back to the cloud. */
  @Patch('restaurant')
  @UsePipes(new ZodValidationPipe(restaurantIdentitySchema))
  updateRestaurant(@Body() body: ReturnType<typeof restaurantIdentitySchema.parse>, @CurrentDevice() device: Device) {
    return this.devices.updateRestaurantIdentity(device.restaurantId, body);
  }
}
