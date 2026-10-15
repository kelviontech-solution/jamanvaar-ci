import { ConfigurationRollbackService } from './configuration-rollback.service';
import { ThaliRefillsService } from './thali-refills.service';
import { RecurringMenuService } from './recurring-menu.service';
import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { z } from 'zod';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard';
import { CurrentTenantUser } from '../../common/decorators/current-tenant-user.decorator';
import { OperationsService } from './operations.service';
import { ServiceMaturityService } from './service-maturity.service';
const rollback = z
  .object({
    kind: z.enum(['MENU', 'APPEARANCE']),
    version: z.string().min(1).max(200),
    fields: z
      .array(z.enum(['price', 'isAvailable', 'imageUrl', 'text', 'background']))
      .min(1)
      .max(5),
    previewHash: z.string().length(64).optional(),
    acknowledge: z.boolean().optional()
  })
  .strict();
const assignment = z
  .object({
    id: z.string().min(1).max(180),
    assignedTo: z.string().uuid().or(z.literal('')),
    notes: z.string().trim().max(2000),
    expectedVersion: z.number().int().nonnegative()
  })
  .strict();
@UseGuards(TenantAuthGuard)
@Controller('api/v1/tenant/operations')
export class ServiceMaturityController {
  constructor(
    private readonly ops: OperationsService,
    private readonly maturity: ServiceMaturityService,
    private readonly recurring: RecurringMenuService,
    private readonly refills: ThaliRefillsService,
    private readonly rollback: ConfigurationRollbackService
  ) {}
  @Get('rollback/versions') async versions(@CurrentTenantUser() u: User, @Query('branchId') b: string) {
    return this.rollback.versions(await this.ops.scope(u, b));
  }
  @Post('rollback/preview') async rollbackPreview(@CurrentTenantUser() u: User, @Query('branchId') b: string, @Body() body: unknown) {
    const p = rollback.safeParse(body);
    if (!p.success) throw new BadRequestException('Choose a saved version and fields');
    return this.rollback.preview(await this.ops.scope(u, b), p.data);
  }
  @Post('rollback/apply') async rollbackApply(@CurrentTenantUser() u: User, @Query('branchId') b: string, @Body() body: unknown) {
    const p = rollback.safeParse(body);
    if (!p.success) throw new BadRequestException('Review a saved version before restoring');
    return this.rollback.apply(await this.ops.scope(u, b), p.data);
  }
  @Get('refill-policy') async refillPolicy(@CurrentTenantUser() u: User, @Query('branchId') b: string) {
    return this.refills.policy(await this.ops.scope(u, b));
  }
  @Post('refill-policy') async refillSave(@CurrentTenantUser() u: User, @Query('branchId') b: string, @Body() body: unknown) {
    const parsed = z
      .object({
        expectedVersion: z.number().int().nonnegative(),
        mealItemId: z.string().min(1).max(128),
        includedItemIds: z.array(z.string().min(1).max(128)).min(1).max(100),
        maxRefillsPerOrder: z.number().int().min(1).max(100)
      })
      .strict()
      .safeParse(body);
    if (!parsed.success) throw new BadRequestException('Choose a meal, refill dishes and a valid limit');
    return this.refills.save(await this.ops.scope(u, b), parsed.data);
  }
  @Get('cashier-settings') async cashier(@CurrentTenantUser() u: User, @Query('branchId') b: string) {
    const s = await this.ops.scope(u, b);
    this.ops.require(s, 'POS_ADMIN');
    return this.ops.read(s, 'OPS_CASHIER_SETTINGS');
  }
  @Post('cashier-settings') async cashierSave(@CurrentTenantUser() u: User, @Query('branchId') b: string, @Body() body: unknown) {
    const parsed = z
      .object({
        expectedVersion: z.number().int().nonnegative(),
        favoriteItemIds: z.array(z.string().min(1).max(128)).max(20),
        quickAmounts: z.array(z.number().int().positive().max(1000000)).min(1).max(12),
        paymentMethods: z
          .array(z.enum(['CASH', 'UPI', 'CARD', 'WALLET', 'HOUSE_ACCOUNT']))
          .min(1)
          .max(5),
        barcodeAliases: z.record(z.string().max(128)).refine((v) => Object.keys(v).length <= 500)
      })
      .strict()
      .safeParse(body);
    if (!parsed.success) throw new BadRequestException('Choose valid favorites, quick amounts and at least one payment method');
    const s = await this.ops.scope(u, b);
    this.ops.require(s, 'POS_ADMIN');
    const { expectedVersion, ...config } = parsed.data;
    return this.ops.write(s, 'OPS_CASHIER_SETTINGS', s.branchId, config, expectedVersion, 'CASHIER_SETTINGS_UPDATED');
  }
  @Get('recurring-menus') async recurringMenus(@CurrentTenantUser() u: User, @Query('branchId') b: string) {
    return this.ops.list(await this.ops.scope(u, b), 'OPS_RECURRING_MENU');
  }
  @Post('recurring-menus') async schedule(@CurrentTenantUser() u: User, @Query('branchId') b: string, @Body() body: unknown) {
    const parsed = z
      .object({
        title: z.string().trim().min(1).max(100),
        days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
        open: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/),
        close: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/),
        skipDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(100),
        reviewedChecksum: z.string().min(16).max(128),
        changes: z
          .array(
            z
              .object({ itemId: z.string().min(1).max(128), price: z.number().min(0).max(10000000).optional(), isAvailable: z.boolean().optional() })
              .strict()
              .refine((c) => c.price !== undefined || c.isAvailable !== undefined)
          )
          .min(1)
          .max(500)
      })
      .strict()
      .safeParse(body);
    if (!parsed.success) throw new BadRequestException('Enter valid recurring days, hours, exceptions and dish changes');
    return this.recurring.create(await this.ops.scope(u, b), parsed.data);
  }
  @Post('recurring-menus/:id/cancel') async stopSchedule(
    @CurrentTenantUser() u: User,
    @Query('branchId') b: string,
    @Param('id') id: string,
    @Body() body: unknown
  ) {
    const parsed = z.object({ expectedVersion: z.number().int().nonnegative() }).strict().safeParse(body);
    if (!parsed.success) throw new BadRequestException('Refresh the schedule before stopping');
    return this.recurring.cancel(await this.ops.scope(u, b), id, parsed.data.expectedVersion);
  }
  @Get('recovery') async recovery(@CurrentTenantUser() u: User, @Query('branchId') b: string) {
    return this.maturity.recovery(await this.ops.scope(u, b));
  }
  @Post('recovery/devices/:id/sync') async sync(@CurrentTenantUser() u: User, @Query('branchId') b: string, @Param('id') id: string, @Body() body: unknown) {
    if (!z.object({}).strict().safeParse(body).success) throw new BadRequestException('No replacement order or device parameters are accepted');
    return this.maturity.retrySync(await this.ops.scope(u, b), id);
  }
  @Get('payment-exceptions') async exceptions(@CurrentTenantUser() u: User, @Query('branchId') b: string) {
    return this.maturity.exceptions(await this.ops.scope(u, b));
  }
  @Post('payment-exceptions/:id/recover') async recoverPayment(
    @CurrentTenantUser() u: User,
    @Query('branchId') b: string,
    @Param('id') id: string,
    @Body() body: unknown
  ) {
    if (!z.object({}).strict().safeParse(body).success) throw new BadRequestException('Use the original confirmed payment');
    return this.maturity.paymentCheck(await this.ops.scope(u, b), id, true);
  }
  @Post('payment-exceptions/assign') async assign(@CurrentTenantUser() u: User, @Query('branchId') b: string, @Body() body: unknown) {
    const parsed = assignment.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Enter a valid assignee, note and record version');
    return this.maturity.assignCase(await this.ops.scope(u, b), parsed.data);
  }
  @Post('payment-exceptions/:id/check') async check(
    @CurrentTenantUser() u: User,
    @Query('branchId') b: string,
    @Param('id') id: string,
    @Body() body: unknown
  ) {
    if (!z.object({}).strict().safeParse(body).success) throw new BadRequestException('Use the original payment reference');
    return this.maturity.paymentCheck(await this.ops.scope(u, b), id);
  }
  @Get('daily-brief') async brief(@CurrentTenantUser() u: User, @Query('branchId') b: string) {
    return this.maturity.brief(await this.ops.scope(u, b));
  }
  @Get('wait-estimate') async wait(@CurrentTenantUser() u: User, @Query('branchId') b: string) {
    return this.maturity.wait(await this.ops.scope(u, b));
  }
  @Get('historical-costs') async costs(@CurrentTenantUser() u: User, @Query('branchId') b: string) {
    return this.maturity.historicalCosts(await this.ops.scope(u, b));
  }
}
