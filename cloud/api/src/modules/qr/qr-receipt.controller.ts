import { Body, Controller, Get, Param, Put, Res, StreamableFile, UseGuards, UsePipes } from '@nestjs/common';
import type { Response } from 'express';
import type { Device } from '@prisma/client';
import { z } from 'zod';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { CurrentDevice } from '../../common/decorators/current-device.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { QrReceiptService, receiptDesignSchema } from './qr-receipt.service';
const updateSchema = z.object({ design: receiptDesignSchema, version: z.number().int().min(0) }).strict();
@Controller('api/v1/restaurant/qr/receipts')
@UseGuards(DeviceAuthGuard)
export class QrReceiptController {
  constructor(private readonly receipts: QrReceiptService) {}
  @Get() read(@CurrentDevice() device: Device) {
    return this.receipts.read(device);
  }
  @Put()
  @UsePipes(new ZodValidationPipe(updateSchema))
  update(@CurrentDevice() device: Device, @Body() input: z.infer<typeof updateSchema>) {
    return this.receipts.save(device, input);
  }
  @Get('orders/:id/pdf')
  async pdf(@CurrentDevice() device: Device, @Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const result = await this.receipts.adminPdf(device, id);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    return new StreamableFile(result.pdf);
  }
}
