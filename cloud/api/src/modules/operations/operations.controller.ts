import { ThaliRefillsService } from './thali-refills.service';
import { branchWaitEstimate } from './wait-estimate';
import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Device, User } from '@prisma/client';
import { z } from 'zod';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { CurrentTenantUser } from '../../common/decorators/current-tenant-user.decorator';
import { CurrentDevice } from '../../common/decorators/current-device.decorator';
import { QrGuestReadThrottle, DeviceSyncThrottle } from '../../common/throttle';
import { OperationsService } from './operations.service';
import { OperationsScheduler } from './operations-scheduler.service';
import { OperationsWorkflows } from './operations-workflows.service';
import { branchServiceState } from './operations-policy';

const id = z.string().min(1).max(128),
  version = z.number().int().nonnegative();
const text = z.string().trim().max(2000),
  day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BadRequestException(
      result.error.issues.map((i) => i.path.join('.') + ': ' + i.message).join('; '),
    );
  return result.data;
}
const transfer = z
  .object({ kind: z.enum(['STAFF', 'DEVICE']), id, targetBranchId: z.string().uuid() })
  .strict();

@Controller('api/v1/tenant/operations')
@UseGuards(TenantAuthGuard)
export class OperationsController {
  constructor(
    private readonly ops: OperationsService,
    private readonly schedules: OperationsScheduler,
    private readonly workflows: OperationsWorkflows,
  ) {}
  private scope(user: User, branch?: string) {
    return this.ops.scope(user, branch);
  }
  @Get('context') async context(@CurrentTenantUser() u: User, @Query('branchId') b?: string) {
    return this.ops.context(await this.scope(u, b));
  }
  @Get('service') async service(@CurrentTenantUser() u: User, @Query('branchId') b?: string) {
    return this.ops.service(await this.scope(u, b));
  }
  @Post('service') async saveService(
    @CurrentTenantUser() u: User,
    @Query('branchId') b: string,
    @Body() body: unknown,
  ) {
    return this.ops.saveService(await this.scope(u, b), body);
  }
  @Get('checklist') async checklist(
    @CurrentTenantUser() u: User,
    @Query('branchId') b: string,
    @Query('day') date: string,
  ) {
    return this.ops.checklist(await this.scope(u, b), parse(day, date));
  }
  @Post('checklist') async saveChecklist(
    @CurrentTenantUser() u: User,
    @Query('branchId') b: string,
    @Body() body: unknown,
  ) {
    return this.ops.saveChecklist(
      await this.scope(u, b),
      parse(
        z
          .object({
            day,
            phase: z.enum(['OPEN', 'CLOSE']),
            expectedVersion: version,
            checks: z.record(z.boolean()),
            notes: text,
          })
          .strict(),
        body,
      ),
    );
  }
  @Get('menu-review') async menuReview(@CurrentTenantUser() u: User, @Query('branchId') b: string) {
    return this.ops.menuReview(await this.scope(u, b));
  }
  @Post('menu-review/publish') async publish(
    @CurrentTenantUser() u: User,
    @Query('branchId') b: string,
    @Body() body: unknown,
  ) {
    return this.schedules.publishReviewed(
      await this.scope(u, b),
      parse(z.object({ checksum: z.string().min(16).max(128) }).strict(), body).checksum,
    );
  }
  @Get('menu-schedules') async menuSchedules(@CurrentTenantUser() u: User, @Query('branchId') b: string) {
    return this.ops.list(await this.scope(u, b), 'OPS_MENU_SCHEDULE');
  }
  @Post('menu-schedules') async createSchedule(
    @CurrentTenantUser() u: User,
    @Query('branchId') b: string,
    @Body() body: unknown,
  ) {
    return this.schedules.create(
      await this.scope(u, b),
      parse(
        z
          .object({
            title: z.string().trim().min(1).max(100),
            activateAt: z.string().datetime(),
            reviewedChecksum:z.string().min(16).max(128).optional(),
            changes: z
              .array(
                z
                  .object({
                    itemId: id,
                    price: z.number().min(0).max(10000000).optional(),
                    isAvailable: z.boolean().optional(),
                  })
                  .strict()
                  .refine(
                    (c) => c.price !== undefined || c.isAvailable !== undefined,
                    'Choose price or availability',
                  ),
              )
              .min(1)
              .max(500),
          })
          .strict(),
        body,
      ),
    );
  }
  @Post('menu-schedules/:id/cancel') async cancel(
    @CurrentTenantUser() u: User,
    @Query('branchId') b: string,
    @Param('id') key: string,
    @Body() body: unknown,
  ) {
    return this.schedules.cancel(
      await this.scope(u, b),
      parse(id, key),
      parse(z.object({ expectedVersion: version }).strict(), body).expectedVersion,
    );
  }
  @Get('planning') async planning(
    @CurrentTenantUser() u: User,
    @Query('branchId') b: string,
    @Query('days') days = '28',
    @Query('buffer') buffer = '10',
  ) {
    return this.ops.planning(
      await this.scope(u, b),
      parse(z.coerce.number().int().min(7).max(90), days),
      parse(z.coerce.number().int().min(0).max(100), buffer),
    );
  }
  @Get('comparison') async compare(
    @CurrentTenantUser() u: User,
    @Query('branchId') b: string,
    @Query('sourceBranchId') source: string,
  ) {
    return this.workflows.compare(await this.scope(u, b), parse(z.string().uuid(), source));
  }
  @Post('comparison/copy') async copy(
    @CurrentTenantUser() u: User,
    @Query('branchId') b: string,
    @Body() body: unknown,
  ) {
    return this.workflows.copy(
      await this.scope(u, b),
      parse(
        z
          .object({
            sourceBranchId: z.string().uuid(),
            sourceVersion: version,
            targetVersion: version,
            fields: z
              .array(z.enum(['hours', 'maxPendingOrders', 'preparationMinutes', 'channels']))
              .min(1)
              .max(4),
          })
          .strict(),
        body,
      ),
    );
  }
  @Get('diagnostics') async diagnostics(@CurrentTenantUser() u: User, @Query('branchId') b: string) {
    return this.ops.diagnostics(await this.scope(u, b));
  }
  @Get('acceptance') async acceptance(@CurrentTenantUser() u: User, @Query('branchId') b: string) {
    return this.ops.acceptance(await this.scope(u, b));
  }
  @Post('acceptance') async saveAcceptance(
    @CurrentTenantUser() u: User,
    @Query('branchId') b: string,
    @Body() body: unknown,
  ) {
    return this.ops.saveAcceptance(
      await this.scope(u, b),
      parse(
        z
          .object({
            source: z.enum(['POS', 'CAPTAIN', 'KIOSK', 'QR']),
            orderId: id,
            counter: z.boolean(),
            kitchen: z.boolean(),
            receipt: z.boolean(),
            onlineReturn: z.boolean(),
            expectedVersion: version,
          })
          .strict(),
        body,
      ),
    );
  }
  @Get('timeline/:id') async timeline(
    @CurrentTenantUser() u: User,
    @Query('branchId') b: string,
    @Param('id') key: string,
  ) {
    return this.ops.timeline(await this.scope(u, b), parse(id, key));
  }
  @Get('complaints') async complaints(@CurrentTenantUser() u: User, @Query('branchId') b: string) {
    return this.ops.list(await this.scope(u, b), 'OPS_COMPLAINT');
  }
  @Post('complaints') async complaint(
    @CurrentTenantUser() u: User,
    @Query('branchId') b: string,
    @Body() body: unknown,
  ) {
    return this.ops.complaint(
      await this.scope(u, b),
      parse(
        z
          .object({
            id: id.optional(),
            expectedVersion: version,
            title: z.string().trim().min(1).max(200),
            orderId: id.or(z.literal('')),
            assignedTo: z.string().uuid().or(z.literal('')),
            dueAt: z.string().datetime(),
            status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED']),
            resolution: text,
          })
          .strict(),
        body,
      ),
    );
  }
  @Get('assignees') async assignees(@CurrentTenantUser() u: User, @Query('branchId') b: string) {
    return this.ops.assignees(await this.scope(u, b));
  }
  @Get('handovers') async handovers(@CurrentTenantUser() u: User, @Query('branchId') b: string) {
    return this.ops.list(await this.scope(u, b), 'OPS_HANDOVER');
  }
  @Post('handovers') async handover(
    @CurrentTenantUser() u: User,
    @Query('branchId') b: string,
    @Body() body: unknown,
  ) {
    return this.ops.handover(
      await this.scope(u, b),
      parse(
        z
          .object({
            id: id.optional(),
            expectedVersion: version,
            recipientId: z.string().uuid(),
            notes: text,
            acknowledge: z.boolean(),
          })
          .strict(),
        body,
      ),
    );
  }
  @Get('approvals') async approvals(@CurrentTenantUser() u: User, @Query('branchId') b: string) {
    return this.ops.list(await this.scope(u, b), 'OPS_APPROVAL');
  }
  @Post('approvals/:id/decision') async decide(
    @CurrentTenantUser() u: User,
    @Query('branchId') b: string,
    @Param('id') key: string,
    @Body() body: unknown,
  ) {
    return this.workflows.decide(
      await this.scope(u, b),
      parse(id, key),
      parse(
        z
          .object({
            expectedVersion: version,
            approved: z.boolean(),
            reason: z.string().trim().min(1).max(500),
          })
          .strict(),
        body,
      ),
    );
  }
  @Post('transfers/preview') async previewTransfer(
    @CurrentTenantUser() u: User,
    @Query('branchId') b: string,
    @Body() body: unknown,
  ) {
    return this.workflows.transferPreview(await this.scope(u, b), parse(transfer, body));
  }
  @Post('transfers') async transfer(
    @CurrentTenantUser() u: User,
    @Query('branchId') b: string,
    @Body() body: unknown,
  ) {
    return this.workflows.transfer(
      await this.scope(u, b),
      parse(
        transfer.extend({ expectedVersion: version.optional(), acknowledge: z.boolean() }).strict(),
        body,
      ),
    );
  }
  @Post('pickup-link') async pickupLink(
    @CurrentTenantUser() u: User,
    @Query('branchId') b: string,
    @Body() body: unknown,
  ) {
    parse(z.object({}).strict(), body);
    return this.ops.pickupLink(await this.scope(u, b));
  }
}

