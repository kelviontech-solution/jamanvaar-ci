import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Device, PlatformUser } from '@prisma/client';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';
import { CurrentDevice } from '../../common/decorators/current-device.decorator';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { DeviceSyncThrottle } from '../../common/throttle';
import { RecordSyncLogDto, SyncObservabilityService } from './sync-observability.service';

@Controller('api/v1/platform/telemetry')
export class SyncObservabilityController {
  constructor(private readonly syncObservabilityService: SyncObservabilityService) {}

  @Get('database')
  @UseGuards(PlatformAuthGuard)
  getDatabaseTelemetry() {
    return this.syncObservabilityService.getPlatformTelemetry();
  }

  @Get('sync-metrics')
  @UseGuards(PlatformAuthGuard)
  getSyncMetrics() {
    return this.syncObservabilityService.getSyncMetrics();
  }

  @Get('sync-logs')
  @UseGuards(PlatformAuthGuard)
  listSyncLogs(
    @Query('restaurantId') restaurantId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string
  ) {
    return this.syncObservabilityService.listSyncLogs({
      restaurantId,
      status,
      limit: limit ? parseInt(limit, 10) : undefined
    });
  }

  @Get('conflicts')
  @UseGuards(PlatformAuthGuard)
  listConflicts(@Query('restaurantId') restaurantId?: string) {
    return this.syncObservabilityService.listConflicts(restaurantId);
  }

  @Post('conflicts/:id/resolve')
  @UseGuards(PlatformAuthGuard)
  resolveConflict(
    @Param('id') conflictId: string,
    @Body('strategy') strategy: 'CLOUD_WINS' | 'LOCAL_WINS' | 'MANUAL_MERGE',
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.syncObservabilityService.resolveConflict(conflictId, strategy, actor);
  }

  // Terminal / Device Sync reporting endpoint.
  // security-audit MED-14: this had no guard at all — any anonymous caller could write
  // unbounded, fabricated telemetry rows tagged with an arbitrary restaurantId. Now
  // requires a real device credential, and restaurantId/deviceId come from that device.
  @Post('events')
  @DeviceSyncThrottle()
  @UseGuards(DeviceAuthGuard)
  recordEvent(@Body() dto: RecordSyncLogDto, @CurrentDevice() device: Device) {
    return this.syncObservabilityService.recordSyncLog(device, dto);
  }
}
