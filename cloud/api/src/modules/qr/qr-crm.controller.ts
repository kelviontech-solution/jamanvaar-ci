import { Body, Controller, Get, Param, Post, Put, Query, UseGuards, UsePipes } from '@nestjs/common';
import { Device } from '@prisma/client';
import { z } from 'zod';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { CurrentDevice } from '../../common/decorators/current-device.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { QrCrmService, qrCustomerSchema, qrPointsSchema, qrProgramSchema, qrRewardSchema } from './qr-crm.service';
@Controller('api/v1/restaurant/qr/crm')
@UseGuards(DeviceAuthGuard)
export class QrCrmController {
  constructor(private readonly crm: QrCrmService) {}
  @Get() list(@CurrentDevice() d: Device, @Query('search') search?: string, @Query('cursor') cursor?: string, @Query('segment') segment?: string) {
    return this.crm.list(d, search, cursor, segment);
  }
  @Get('export') export(@CurrentDevice() d: Device, @Query('segment') segment = 'ALL') {
    return this.crm.exportCustomers(d, segment);
  }
  @Post('customers/:phone/followup')
  @UsePipes(
    new ZodValidationPipe(
      z.object({ version: z.number().int().positive(), note: z.string().trim().min(3).max(1000), idempotencyKey: z.string().uuid() }).strict()
    )
  )
  followup(@CurrentDevice() d: Device, @Param('phone') phone: string, @Body() b: { version: number; note: string; idempotencyKey: string }) {
    return this.crm.followup(d, phone, b);
  }
  @Get('program') program(@CurrentDevice() d: Device) {
    return this.crm.program(d);
  }
  @Put('program') @UsePipes(new ZodValidationPipe(qrProgramSchema)) saveProgram(@CurrentDevice() d: Device, @Body() body: z.infer<typeof qrProgramSchema>) {
    return this.crm.saveProgram(d, body);
  }
  @Put('rewards') @UsePipes(new ZodValidationPipe(qrRewardSchema)) reward(@CurrentDevice() d: Device, @Body() body: z.infer<typeof qrRewardSchema>) {
    return this.crm.reward(d, body);
  }
  @Post('customers') @UsePipes(new ZodValidationPipe(qrCustomerSchema)) customer(@CurrentDevice() d: Device, @Body() body: z.infer<typeof qrCustomerSchema>) {
    return this.crm.customer(d, body);
  }
  @Get('customers/:phone') detail(@CurrentDevice() d: Device, @Param('phone') phone: string) {
    return this.crm.detail(d, phone);
  }
  @Post('customers/:phone/points') @UsePipes(new ZodValidationPipe(qrPointsSchema)) points(
    @CurrentDevice() d: Device,
    @Param('phone') phone: string,
    @Body() body: z.infer<typeof qrPointsSchema>
  ) {
    return this.crm.points(d, phone, body);
  }
}
