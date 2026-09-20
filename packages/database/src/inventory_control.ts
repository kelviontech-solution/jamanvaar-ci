import type { GoodsReceipt, InventoryBatch, StockCount, Supplier } from '@jamanvaar/types';
import { db } from './db';
import { AuditRepository, convertQuantity, InventoryRepository } from './repositories';

/**
 * Purchasing and control on top of the stock engine (BUG-046): suppliers, goods received with the
 * supplier's price (weighted-average costing), shelf life (batches sold first-expiry-first-out),
 * stock counts with variance and manager approval, dish costing, reorder suggestions and reports.
 *
 * Every operation checks everything before it changes anything, so a rejected receipt or count leaves
 * stock exactly as it was.
 */
const DAY_MS = 86_400_000;
/** A stock count whose total difference is worth more than this needs a manager (rupees). */
export const DEFAULT_ADJUSTMENT_APPROVAL_LIMIT = 5000;

const round2 = (n: number) => Math.round(n * 100) / 100;
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const sequence = (prefix: string, existing: string[]) => {
  const highest = existing.reduce((max, n) => Math.max(max, Number(n.slice(prefix.length + 1)) || 0), 0);
  return `${prefix}-${String(highest + 1).padStart(6, '0')}`;
};

export interface ReceiveGoodsInput {
  supplierId: string;
  invoiceNumber?: string;
  receivedBy: string;
  notes?: string;
  lines: Array<{ itemId: string; quantity: number; unitCost: number; expiryDate?: string }>;
}

export interface StockCountInput {
  countedBy: string;
  approvedBy?: string;
  note?: string;
  counts: Array<{ itemId: string; countedQuantity: number }>;
}

export class InventoryControl {
  // ---- suppliers ---------------------------------------------------------------------------------

  static getSuppliers(options: { includeInactive?: boolean } = {}): Supplier[] {
    return db.suppliers.filter((s) => options.includeInactive || s.isActive).sort((a, b) => a.name.localeCompare(b.name));
  }

  static addSupplier(data: Pick<Supplier, 'name'> & Partial<Omit<Supplier, 'id' | 'name' | 'createdAt' | 'updatedAt' | 'isActive'>>): Supplier {
    const name = (data.name || '').trim();
    if (!name) throw new Error('A supplier needs a name.');
    if (db.suppliers.some((s) => s.name.trim().toLowerCase() === name.toLowerCase())) {
      throw new Error(`A supplier called "${name}" already exists.`);
    }
    const now = new Date().toISOString();
    const supplier: Supplier = { ...data, name, id: uid('sup'), isActive: true, createdAt: now, updatedAt: now };
    db.suppliers.push(supplier);
    db.notify();
    return supplier;
  }

  static updateSupplier(id: string, updates: Partial<Omit<Supplier, 'id' | 'createdAt'>>): Supplier {
    const supplier = db.suppliers.find((s) => s.id === id);
    if (!supplier) throw new Error('Supplier not found.');
    if (updates.name !== undefined) {
      const name = updates.name.trim();
      if (!name) throw new Error('A supplier needs a name.');
      if (db.suppliers.some((s) => s.id !== id && s.name.trim().toLowerCase() === name.toLowerCase())) {
        throw new Error(`A supplier called "${name}" already exists.`);
      }
      updates = { ...updates, name };
    }
    Object.assign(supplier, updates, { updatedAt: new Date().toISOString() });
    db.notify();
    return supplier;
  }

  // ---- goods received ------------------------------------------------------------------------------

  static getGoodsReceipts(): GoodsReceipt[] {
    return [...db.goodsReceipts];
  }

