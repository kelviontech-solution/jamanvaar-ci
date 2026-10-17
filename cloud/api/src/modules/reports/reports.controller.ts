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
  getRevenue(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.getRevenue({ from, to });
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
  getRestaurants(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.getRestaurants({ from, to });
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
  getDevices(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.getDevices({ from, to });
  }

  @Get('subscriptions')
  getSubscriptions(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.getSubscriptions({ from, to });
  }

  @Get('export')
  async exportCsv(@Res() res: Response, @Query('type') type: string = 'revenue', @Query('from') from?: string, @Query('to') to?: string) {
    const csvData = await this.reportsService.generateCsv(type, { from, to });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=jamanvaar_${type}_report_${Date.now()}.csv`);
    return res.send(csvData);
  }
}
