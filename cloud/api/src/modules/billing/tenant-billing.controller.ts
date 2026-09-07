import { Body, Controller, Get, Param, Post, UseGuards, UsePipes } from '@nestjs/common';
import { User } from '@prisma/client';
import { InvoicesService } from './invoices.service';
import { tenantPaymentSchema } from './dto/invoice.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard';
import { CurrentTenantUser } from '../../common/decorators/current-tenant-user.decorator';

@Controller('api/v1/tenant/billing')
@UseGuards(TenantAuthGuard)
export class TenantBillingController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get('summary')
  getSummary(@CurrentTenantUser() user: User) {
    return this.invoices.getTenantBillingSummary(user.restaurantId);
  }

  @Get('invoices')
  getInvoices(@CurrentTenantUser() user: User) {
    return this.invoices.getTenantInvoices(user.restaurantId);
  }

  @Get('invoices/:id')
  getInvoiceDetail(
    @CurrentTenantUser() user: User,
    @Param('id') id: string
  ) {
    return this.invoices.getTenantInvoiceById(user.restaurantId, id);
  }

  @Get('invoices/:id/receipt')
  getReceipt(
    @CurrentTenantUser() user: User,
    @Param('id') id: string
  ) {
    return this.invoices.getTenantReceipt(user.restaurantId, id);
  }

  @Post('invoices/:id/pay')
  @UsePipes(new ZodValidationPipe(tenantPaymentSchema))
  payInvoice(
    @CurrentTenantUser() user: User,
    @Param('id') id: string,
    @Body() body: ReturnType<typeof tenantPaymentSchema.parse>
  ) {
    return this.invoices.processTenantPayment(user.restaurantId, id, body, user.id);
  }
}