@QrGuestReadThrottle()
@Controller('api/v1/pickup-display')
export class PickupDisplayController {
  constructor(private readonly ops: OperationsService) {}
  @Get(':token') get(@Param('token') token: string) {
    return this.ops.publicPickup(token);
  }
}

@DeviceSyncThrottle()
@UseGuards(DeviceAuthGuard)
@Controller('api/v1/operations/device')
export class DeviceOperationsController {
  constructor(
    private readonly ops: OperationsService,
    private readonly workflows: OperationsWorkflows,
    private readonly refills: ThaliRefillsService,
  ) {}
  @Get('refill-policy') refillPolicy(@CurrentDevice() d: Device) { return this.refills.forDevice(d); }
  @Post('refills') refill(@CurrentDevice() d: Device,@Body() body:unknown) { return this.refills.request(d,parse(z.object({orderId:id,itemId:id,quantity:z.number().int().min(1).max(10),idempotencyKey:z.string().min(8).max(80),staffToken:z.string().min(1).max(4096)}).strict(),body)); }
  @Get('cashier-settings') async cashier(@CurrentDevice() d: Device) {
    if(d.type!=='POS'||!d.branchId)throw new BadRequestException('Use a branch POS terminal');
    return this.ops.prisma.runAsTenant(d.restaurantId,async tx=>{
      const row=await tx.syncedEntity.findUnique({where:{restaurantId_entityType_externalId:{restaurantId:d.restaurantId,entityType:'OPS_CASHIER_SETTINGS',externalId:d.branchId!}}});
      return {data:row?.payload??{favoriteItemIds:[],quickAmounts:[100,200,500,1000,2000,5000],paymentMethods:['CASH','UPI','CARD','WALLET','HOUSE_ACCOUNT'],barcodeAliases:{}}};
    });
  }
  @Get('service') service(@CurrentDevice() d: Device) {
    if (!d.branchId) throw new BadRequestException('Activate this terminal in a branch');
    return this.ops.prisma.runAsTenant(d.restaurantId, (tx) =>
      branchServiceState(tx, d.restaurantId, d.branchId!, d.type === 'KIOSK' ? 'KIOSK' : 'QR'),
    );
  }
  @Get('wait-estimate') wait(@CurrentDevice() d: Device) {
    if (!d.branchId) throw new BadRequestException('Activate this terminal in a branch');
    return this.ops.prisma.runAsTenant(d.restaurantId, tx => branchWaitEstimate(tx, d.restaurantId, d.branchId!));
  }
  @Post('approvals') request(@CurrentDevice() d: Device, @Body() body: unknown) {
    return this.workflows.requestApproval(
      d,
      parse(
        z
          .object({
            action: z.enum(['REFUND', 'HIGH_DISCOUNT']),
            details: z.string().min(1).max(2000),
            fingerprint: z.string().min(8).max(128),
            staffToken: z.string().min(1).max(4096),
            scope: z
              .object({
                action: z.literal('REFUND'),
                paymentId: z.string().uuid(),
                amountPaise: z.number().int().positive(),
                idempotencyKey: z.string().min(8).max(128),
              })
              .strict()
              .optional(),
          })
          .strict(),
        body,
      ),
    );
  }
  @Post('approvals/:id/claim') claim(
    @CurrentDevice() d: Device,
    @Param('id') key: string,
    @Body() body: unknown,
  ) {
    return this.workflows.claim(
      d,
      parse(id, key),
      parse(
        z
          .object({ staffToken: z.string().min(1).max(4096), fingerprint: z.string().min(8).max(128) })
          .strict(),
        body,
      ),
    );
  }
}
