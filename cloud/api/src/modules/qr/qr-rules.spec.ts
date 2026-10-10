import { describe, it, expect } from 'vitest';
import { DEFAULT_QR_RULES, orderingAvailability, qrRulesSchema } from './qr-rules';
describe('restaurant-timezone QR schedules',()=>{
 it('keeps existing always-open behavior unless configured',()=>expect(orderingAvailability(DEFAULT_QR_RULES,'Asia/Kolkata').available).toBe(true));
 it('opens and closes at the exact local boundaries',()=>{
  const r={...DEFAULT_QR_RULES,hours:[{day:6,open:'10:00',close:'14:00'}]};
  expect(orderingAvailability(r,'Asia/Kolkata',new Date('2026-10-10T04:29:00Z')).available).toBe(false);
  expect(orderingAvailability(r,'Asia/Kolkata',new Date('2026-10-10T04:30:00Z')).available).toBe(true);
  expect(orderingAvailability(r,'Asia/Kolkata',new Date('2026-10-10T08:30:00Z')).available).toBe(false);
 });
 it('handles overnight Sunday rollover without opening every morning',()=>{
  const r={...DEFAULT_QR_RULES,hours:[{day:6,open:'22:00',close:'02:00'}]};
  expect(orderingAvailability(r,'Asia/Kolkata',new Date('2026-10-10T19:30:00Z')).available).toBe(true);
  expect(orderingAvailability(r,'Asia/Kolkata',new Date('2026-10-11T19:30:00Z')).available).toBe(false);
 });
 it('pause takes precedence, then expires without another settings save',()=>{
  const r={...DEFAULT_QR_RULES,pausedUntil:'2026-10-10T12:00:00Z'};
  expect(orderingAvailability(r,'Asia/Kolkata',new Date('2026-10-10T11:59:59Z')).available).toBe(false);
  expect(orderingAvailability(r,'Asia/Kolkata',new Date('2026-10-10T12:00:00Z')).available).toBe(true);
 });
 it('rejects unsafe values, invalid clocks, extra keys and an empty modes list',()=>{
  for(const r of [{hours:[{day:7,open:'09:00',close:'25:00'}]},{minimumOrderPaise:-1},{orderingModes:[]},{windowMinutes:0},{unexpected:true}])expect(qrRulesSchema.safeParse(r).success).toBe(false);
 });
});
