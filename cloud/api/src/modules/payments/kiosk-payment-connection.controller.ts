import { Body, Controller, ForbiddenException, Get, Patch, Post, UseGuards, UsePipes } from '@nestjs/common';
import { User } from '@prisma/client';
import { PaymentConnectionsService } from './payment-connections.service';
import { submitPaymentConnectionSchema, SubmitPaymentConnectionDto, settlementPreferenceSchema, SettlementPreferenceDto, settlementBankDetailsSchema, SettlementBankDetailsDto } from './dto/payment-connection.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard';
import { CurrentTenantUser } from '../../common/decorators/current-tenant-user.decorator';

@Controller('api/v1/tenant/payment-connection')
@UseGuards(TenantAuthGuard)
export class KioskPaymentConnectionController {
  constructor(private readonly connections: PaymentConnectionsService) {}

  private requireOwner(user: User): void {
    if (user.role !== 'OWNER' && user.role !== 'MANAGER') throw new ForbiddenException('Only restaurant owners and managers can manage payment settings.');
  }

  @Patch('settlement-preference')
  @UsePipes(new ZodValidationPipe(settlementPreferenceSchema))
  preference(@Body() body: SettlementPreferenceDto, @CurrentTenantUser() user: User) {
    this.requireOwner(user);
    return this.connections.setSettlementPreference(user.restaurantId, body.directSettlementRequested, user.id);
  }

  @Patch('bank-details')
  @UsePipes(new ZodValidationPipe(settlementBankDetailsSchema))
  bankDetails(@Body() body: SettlementBankDetailsDto, @CurrentTenantUser() user: User) {
    this.requireOwner(user);
    return this.connections.setBankDetails(user.restaurantId, body, user.id);
  }

  @Post('request-platform-payments')
  requestPlatformPayments(@CurrentTenantUser() user: User) {
    this.requireOwner(user);
    return this.connections.requestPlatformPayments(user.restaurantId, user.id);
  }

  @Get()
  getOwn(@CurrentTenantUser() user: User) {
    // TenantAuthGuard authenticates but performs no role check, and the
    // `adminOnly` login flag is client-supplied and only honoured at login
    // time (POS Admin/Captain log in without it) — so without this gate any
    // STAFF session token could read the restaurant's unmasked PAN, GST,
    // CIN, UIDAI (Aadhaar), IFSC and UPI VPA: toOwnView() omits only the
    // settlement account *number*, not these other identity/tax fields.
    if (user.role !== 'OWNER' && user.role !== 'MANAGER') {
      throw new ForbiddenException('Only restaurant owners and managers can view payment connection settings.');
    }
    return this.connections.getOwn(user.restaurantId);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(submitPaymentConnectionSchema))
  submit(@Body() body: SubmitPaymentConnectionDto, @CurrentTenantUser() user: User) {
    // Same reasoning as getOwn() above — without this gate any STAFF
    // session token could rewrite the restaurant's settlement bank account.
    if (user.role !== 'OWNER' && user.role !== 'MANAGER') {
      throw new ForbiddenException('Only restaurant owners and managers can manage payment connection settings.');
    }
    return this.connections.submit(user.restaurantId, body);
  }
}
