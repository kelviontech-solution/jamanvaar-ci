import { Body, Controller, Get, Post, UseGuards, UsePipes } from '@nestjs/common';
import { User } from '@prisma/client';
import { PaymentConnectionsService } from './payment-connections.service';
import { submitPaymentConnectionSchema, SubmitPaymentConnectionDto } from './dto/payment-connection.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard';
import { CurrentTenantUser } from '../../common/decorators/current-tenant-user.decorator';

@Controller('api/v1/tenant/payment-connection')
@UseGuards(TenantAuthGuard)
export class KioskPaymentConnectionController {
  constructor(private readonly connections: PaymentConnectionsService) {}

  @Get()
  getOwn(@CurrentTenantUser() user: User) {
    return this.connections.getOwn(user.restaurantId);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(submitPaymentConnectionSchema))
  submit(@Body() body: SubmitPaymentConnectionDto, @CurrentTenantUser() user: User) {
    return this.connections.submit(user.restaurantId, body);
  }
}
