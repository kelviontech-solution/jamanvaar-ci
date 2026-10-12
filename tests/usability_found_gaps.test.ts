import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { db, OrderRepository, ShiftRepository, BusinessDayRepository, BusinessDayAccountingService, orderPaymentPosition, RestaurantIdentityRepository, resolveOperatingProfile } from '@jamanvaar/database';
import { BusinessDayService, CentralReportingService, DayOrdersService, ReportGeneratorService, buildShiftSummary } from '@jamanvaar/business';
import { summarizeBillingLedger, exportBillingCsv } from '../apps/restaurant-system/pos-admin/src/components/billing/billingLedger';
import type { Order } from '@jamanvaar/types';

const paid = (patch: Partial<Order> = {}) => OrderRepository.createOrder({ items: [], orderType: 'TAKEAWAY', orderStatus: 'COMPLETED', totalAmount: 250, subtotal: 250, paymentMethod: 'CASH', paymentStatus: 'SUCCESS', ...patch });
beforeEach(() => { db.resetToDefaultSeed(); db.orders = []; db.shifts = []; db.cashMovements = []; db.businessDays = []; db.kots = []; db.restaurant.operatingProfile = undefined; db.outlet.operatingProfile = undefined; BusinessDayRepository.getActiveBusinessDay(); });
afterEach(() => vi.useRealTimers());
describe('Found gaps implementation', () => {
  it('returns cash from a new till without changing the previous cash count; retries pay once', () => {
    const old = ShiftRepository.openShift('a', 'Asha', 0, 'old'); const order = paid({ shiftId: old.id });
    ShiftRepository.closeShift(old.id, 250);
    const current = ShiftRepository.openShift('b', 'Bina', 500, 'current');
    const options = { idempotencyKey: 'return-once', payingShiftId: current.id, method: 'CASH' as const };
    OrderRepository.refundOrder(order.id, 250, 'Returned', 'Actual manager', options);
    OrderRepository.refundOrder(order.id, 250, 'Returned', 'Actual manager', options);
    expect(old.actualCash).toBe(250); expect(old.expectedCash).toBe(250);
    expect(ShiftRepository.getShiftMetrics(current).expectedCash).toBe(250);
    expect(db.cashMovements).toHaveLength(1); expect(order.refundEvents).toHaveLength(1);
    expect(order.refundEvents![0].originalShiftId).toBe(old.id);
    expect(ShiftRepository.getShiftMetrics(current).totalSales).toBe(-250);
    ShiftRepository.getActiveShift('current'); ShiftRepository.getActiveShift('current');
    expect(buildShiftSummary(current,db.orders)).toMatchObject({totalCollected:-250,refundsAmount:250,paymentBreakdown:{cash:-250}});
    expect(buildShiftSummary(old,db.orders)).toMatchObject({totalCollected:250,refundsAmount:0,paymentBreakdown:{cash:250}});
  });
  it('refuses a short paying drawer and rolls back both journal and sale', () => {
    const original = ShiftRepository.openShift('a','Asha',0,'old'); const order = paid({shiftId:original.id}); ShiftRepository.closeShift(original.id,250);
    const till = ShiftRepository.openShift('b','Bina',10,'new');
    expect(() => OrderRepository.refundOrder(order.id,250,'Return','Manager',{idempotencyKey:'short',payingShiftId:till.id,method:'CASH'})).toThrow(/enough cash/);
    expect(db.orders[0].paymentStatus).toBe('SUCCESS'); expect(db.cashMovements).toHaveLength(0);
  });
  it('does not deduct the same journal cash return from sales and drawer movement twice', () => {
    const till = ShiftRepository.openShift('a','Asha',100,'a'); const order = paid({shiftId:till.id});
    OrderRepository.refundOrder(order.id,50,'Part','Manager',{idempotencyKey:'part',payingShiftId:till.id,method:'CASH'});
    expect(ShiftRepository.getShiftMetrics(till).expectedCash).toBe(300);
    expect(BusinessDayAccountingService.getBusinessDaySummary(order.businessDayId).cash_expected).toBe(300);
  });
  it('two confirmed partial returns sum correctly and the repeated key cannot change its amount', () => {
    const till=ShiftRepository.openShift('a','Asha',100,'a'); const order=paid({shiftId:till.id});
    OrderRepository.refundOrder(order.id,50,'Part','Manager',{idempotencyKey:'p1',payingShiftId:till.id,method:'CASH'});
    OrderRepository.refundOrder(order.id,50,'Part','Manager',{idempotencyKey:'p2',payingShiftId:till.id,method:'CASH'});
    expect(order.refundAmount).toBe(100); expect(ShiftRepository.getShiftMetrics(till).expectedCash).toBe(250);
    expect(() => OrderRepository.refundOrder(order.id,60,'Part','Manager',{idempotencyKey:'p1',payingShiftId:till.id,method:'CASH'})).toThrow(/retry/);
  });
  it('partial collections expose their true balance and never invent a cash tender', () => {
    const order=paid({paymentStatus:'PARTIALLY_PAID'}); order.paymentAllocationSummary={collectedPaise:10025,outstandingPaise:14975};
    expect(orderPaymentPosition(order)).toMatchObject({collectedPaise:10025,outstandingPaise:14975,netCollectedPaise:10025,tenders:{cash:0,other:100.25}});
    expect(summarizeBillingLedger([order])).toMatchObject({collected:100.25,pending:149.75});
    const summary=CentralReportingService.calculateFinancialSummary([order]);
    expect(summary.netCollected).toBe(100.25); expect(summary.outstandingAmount).toBe(149.75);
    expect(summary.paymentBreakdown.other).toBe(100.25); expect(summary.reconciled).toBe(true);
    expect(DayOrdersService.getDaySummary([order],BusinessDayRepository.getActiveBusinessDay().businessDate).openBills).toBe(149.75);
    expect(exportBillingCsv([order],db.restaurant,db.outlet,'Today','')).toContain('149.75');
  });
  it('wallet and unequal split receipts retain paise across the shared report projection', () => {
    const wallet=paid({paymentMethod:'WALLET',totalAmount:100.25,subtotal:100.25});
    const split=paid({paymentMethod:'SPLIT',totalAmount:100.10,subtotal:100.10,paymentSplits:[{method:'CASH',amount:10.10},{method:'UPI',amount:90}]});
    const report=ReportGeneratorService.calculateSummary([wallet,split]);
    expect(report.totalCollected).toBe(200.35); expect(report.paymentBreakdown).toMatchObject({wallet:100.25,cash:10.10,upi:90,split:100.10});
  });
  it('a late return preserves the closed day snapshot and pays out on the new day', () => {
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-11T10:00:00Z'));db.businessDays=[];
    const day=BusinessDayRepository.getActiveBusinessDay();const old=ShiftRepository.openShift('a','Asha',0,'a');const order=paid({shiftId:old.id});ShiftRepository.closeShift(old.id,250);
    BusinessDayService.closeBusinessDay({businessDayId:day.id,actualCash:250});
    vi.setSystemTime(new Date('2026-10-12T10:00:00Z')); const fresh=ShiftRepository.openShift('b','Bina',500,'b');
    OrderRepository.refundOrder(order.id,250,'Returned next day','Manager',{idempotencyKey:'next-day',payingShiftId:fresh.id,method:'CASH'});
    expect(BusinessDayRepository.recalculateMetrics(day.id)?.totalCollected).toBe(250);
    expect(BusinessDayAccountingService.getBusinessDaySummary(day.id).cash_expected).toBe(250);
    expect(BusinessDayAccountingService.getBusinessDaySummary(day.id)).toMatchObject({refunds:0,completed_orders:1,average_order_value:250});
    expect(BusinessDayAccountingService.getBusinessDaySummary(fresh.businessDayId).net_collected).toBe(-250);
  });
  it('a scheduled profile leaves today intact, switches tomorrow and respects branch overrides', () => {
    const profile={timezone:'America/New_York',cutoffHour:3,effectiveFrom:'2026-10-13',previous:{timezone:'Asia/Kolkata',cutoffHour:5}};
    expect(resolveOperatingProfile({operatingProfile:profile},undefined,new Date('2026-10-12T10:00:00Z')).timezone).toBe('Asia/Kolkata');
    expect(resolveOperatingProfile({operatingProfile:profile},undefined,new Date('2026-10-13T10:00:00Z')).timezone).toBe('America/New_York');
    expect(resolveOperatingProfile({operatingProfile:profile},{operatingProfile:{timezone:'UTC',cutoffHour:1}},new Date('2026-10-13T10:00:00Z')).timezone).toBe('UTC');
  });
  it('DST boundaries use calendar arithmetic instead of subtracting 24 hours', () => {
    db.restaurant.operatingProfile={timezone:'America/New_York',cutoffHour:5};
    expect(BusinessDayRepository.getCanonicalBusinessDate(new Date('2026-11-01T09:30:00Z')).dateKey).toBe('2026-10-31');
    expect(BusinessDayRepository.getCanonicalBusinessDate(new Date('2026-11-01T10:30:00Z')).dateKey).toBe('2026-11-01');
  });
  it('freezes untagged history before changing timezone and restores all acknowledged branding on a fresh terminal', () => {
    const order=paid();order.businessDayId=undefined;const previous=BusinessDayRepository.getCanonicalBusinessDate(new Date(order.createdAt)).dayId;
    RestaurantIdentityRepository.syncProfile({id:db.restaurant.id,name:'Actual Restaurant',operatingProfile:{timezone:'UTC',cutoffHour:0},branding:{logoUrl:'/actual-logo.png',ownerName:'Actual Owner',primaryColor:'#123456'},profileRevision:'revision-1'});
    expect(order.businessDayId).toBe(previous);expect(db.restaurant.logoUrl).toBe('/actual-logo.png');expect(db.restaurant.ownerName).toBe('Actual Owner');expect(db.restaurant.profileRevision).toBe('revision-1');
  });
  it('a fresh cloud terminal respects the original tagged business date after a cutoff change',() => {
    const order=paid({kioskId:'CLOUD-SYNC',createdAt:'2026-10-12T01:00:00Z',businessDayId:'BD-20261011'});
    db.restaurant.operatingProfile={timezone:'UTC',cutoffHour:0};
    expect(BusinessDayRepository.recordedBusinessDate(order)).toBe('2026-10-11');
    expect(DayOrdersService.getDaySummary([order],'2026-10-11').orderCount).toBe(1);
    const day={...BusinessDayRepository.getActiveBusinessDay(),id:'different-origin',businessDate:'2026-10-11'};
    expect(BusinessDayRepository.orderBelongsToBusinessDay(order,day)).toBe(true);
  });
  it('acknowledged legal identity replaces a previous device copy while nested phone branding survives',()=>{
    db.restaurant.address='Previous address';db.restaurant.gstin='Old GSTIN';
    RestaurantIdentityRepository.syncProfile({id:db.restaurant.id,name:'Restaurant',address:'New address',gstin:'New GSTIN',branding:{phone:'9999999999'},profileRevision:'cloud-revision'});
    expect(db.restaurant.address).toBe('New address');expect(db.restaurant.gstin).toBe('New GSTIN');expect(db.restaurant.phone).toBe('9999999999');
  });
});