  /**
   * Books a delivery: adds the stock, keeps a batch per line for expiry, updates each item's
   * weighted-average cost and remembers the price paid. All lines are checked first.
   */
  static receiveGoods(input: ReceiveGoodsInput): GoodsReceipt {
    const supplier = db.suppliers.find((s) => s.id === input.supplierId);
    if (!supplier) throw new Error('Choose the supplier this delivery came from.');
    if (!supplier.isActive) throw new Error(`${supplier.name} is inactive. Reactivate the supplier to receive goods from them.`);
    if (!input.lines || input.lines.length === 0) throw new Error('Add at least one item to the delivery.');

    const now = Date.now();
    const checked = input.lines.map((line, index) => {
      const item = InventoryRepository.getItemById(line.itemId);
      const where = `Line ${index + 1}`;
      if (!item) throw new Error(`${where}: that item is not in your stock list.`);
      if (!(line.quantity > 0)) throw new Error(`${where}: quantity for ${item.name} must be more than zero.`);
      if (!(line.unitCost >= 0) || !Number.isFinite(line.unitCost)) throw new Error(`${where}: the cost for ${item.name} cannot be negative.`);
      if (line.expiryDate) {
        const expiry = Date.parse(line.expiryDate);
        if (Number.isNaN(expiry)) throw new Error(`${where}: the expiry date for ${item.name} is not a valid date.`);
        if (expiry < now) throw new Error(`${where}: ${item.name} has already expired, so it cannot be received.`);
      }
      return { line, item };
    });

    const receiptedAt = new Date().toISOString();
    const number = sequence('GRN', db.goodsReceipts.map((g) => g.number));
    const receiptId = uid('grn');
    const lines: GoodsReceipt['lines'] = [];

    for (const { line, item } of checked) {
      const lineTotal = round2(line.quantity * line.unitCost);
      const heldValue = Math.max(0, item.currentStock) * item.costPerUnit;
      const heldQty = Math.max(0, item.currentStock);
      const newCost = heldQty <= 0 ? line.unitCost : round2((heldValue + line.quantity * line.unitCost) / (heldQty + line.quantity));

      InventoryRepository.recordMovement({
        itemId: item.id,
        itemName: item.name,
        type: 'PURCHASE',
        quantityDelta: line.quantity,
        unit: item.unit,
        costImpact: lineTotal,
        reason: `Goods received ${number} from ${supplier.name}${input.invoiceNumber ? ` (invoice ${input.invoiceNumber})` : ''}`,
        performedBy: input.receivedBy
      });
      InventoryRepository.updateItem(item.id, { costPerUnit: newCost, supplierName: supplier.name });

      const batch: InventoryBatch = {
        id: uid('batch'),
        itemId: item.id,
        receiptId,
        receivedAt: receiptedAt,
        expiryDate: line.expiryDate,
        quantityReceived: line.quantity,
        quantityRemaining: line.quantity,
        unitCost: line.unitCost
      };
      db.inventoryBatches.push(batch);
      lines.push({ itemId: item.id, itemName: item.name, unit: item.unit, quantity: line.quantity, unitCost: line.unitCost, expiryDate: line.expiryDate, lineTotal });
    }

    const receipt: GoodsReceipt = {
      id: receiptId,
      number,
      supplierId: supplier.id,
      supplierName: supplier.name,
      invoiceNumber: input.invoiceNumber,
      receivedAt: receiptedAt,
      receivedBy: input.receivedBy,
      lines,
      totalCost: round2(lines.reduce((sum, l) => sum + l.lineTotal, 0)),
      notes: input.notes
    };
    db.goodsReceipts.unshift(receipt);
    AuditRepository.log({
      action: 'GOODS_RECEIVED',
      category: 'INVENTORY',
      details: `${number} from ${supplier.name}: ${lines.length} item(s), ₹${receipt.totalCost}`,
      username: input.receivedBy
    });
    db.notify();
    return receipt;
  }

  /** What each supplier charged for an item, newest first, with how much the price moved since the purchase before. */
  static getSupplierPriceHistory(itemId: string) {
    const entries = db.goodsReceipts
      .flatMap((g) => g.lines.filter((l) => l.itemId === itemId).map((l) => ({ date: g.receivedAt, supplierName: g.supplierName, unitCost: l.unitCost, quantity: l.quantity, receiptNumber: g.number })))
      .sort((a, b) => b.date.localeCompare(a.date));
    return entries.map((e, i) => {
      const previous = entries[i + 1];
      return { ...e, changePercent: previous && previous.unitCost > 0 ? round2(((e.unitCost - previous.unitCost) / previous.unitCost) * 100) : null };
    });
  }

  // ---- shelf life ------------------------------------------------------------------------------------

  /** Batches with stock left that expire within `withinDays` (or already have), soonest first. */
  static getExpiringBatches(withinDays: number, now: Date = new Date()) {
    return db.inventoryBatches
      .filter((b) => b.expiryDate && b.quantityRemaining > 1e-9)
      .map((b) => {
        const item = InventoryRepository.getItemById(b.itemId);
        const msLeft = Date.parse(b.expiryDate as string) - now.getTime();
        return {
          batchId: b.id,
          itemId: b.itemId,
          itemName: item?.name ?? 'Unknown item',
          unit: item?.unit ?? '',
          quantityRemaining: round2(b.quantityRemaining),
          expiryDate: b.expiryDate as string,
          daysLeft: Math.ceil(msLeft / DAY_MS),
          expired: msLeft < 0
        };
      })
      .filter((b) => b.expired || b.daysLeft <= withinDays)
      .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
  }

  // ---- stock counts ------------------------------------------------------------------------------------

  static getStockCounts(): StockCount[] {
    return [...db.stockCounts];
  }

