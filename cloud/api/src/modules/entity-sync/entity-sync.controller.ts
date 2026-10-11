import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { DeviceSyncThrottle } from '../../common/throttle';
import { Device } from '@prisma/client';
import { EntitySyncService } from './entity-sync.service';
import { mayRead, mayWrite, MANAGER_ROLES } from './entity-authority';
import { Headers } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StaffSessionService } from './staff-session.service';
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
  constructor(private readonly entitySync: EntitySyncService, private readonly sessions: StaffSessionService, private readonly prisma: PrismaService) {}

  @Post()
  @UsePipes(new ZodValidationPipe(pushEntitySyncSchema))
  async push(@Param('entityType') entityType: string, @Body() body: PushEntitySyncDto, @CurrentDevice() device: Device, @Headers('x-staff-session') staffToken?: string) {
    assertSyncableEntityType(entityType);
    assertDeviceMayWrite(entityType, device);
    // A terminal credential identifies a machine, never the person allowed to administer accounts.
    // The console's owner proof is checked by DeviceAuthGuard; POS needs a current manager session.
    if (entityType === 'STAFF_USER' && device.type === 'POS_ADMIN' && !(device as Device & { adminActorId?: string }).adminActorId) {
      throw new ForbiddenException({ code: 'ADMIN_SESSION_REQUIRED', message: 'Current owner or branch-manager sign-in is required' });
    }
    if (entityType === 'STAFF_USER' && device.type === 'POS') {
      const claim = this.sessions.verify(staffToken, device.restaurantId, device.id, 'session');
      const current = claim && MANAGER_ROLES.includes(claim.role) && await this.prisma.runAsTenant(device.restaurantId, tx => tx.syncedEntity.findFirst({
        where: { restaurantId: device.restaurantId, entityType: 'STAFF_USER', externalId: claim.sid }, select: { payload: true }
      }));
      const staff = current ? current.payload as Record<string, unknown> : null;
      if (!claim || claim.exp <= Date.now() || !staff || staff.deleted === true || staff.isActive === false || staff.roleId !== claim.role || (device.branchId && staff.branchId && staff.branchId !== device.branchId)) {
        throw new ForbiddenException({ code: 'STAFF_ADMINISTRATION_REQUIRED', message: 'Sign in as a manager before changing staff accounts.' });
      }
    }
    return this.entitySync.pushEvents(device, entityType, body.events);
  }

  @Get()
  pull(@Param('entityType') entityType: string, @Query('since') since: string | undefined, @CurrentDevice() device: Device, @Query('afterSeq') afterSeq?: string) {
    assertSyncableEntityType(entityType);
    assertDeviceMayRead(entityType, device);
    const sequence = afterSeq === undefined ? undefined : Number(afterSeq);
    if (sequence !== undefined && (!Number.isSafeInteger(sequence) || sequence < 0)) throw new BadRequestException('afterSeq must be a non-negative integer');
    return this.entitySync.catchUp(device, entityType, since, sequence);
  }
}
