import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { InvoiceStatus, PlatformUser } from '@prisma/client';
import { InvoicesService } from './invoices.service';
import { createInvoiceSchema, recordPaymentSchema, updateInvoiceStatusSchema } from './dto/invoice.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';

@Controller('api/v1/invoices')
@UseGuards(PlatformAuthGuard)
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get('summary')
  summary(@Query('restaurantId') restaurantId?: string) {
    return this.invoices.getBillingSummary(restaurantId);
  }

  @Get('receivables')
  receivables(@Query() query: Record<string, string>) {
    return this.invoices.receivables(query);
  }

  @Get()
  list(@Query() query: Record<string, string>) {
    return this.invoices.list(query);
  }

  @Post('check-renewals')
  checkRenewals() {
    return this.invoices.checkAndGenerateRenewals();
  }

  @Get(':id/receipt')
  getReceipt(@Param('id') id: string) {
    return this.invoices.getReceiptForInvoice(id);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.invoices.getById(id);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(createInvoiceSchema))
  create(
    @Body() body: ReturnType<typeof createInvoiceSchema.parse>,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.invoices.create(body, actor);
  }

  @Post(':id/payments')
  @UsePipes(new ZodValidationPipe(recordPaymentSchema))
  recordPayment(
    @Param('id') id: string,
    @Body() body: ReturnType<typeof recordPaymentSchema.parse>,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.invoices.recordPayment(id, body, actor.id);
  }

  @Patch(':id/status')
  @UsePipes(new ZodValidationPipe(updateInvoiceStatusSchema))
  updateStatus(
    @Param('id') id: string,
    @Body() body: ReturnType<typeof updateInvoiceStatusSchema.parse>,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.invoices.updateStatus(id, body.status as InvoiceStatus, actor, body.reason);
  }
}