  /**
   * Sets stock to what was physically counted and records each difference. A count whose total
   * difference is worth more than the approval limit needs a manager's name.
   */
  static recordStockCount(input: StockCountInput): StockCount {
    if (!input.counts || input.counts.length === 0) throw new Error('Count at least one item.');
    const seen = new Set<string>();
    const lines: StockCount['lines'] = input.counts.map((c) => {
      const item = InventoryRepository.getItemById(c.itemId);
      if (!item) throw new Error('One of the counted items is not in your stock list.');
      if (seen.has(c.itemId)) throw new Error(`${item.name} is counted twice. Enter one count per item.`);
      seen.add(c.itemId);
      if (!Number.isFinite(c.countedQuantity) || c.countedQuantity < 0) throw new Error(`The count for ${item.name} cannot be negative.`);
      const variance = round2(c.countedQuantity - item.currentStock);
      return {
        itemId: item.id,
        itemName: item.name,
        unit: item.unit,
        systemQuantity: item.currentStock,
        countedQuantity: c.countedQuantity,
        variance,
        varianceValue: round2(variance * item.costPerUnit)
      };
    });

    const totalVarianceValue = round2(lines.reduce((sum, l) => sum + l.varianceValue, 0));
    const absoluteValue = lines.reduce((sum, l) => sum + Math.abs(l.varianceValue), 0);
    const limit = db.restaurant.stockAdjustmentApprovalLimit ?? DEFAULT_ADJUSTMENT_APPROVAL_LIMIT;
    if (absoluteValue > limit && !input.approvedBy) {
      throw new Error(`These differences are worth ₹${round2(absoluteValue)}, which is over the ₹${limit} limit. A manager needs to approve this count.`);
    }

    const number = sequence('COUNT', db.stockCounts.map((c) => c.number));
    for (const line of lines) {
      if (line.variance === 0) continue;
      InventoryRepository.recordMovement({
        itemId: line.itemId,
        itemName: line.itemName,
        type: 'ADJUSTMENT',
        quantityDelta: line.variance,
        unit: line.unit,
        costImpact: line.varianceValue,
        reason: `Stock count ${number}${input.note ? `: ${input.note}` : ''}`,
        performedBy: input.countedBy
      });
    }

    const count: StockCount = {
      id: uid('count'),
      number,
      countedAt: new Date().toISOString(),
      countedBy: input.countedBy,
      approvedBy: input.approvedBy,
      lines,
      totalVarianceValue,
      note: input.note
    };
    db.stockCounts.unshift(count);
    AuditRepository.log({
      action: 'STOCK_COUNT_RECORDED',
      category: 'INVENTORY',
      details: `${number}: ${lines.filter((l) => l.variance !== 0).length} of ${lines.length} item(s) differed, net ₹${totalVarianceValue}${input.approvedBy ? `, approved by ${input.approvedBy}` : ''}`,
      username: input.countedBy
    });
    db.notify();
    return count;
  }

  // ---- costing -----------------------------------------------------------------------------------------

  /** Cost of one portion of each dish from its recipe, with food-cost percent and margin. */
  static getDishCosts() {
    return db.recipes
      .filter((r) => r.isActive)
      .map((recipe) => {
        let cost = 0;
        let incomplete = false;
        for (const ing of recipe.ingredients) {
          const item = InventoryRepository.getItemById(ing.inventoryItemId);
          const qty = item ? convertQuantity(ing.quantityPerPortion, ing.unit, item.unit) : null;
          if (!item || qty === null) {
            incomplete = true;
            continue;
          }
          cost += qty * item.costPerUnit;
        }
        const dish = db.menuItems.find((m) => m.id === recipe.menuItemId);
        const price = dish?.price ?? 0;
        return {
          menuItemId: recipe.menuItemId,
          name: recipe.menuItemName,
          price,
          cost: round2(cost),
          foodCostPercent: price > 0 ? round2((cost / price) * 100) : null,
          marginAmount: round2(price - cost),
          incomplete
        };
      });
  }

  // ---- reordering -----------------------------------------------------------------------------------------

