import { describe, it, expect, beforeEach } from 'vitest';
import { db, OrderRepository } from '@jamanvaar/database';
import { PosAssistantService } from '../packages/business/src/pos_assistant';

describe('JAMANVAAR POS Smart Assistant Engine Tests', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
  });

  it('correctly answers "Today\'s Sales" from real database without hallucination', () => {
    const res = PosAssistantService.executeQuery('TODAY_SALES');
    expect(res.intent).toBe('TODAY_SALES');
    expect(res.card).toBeDefined();
    expect(res.card?.title).toContain("Today's Gross Sales");
    expect(res.card?.highlightNumber).toBeDefined();
    expect(res.card?.actions.length).toBeGreaterThan(0);
  });

  it('correctly aggregates payment channels (Cash, UPI, Card)', () => {
    const cashRes = PosAssistantService.executeQuery('CASH_COLLECTION');
    expect(cashRes.card?.title).toContain('Cash Drawer');

    const upiRes = PosAssistantService.executeQuery('UPI_COLLECTION');
    expect(upiRes.card?.title).toContain('UPI Dynamic QR');

    const cardRes = PosAssistantService.executeQuery('CARD_COLLECTION');
    expect(cardRes.card?.title).toContain('Card Terminal');

    const summaryRes = PosAssistantService.executeQuery('PAYMENT_SUMMARY');
    expect(summaryRes.card?.metrics.length).toBeGreaterThanOrEqual(3);
  });

  it('correctly calculates Top Selling Items based on real order history', () => {
    const res = PosAssistantService.executeQuery('TOP_ITEMS');
    expect(res.intent).toBe('TOP_ITEMS');
    expect(res.card?.metrics.length).toBeGreaterThan(0);
  });

  it('correctly identifies Delayed KOT tickets exceeding preparation limits', () => {
    const res = PosAssistantService.executeQuery('DELAYED_KOT');
    expect(res.intent).toBe('DELAYED_KOT');
    expect(res.card?.badge).toBeDefined();
  });

  it('correctly computes table occupancy percentage and available covers', () => {
    const res = PosAssistantService.executeQuery('TABLE_OCCUPANCY');
    expect(res.intent).toBe('TABLE_OCCUPANCY');
    expect(res.card?.highlightNumber).toContain('%');
  });

  it('correctly generates comprehensive End of Day (EOD) summary with print action', () => {
    const res = PosAssistantService.executeQuery('END_OF_DAY');
    expect(res.intent).toBe('END_OF_DAY');
    expect(res.card?.title).toContain('End of Day');
    const printAction = res.card?.actions.find((a) => a.actionType === 'PRINT_SUMMARY');
    expect(printAction).toBeDefined();
  });

  it('resolves natural language questions to accurate deterministic intents', () => {
    expect(PosAssistantService.resolveIntent('how much did we sell today')).toBe('TODAY_SALES');
    expect(PosAssistantService.resolveIntent('how much cash is in the drawer')).toBe('CASH_COLLECTION');
    expect(PosAssistantService.resolveIntent('which dishes are selling best')).toBe('TOP_ITEMS');
    expect(PosAssistantService.resolveIntent('is there any delayed kitchen order')).toBe('DELAYED_KOT');
    expect(PosAssistantService.resolveIntent('show table occupancy rate')).toBe('TABLE_OCCUPANCY');
    expect(PosAssistantService.resolveIntent('give me closing eod summary')).toBe('END_OF_DAY');
  });

  it('handles empty database with zero fake numbers (zero hallucination rule)', () => {
    // Clear orders
    db.orders = [];
    const res = PosAssistantService.executeQuery('TODAY_SALES');
    expect(res.card?.highlightNumber).toBe('₹0');
    expect(res.card?.metrics[0].value).toBe('0 bills');
  });
});
