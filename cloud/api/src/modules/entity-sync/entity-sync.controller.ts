import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { DeviceSyncThrottle } from '../../common/throttle';
import { Device } from '@prisma/client';
import { EntitySyncService } from './entity-sync.service';
import { mayRead, mayWrite } from './entity-authority';
import { pushEntitySyncSchema, PushEntitySyncDto, SYNCABLE_ENTITY_TYPES, SyncableEntityType } from './dto/push-entity-sync.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { CurrentDevice } from '../../common/decorators/current-device.decorator';

function assertSyncableEntityType(entityType: string): asserts entityType is SyncableEntityType {
  if (!(SYNCABLE_ENTITY_TYPES as readonly string[]).includes(entityType)) {
    throw new BadRequestException(`Unknown sync entity type: ${entityType}`);
  }
}

function assertDeviceMayWrite(entityType: SyncableEntityType, device: Device): void {
  if (!mayWrite(entityType, device.type)) {
    throw new ForbiddenException(`${device.type} devices may not write ${entityType} records`);
  }
}

function assertDeviceMayRead(entityType: SyncableEntityType, device: Device): void {
  if (!mayRead(entityType, device.type)) {
    throw new ForbiddenException(`${device.type} devices may not read ${entityType} records`);
  }
}

@DeviceSyncThrottle()
@Controller('api/v1/entity-sync/:entityType')
@UseGuards(DeviceAuthGuard)
export class EntitySyncController {
  constructor(private readonly entitySync: EntitySyncService) {}

  @Post()
  @UsePipes(new ZodValidationPipe(pushEntitySyncSchema))
  push(@Param('entityType') entityType: string, @Body() body: PushEntitySyncDto, @CurrentDevice() device: Device) {
    assertSyncableEntityType(entityType);
    assertDeviceMayWrite(entityType, device);
    return this.entitySync.pushEvents(device, entityType, body.events);
  }

  @Get()
  pull(@Param('entityType') entityType: string, @Query('since') since: string | undefined, @CurrentDevice() device: Device) {
    assertSyncableEntityType(entityType);
    assertDeviceMayRead(entityType, device);
    return this.entitySync.catchUp(device, entityType, since);
  }
}
