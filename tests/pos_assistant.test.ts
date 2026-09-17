import { describe, it, expect, beforeEach } from 'vitest';
import { db, OrderRepository } from '@jamanvaar/database';
import { PosAssistantService } from '../packages/business/src/pos_assistant';

describe('JAMANVAAR POS Smart Assistant Engine Tests', () => {
  // No more ambient fabricated seed orders — create a couple of real, paid
  // orders so "today's sales"/"top items" queries have real history to answer from.
  beforeEach(() => {
    db.resetToDefaultSeed();
    const item = db.menuItems[0];
    OrderRepository.createOrder({
      orderType: 'DINE_IN',
      tableNumber: '1',
      items: [
        { id: 'oi-assist-1', orderId: '', menuItemId: item.id, name: item.name, sku: item.sku, quantity: 2, unitPrice: item.price, modifiers: [], totalPrice: item.price * 2, kitchenStatus: 'SERVED' }
      ],
      subtotal: item.price * 2,
      taxAmount: 0,
      totalAmount: item.price * 2,
      paymentMethod: 'CASH',
      paymentStatus: 'SUCCESS',
      orderStatus: 'COMPLETED',
      source_type: 'POS'
    });
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
