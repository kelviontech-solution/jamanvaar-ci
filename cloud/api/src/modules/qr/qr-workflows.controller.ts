import { Body, Controller, Get, Param, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { Device } from '@prisma/client';
import { z } from 'zod';
import { CurrentDevice } from '../../common/decorators/current-device.decorator';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { acceptanceSchema, QrWorkflowsService } from './qr-workflows.service';
@Controller('api/v1/restaurant/qr/workflows')
@UseGuards(DeviceAuthGuard)
export class QrWorkflowsController {
  constructor(private readonly flows: QrWorkflowsService) {}
  @Get('payment-acceptance') acceptance(@CurrentDevice() d: Device) {
    return this.flows.acceptance(d);
  }
  @Post('payment-acceptance') @UsePipes(new ZodValidationPipe(acceptanceSchema)) save(@CurrentDevice() d: Device, @Body() b: z.infer<typeof acceptanceSchema>) {
    return this.flows.saveAcceptance(d, b);
  }
  @Get('timeline/:id') timeline(@CurrentDevice() d: Device, @Param('id') id: string) {
    return this.flows.timeline(d, id);
  }
  @Get('reconciliation') reconciliation(@CurrentDevice() d: Device, @Query('from') from?: string, @Query('to') to?: string, @Query('cursor') cursor?: string) {
    return this.flows.reconciliation(d, from, to, cursor);
  }
  @Get('print-inventory') inventory(@CurrentDevice() d: Device) {
    return this.flows.printInventory(d);
  }
  @Get('pickup-calendar') calendar(@CurrentDevice() d: Device, @Query('from') from?: string, @Query('to') to?: string) {
    return this.flows.pickupCalendar(d, from, to);
  }
}
