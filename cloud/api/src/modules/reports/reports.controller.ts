import { BadRequestException, Body, Controller, Get, Param, Patch, Query, Res, UseGuards } from '@nestjs/common';
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

  @Get('margins')
  getMargins() {
    return this.reportsService.getMargins();
  }

  @Patch('margins/cost-assumption')
  setAssumedCost(@Body() body: { rupees: number }) {
    const rupees = Number(body?.rupees);
    if (!Number.isFinite(rupees) || rupees < 0) throw new BadRequestException('rupees must be a non-negative number');
    return this.reportsService.setAssumedMonthlyCost(rupees);
  }

  @Get('restaurants')
  getRestaurants() {
    return this.reportsService.getRestaurants();
  }

  @Get('restaurants/:id/sales')
  getRestaurantSales(@Param('id') id: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.getRestaurantSales(id, { from, to });
  }

  @Get('restaurants/:id')
  getRestaurantReport(@Param('id') id: string) {
    return this.reportsService.getRestaurantReport(id);
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
