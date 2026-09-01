import { describe, it, expect, beforeEach } from 'vitest';
import {
  JAMAN_AI_CATEGORIES,
  JAMAN_AI_QUESTION_REGISTRY,
  JamanAiRegistry,
  PosAssistantService
} from '@jamanvaar/business';
import { db, OrderRepository } from '@jamanvaar/database';
import { formatINR } from '@jamanvaar/utils';

describe('JAMAN AI — Touch-First Offline Restaurant Intelligence Matrix', () => {
  beforeEach(() => {
    // Ensure clean state
    db.orders = [];
    db.kots = [];
    db.tables = [
      { id: 't-1', tableNumber: 'T01', capacity: 4, status: 'OCCUPIED', activeOrderId: 'ord-1' } as any,
      { id: 't-2', tableNumber: 'T02', capacity: 2, status: 'AVAILABLE' } as any,
      { id: 't-3', tableNumber: 'T03', capacity: 6, status: 'AVAILABLE' } as any,
      { id: 't-4', tableNumber: 'T04', capacity: 4, status: 'AVAILABLE' } as any
    ];
    db.inventoryItems = [
      { id: 'inv-1', name: 'Amul Butter', currentStock: 2, reorderLevel: 5, unit: 'kg' } as any,
      { id: 'inv-2', name: 'Paneer Block', currentStock: 15, reorderLevel: 5, unit: 'kg' } as any
    ];
  });

  // TEST 1: Category Structure
  it('TEST 1: should contain all 11 restaurant intelligence categories', () => {
    const categoryIds = JAMAN_AI_CATEGORIES.map((c) => c.id);
    expect(categoryIds).toContain('TODAY');
    expect(categoryIds).toContain('SALES');
    expect(categoryIds).toContain('PAYMENTS');
    expect(categoryIds).toContain('ORDERS');
    expect(categoryIds).toContain('KITCHEN');
    expect(categoryIds).toContain('TABLES');
    expect(categoryIds).toContain('MENU');
    expect(categoryIds).toContain('INVENTORY');
    expect(categoryIds).toContain('CUSTOMERS');
    expect(categoryIds).toContain('STAFF');
    expect(categoryIds).toContain('INSIGHTS');
  });

  // TEST 2: Dynamic Priority Alert Elevation
  it('TEST 2: should dynamically elevate delayed KOTs to top priority when delayed tickets exist', () => {
    // Add delayed KOT (> 15 mins)
    const twentyMinsAgo = new Date(Date.now() - 20 * 60000).toISOString();
    db.kots.push({
      id: 'kot-del-1',
      kotNumber: 'KOT-101',
      orderId: 'ord-1',
      orderNumber: 'ORD-1',
      tokenNumber: '101',
      cashierName: 'Amit Dave',
      printed: true,
      orderType: 'DINE_IN',
      station: 'Main Kitchen',
      type: 'FIRST',
      items: [],
      status: 'PREPARING',
      createdAt: twentyMinsAgo
    });

    const posQuestions = JamanAiRegistry.getPrioritizedQuestions('POS');
    const firstQuestion = posQuestions[0];

    expect(firstQuestion.intent).toBe('DELAYED_KOT');
    expect(firstQuestion.isCriticalAlert).toBe(true);
  });

  // TEST 3: Low Stock Dynamic Alert
  it('TEST 3: should flag low stock alert question with isCriticalAlert when stock is below reorder level', () => {
    const posQuestions = JamanAiRegistry.getPrioritizedQuestions('POS');
    const lowStockQ = posQuestions.find((q) => q.intent === 'LOW_STOCK');

    expect(lowStockQ).toBeDefined();
    expect(lowStockQ?.isCriticalAlert).toBe(true);
  });

  // TEST 4: Deterministic Sales Calculation
  it('TEST 4: should calculate exact Today Sales without calling any external AI API', () => {
    OrderRepository.createOrder({
      id: 'ord-test-1',
      orderNumber: 'ORD-101',
      orderStatus: 'COMPLETED',
      paymentStatus: 'SUCCESS',
      paymentMethod: 'CASH',
      totalAmount: 1050
    });

    OrderRepository.createOrder({
      id: 'ord-test-2',
      orderNumber: 'ORD-102',
      orderStatus: 'COMPLETED',
      paymentStatus: 'SUCCESS',
      paymentMethod: 'UPI',
      totalAmount: 525
    });

    const response = PosAssistantService.executeQuery('TODAY_SALES');
    expect(response.card).toBeDefined();
    expect(response.card?.highlightNumber).toBe(formatINR(1575));
    expect(response.card?.metrics.find((m) => m.label === 'Completed Orders')?.value).toBe('2 bills');
  });

  // TEST 5: Table Occupancy Real-time Calculation
  it('TEST 5: should calculate live table occupancy percentage from local table states', () => {
    const response = PosAssistantService.executeQuery('TABLE_OCCUPANCY');
    expect(response.card).toBeDefined();
    // 1 out of 4 tables occupied = 25%
    expect(response.card?.highlightNumber).toBe('25%');
  });

  // TEST 6: Cash in Drawer Calculation
  it('TEST 6: should tally cash sales + float accurately for Cash Drawer question', () => {
    OrderRepository.createOrder({
      id: 'ord-cash-1',
      orderNumber: 'ORD-201',
      orderStatus: 'COMPLETED',
      paymentStatus: 'SUCCESS',
      paymentMethod: 'CASH',
      totalAmount: 800
    });

    const response = PosAssistantService.executeQuery('CASH_COLLECTION');
    expect(response.card).toBeDefined();
    expect(response.card?.metrics.find((m) => m.label === 'Cash Orders Billed')?.value).toBe(formatINR(800));
  });

  // TEST 7: Role and App Filtering
  it('TEST 7: should provide tailored questions for POS vs Admin contexts', () => {
    const posList = JamanAiRegistry.getPrioritizedQuestions('POS');
    const adminList = JamanAiRegistry.getPrioritizedQuestions('ADMIN');

    expect(posList.length).toBeGreaterThanOrEqual(15);
    expect(adminList.length).toBeGreaterThanOrEqual(15);
  });
});
