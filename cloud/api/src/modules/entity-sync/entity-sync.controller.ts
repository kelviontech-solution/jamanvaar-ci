import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { DeviceSyncThrottle } from '../../common/throttle';
import { Device, DeviceType } from '@prisma/client';
import { EntitySyncService } from './entity-sync.service';
import { pushEntitySyncSchema, PushEntitySyncDto, SYNCABLE_ENTITY_TYPES, SyncableEntityType } from './dto/push-entity-sync.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { CurrentDevice } from '../../common/decorators/current-device.decorator';

function assertSyncableEntityType(entityType: string): asserts entityType is SyncableEntityType {
  if (!(SYNCABLE_ENTITY_TYPES as readonly string[]).includes(entityType)) {
    throw new BadRequestException(`Unknown sync entity type: ${entityType}`);
  }
}

/**
 * security-audit CRIT-01 fix: entity-sync used to authorize a push purely on "does this
 * request carry a valid device credential for this restaurant" — never on which device
 * TYPE is presenting it. That let the lowest-trust device in the fleet (a customer-facing
 * Kiosk, or a kitchen KDS screen) write a STAFF_USER record with an attacker-chosen
 * `roleId`/`pinHash` (e.g. `role-manager`), which every other terminal then pulled and
 * trusted as a real staff identity — a full privilege escalation from "public terminal"
 * to "POS manager" via one unauthenticated-in-effect HTTP call.
 *
 * STAFF_USER is the one entity type that carries account/credential material (role +
 * PIN hash), so it is the one type restricted here: only the two device types that have
 * a real staff-management console (POS, for local terminal logins, and POS_ADMIN, the
 * Restaurant Admin console `pushSnapshot`s staff records from) may write it. Every
 * device type may still PULL it — offline PIN verification on Kiosk/KDS/Captain depends
 * on having the hash locally, which is a deliberate product design (see BUG-019/034/035)
 * unrelated to this fix — only the write side was ever the vulnerability.
 */
const ENTITY_WRITE_ALLOWED_DEVICE_TYPES: Partial<Record<SyncableEntityType, readonly DeviceType[]>> = {
  STAFF_USER: ['POS', 'POS_ADMIN']
};

function assertDeviceMayWrite(entityType: SyncableEntityType, device: Device): void {
  const allowed = ENTITY_WRITE_ALLOWED_DEVICE_TYPES[entityType];
  if (allowed && !allowed.includes(device.type)) {
    throw new ForbiddenException(`${device.type} devices may not write ${entityType} records`);
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
    return this.entitySync.catchUp(device, entityType, since);
  }
}