  /** Items to buy: at or below their reorder level, running out within three days, or already out. */
  static getReorderSuggestions(options: { days?: number; now?: Date } = {}) {
    const days = options.days ?? 14;
    const since = (options.now ?? new Date()).getTime() - days * DAY_MS;
    return InventoryRepository.getAllItems()
      .map((item) => {
        const used = db.stockMovements
          .filter((m) => m.itemId === item.id && m.type === 'SALE' && Date.parse(m.timestamp) >= since)
          .reduce((sum, m) => sum + Math.abs(m.quantityDelta), 0);
        const averageDailyUse = round2(used / days);
        const daysOfStockLeft = averageDailyUse > 0 ? round2(Math.max(0, item.currentStock) / averageDailyUse) : null;
        const target = Math.max(item.reorderLevel * 2, Math.ceil(averageDailyUse * 7));
        const last = db.goodsReceipts.flatMap((g) => g.lines.filter((l) => l.itemId === item.id).map((l) => ({ g, l }))).sort((a, b) => b.g.receivedAt.localeCompare(a.g.receivedAt))[0];
        const needs = item.currentStock <= 0 || (item.reorderLevel > 0 && item.currentStock <= item.reorderLevel) || (daysOfStockLeft !== null && daysOfStockLeft <= 3);
        return {
          needs,
          itemId: item.id,
          itemName: item.name,
          unit: item.unit,
          currentStock: item.currentStock,
          reorderLevel: item.reorderLevel,
          averageDailyUse,
          daysOfStockLeft,
          suggestedQuantity: Math.max(round2(target - item.currentStock), item.currentStock <= 0 ? 1 : 0),
          lastSupplierName: last?.g.supplierName ?? item.supplierName ?? null,
          lastUnitCost: last?.l.unitCost ?? item.costPerUnit
        };
      })
      .filter((s) => s.needs)
      .map(({ needs: _needs, ...rest }) => rest)
      .sort((a, b) => (a.daysOfStockLeft ?? Infinity) - (b.daysOfStockLeft ?? Infinity));
  }

  // ---- reports ------------------------------------------------------------------------------------------------

  /** What the stock on the shelves is worth at cost. Negative balances count as zero and are listed separately. */
  static getStockValuation() {
    const byCategory = new Map<string, number>();
    const negativeItems: Array<{ itemId: string; itemName: string; currentStock: number; unit: string }> = [];
    let total = 0;
    for (const item of InventoryRepository.getAllItems()) {
      if (item.currentStock < 0) negativeItems.push({ itemId: item.id, itemName: item.name, currentStock: item.currentStock, unit: item.unit });
      const value = Math.max(0, item.currentStock) * item.costPerUnit;
      total += value;
      byCategory.set(item.category, (byCategory.get(item.category) ?? 0) + value);
    }
    return {
      total: round2(total),
      byCategory: [...byCategory.entries()].map(([category, value]) => ({ category, value: round2(value) })).sort((a, b) => b.value - a.value),
      negativeItems
    };
  }

  private static inPeriod(timestamp: string, from: Date, to: Date) {
    const t = Date.parse(timestamp);
    return t >= from.getTime() && t <= to.getTime();
  }

  /** Waste and spoilage in a period, by reason, with what it cost. */
  static getWastageReport(from: Date, to: Date) {
    const byReason = new Map<string, { quantity: number; cost: number }>();
    let totalCost = 0;
    for (const m of db.stockMovements) {
      if ((m.type !== 'WASTE' && m.type !== 'SPOILAGE') || !this.inPeriod(m.timestamp, from, to)) continue;
      const item = InventoryRepository.getItemById(m.itemId);
      const cost = m.costImpact !== undefined ? Math.abs(m.costImpact) : Math.abs(m.quantityDelta) * (item?.costPerUnit ?? 0);
      const reason = m.wastageReasonCode ?? (m.type === 'SPOILAGE' ? 'EXPIRED_SPOILED' : 'OTHER');
      const entry = byReason.get(reason) ?? { quantity: 0, cost: 0 };
      entry.quantity += Math.abs(m.quantityDelta);
      entry.cost += cost;
      byReason.set(reason, entry);
      totalCost += cost;
    }
    return {
      totalCost: round2(totalCost),
      byReason: [...byReason.entries()].map(([reason, v]) => ({ reason, quantity: round2(v.quantity), cost: round2(v.cost) })).sort((a, b) => b.cost - a.cost)
    };
  }

  /** How much of each item went out in a period: sold, wasted, and net counted adjustments. */
  static getConsumptionReport(from: Date, to: Date) {
    const rows = new Map<string, { itemId: string; itemName: string; unit: string; sold: number; wasted: number; adjusted: number }>();
    for (const m of db.stockMovements) {
      if (!this.inPeriod(m.timestamp, from, to)) continue;
      const row = rows.get(m.itemId) ?? { itemId: m.itemId, itemName: m.itemName, unit: m.unit, sold: 0, wasted: 0, adjusted: 0 };
      if (m.type === 'SALE') row.sold += -m.quantityDelta;
      else if (m.type === 'SALE_REVERSAL') row.sold -= m.quantityDelta;
      else if (m.type === 'WASTE' || m.type === 'SPOILAGE') row.wasted += -m.quantityDelta;
      else if (m.type === 'ADJUSTMENT') row.adjusted += m.quantityDelta;
      rows.set(m.itemId, row);
    }
    return [...rows.values()].map((r) => {
      const cost = InventoryRepository.getItemById(r.itemId)?.costPerUnit ?? 0;
      return { ...r, sold: round2(r.sold), wasted: round2(r.wasted), adjusted: round2(r.adjusted), valueConsumed: round2((r.sold + r.wasted) * cost) };
    });
  }
}
