import { describe, expect, it } from 'vitest';
import { ReportGeneratorService } from '../shared/business/src/report_generator';

describe('ReportGeneratorService', () => {
  it('should generate daily sales report with summary metrics', () => {
    const report = ReportGeneratorService.generateDailySalesReport();
    expect(report.reportType).toBe('DAILY_SALES');
    expect(report.summaryMetrics).toBeDefined();
    expect(report.summaryMetrics.totalOrders).toBeGreaterThanOrEqual(0);
    expect(report.rows).toBeInstanceOf(Array);
  });

  it('should export report data to valid CSV format', () => {
    const report = ReportGeneratorService.generateDailySalesReport();
    const csv = ReportGeneratorService.exportToCsv(report);
    expect(csv).toContain('JAMANVAAR RESTAURANT');
    expect(csv).toContain('Total Gross Revenue');
  });
});
