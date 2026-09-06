import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';

@Controller('api/v1/platform/reports')
@UseGuards(PlatformAuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('summary')
  getSummary() {
    return this.reportsService.getSummary();
  }

  @Get('revenue')
  getRevenue() {
    return this.reportsService.getRevenue();
  }

  @Get('restaurants')
  getRestaurants() {
    return this.reportsService.getRestaurants();
  }

  @Get('devices')
  getDevices() {
    return this.reportsService.getDevices();
  }

  @Get('subscriptions')
  getSubscriptions() {
    return this.reportsService.getSubscriptions();
  }

  @Get('export')
  async exportCsv(@Query('type') type: string = 'revenue', @Res() res: Response) {
    const csvData = await this.reportsService.generateCsv(type);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=jamanvaar_${type}_report_${Date.now()}.csv`);
    return res.send(csvData);
  }
}
