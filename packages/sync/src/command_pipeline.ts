import {
  db,
  BusinessDayAccountingService,
  OrderRepository,
  BusinessDayRepository,
  TableRepository,
  KOTRepository,
  projectTableBillState
} from '@jamanvaar/database';
import {
  Order,
  OrderItem,
  KOTRecord,
  KOTStatus,
  TableStatus,
  DiningTable
} from '@jamanvaar/types';
import { lanMeshSync } from './lan_mesh_sync';
import { generateUUID } from '@jamanvaar/utils';

export type RestaurantCommandType =
  | 'CREATE_ORDER'
  | 'ADD_ITEMS_TO_ORDER'
  | 'UPDATE_KOT_STATUS'
  | 'REQUEST_BILL'
  | 'COMPLETE_PAYMENT'
  | 'TRANSFER_TABLE'
  | 'MERGE_TABLES'
  | 'SEND_MESSAGE'
  | 'RESOLVE_MESSAGE'
  | 'UPDATE_DISH_AVAILABILITY'
  | 'PAIR_DEVICE';

export interface RestaurantCommand<T = any> {
  commandId: string; // Unique Idempotency Key
  type: RestaurantCommandType;
  deviceId: string;
  senderRole: 'POS' | 'CAPTAIN' | 'KDS' | 'ADMIN' | 'KIOSK';
  timestamp: string;
  payload: T;
}

export interface CommandResult<T = any> {
  success: boolean;
  commandId: string;
  data?: T;
  error?: string;
  emittedEvents: string[];
}

export class RestaurantCommandPipeline {
  private static executedCommandIds: Set<string> = new Set();
  private static commandResultsCache: Map<string, CommandResult> = new Map();

  /**
   * Station Routing Classifier based on Category and Item SKU
   */
  public static resolveKitchenStation(item: any): string {
    const name = (item.name || '').toLowerCase();
    if (name.includes('tikka') || name.includes('naan') || name.includes('roti') || name.includes('kebab')) {
      return 'TANDOOR';
    }
    if (name.includes('dal') || name.includes('paneer') || name.includes('sabzi') || name.includes('curry')) {
      return 'CURRY';
    }
    if (name.includes('coffee') || name.includes('tea') || name.includes('juice') || name.includes('shake') || name.includes('beverage')) {
      return 'BEVERAGE';
    }
    if (name.includes('jamun') || name.includes('halwa') || name.includes('ice cream') || name.includes('dessert') || name.includes('sweet')) {
      return 'DESSERT';
    }
    return 'MAIN_KITCHEN';
  }

  /**
   * Authoritative Command Execution Engine
   */
  public static async executeCommand<T = any>(command: RestaurantCommand<T>): Promise<CommandResult> {
    // 1. Idempotency Check: Prevent duplicate executions if network retries
    if (this.executedCommandIds.has(command.commandId)) {
      const cached = this.commandResultsCache.get(command.commandId);
      if (cached) return cached;
    }

    const emittedEvents: string[] = [];

    try {
      let resultData: any = null;

      switch (command.type) {
        case 'CREATE_ORDER': {
          const { orderData, tableNumber, items, orderType, paymentMethod } = command.payload as any;
          const activeDay = BusinessDayAccountingService.getActiveBusinessDay();

          // Create authoritative order
          const createdOrder = OrderRepository.createOrder({
            ...orderData,
            orderType: orderType || 'DINE_IN',
            tableNumber,
            items: (items || []).map((it: any, idx: number) => ({
              id: it.id || `oi-${Date.now()}-${idx + 1}`,
              orderId: '',
              menuItemId: it.dishId || it.menuItemId || `menu-${idx + 1}`,
              name: it.name || 'Dish',
              sku: it.sku || `SKU-${idx + 1}`,
              quantity: it.quantity || 1,
              unitPrice: it.unitPrice || 0,
              modifiers: it.modifiers || [],
              specialInstructions: it.notes || it.specialInstructions,
              totalPrice: (it.unitPrice || 0) * (it.quantity || 1),
              kitchenStatus: 'PENDING'
            })),
            paymentMethod: paymentMethod || 'CASH_AT_COUNTER',
            paymentStatus: paymentMethod === 'CASH_AT_COUNTER' ? 'PENDING' : 'SUCCESS',
            source_type: command.senderRole === 'CAPTAIN' ? 'CAPTAIN' : command.senderRole === 'POS' ? 'POS' : 'KIOSK',
            kioskId: command.deviceId,
            businessDayId: activeDay.id
          });

          // Update Table State if Dine-in
          if (tableNumber) {
            const table = db.tables.find((t) => t.tableNumber === tableNumber);
            if (table) {
              table.status = 'OCCUPIED';
              table.currentOrderId = createdOrder.id;
              emittedEvents.push('TABLE_UPDATED');
              lanMeshSync.broadcast('TABLE_UPDATED', table);
            }
          }

          // Create KOT Tickets and Route to Kitchen Stations
          const kotCount = (db.kots || []).length + 1;
          const kotNumber = `KOT-${String(kotCount).padStart(3, '0')}`;
          
          const kotRecord: KOTRecord = {
            id: generateUUID(),
            kotNumber,
            orderId: createdOrder.id,
            orderNumber: createdOrder.orderNumber,
            tokenNumber: createdOrder.tokenNumber,
            tableNumber: createdOrder.tableNumber,
            orderType: createdOrder.orderType,
            station: 'Main Kitchen',
            type: 'FIRST',
            status: 'PREPARING',
            items: (items || []).map((it: any) => ({
              id: generateUUID(),
              menuItemId: it.dishId || it.menuItemId || 'item-01',
              name: it.name,
              quantity: it.quantity,
              kitchenStation: this.resolveKitchenStation(it),
              modifiers: it.modifiers || [],
              specialInstructions: it.notes || it.specialInstructions,
              status: 'PREPARING',
              station: this.resolveKitchenStation(it)
            })),
            printed: false,
            createdAt: new Date().toISOString(),
            cashierName: command.senderRole === 'CAPTAIN' ? 'Captain Floor' : 'Counter POS'
          };

          db.kots.unshift(kotRecord);
          emittedEvents.push('ORDER_CREATED', 'KOT_CREATED');

          // Broadcast authoritative events to all connected clients
          lanMeshSync.broadcast('ORDER_CREATED', createdOrder);
          lanMeshSync.broadcast('KOT_CREATED', kotRecord);

          resultData = { order: createdOrder, kot: kotRecord };
          break;
        }

        case 'UPDATE_KOT_STATUS': {
          const { kotId, status, station } = command.payload as any;
          const kot = db.kots.find((k) => k.id === kotId);
          if (!kot) {
            throw new Error(`KOT ${kotId} not found`);
          }

          const targetStatus: KOTStatus = status === 'COOKING' ? 'PREPARING' : (status as KOTStatus);
          kot.status = targetStatus;

          // Update individual item statuses
          kot.items.forEach((it: any) => {
            if (!station || it.kitchenStation === station || it.station === station) {
              it.status = targetStatus;
            }
          });

          // Check if table food is ready
          if (targetStatus === 'READY' && kot.tableNumber) {
            const table = db.tables.find((t) => t.tableNumber === kot.tableNumber);
            if (table && table.status !== 'BILL_REQUESTED' && table.status !== 'BILLING') {
              (table as any).status = 'FOOD_READY';
              lanMeshSync.broadcast('TABLE_UPDATED', table);
            }
          }

          emittedEvents.push('KOT_STATUS_CHANGED');
          lanMeshSync.broadcast('KOT_STATUS_CHANGED', { kotId: kot.id, status: kot.status, kot });

          if (targetStatus === 'READY') {
            emittedEvents.push('FOOD_READY');
            lanMeshSync.broadcast('FOOD_READY', { kotId: kot.id, orderNumber: kot.orderNumber, tableNumber: kot.tableNumber });
          }

          resultData = kot;
          break;
        }

        case 'REQUEST_BILL': {
          const { tableNumber } = command.payload as any;
          const table = db.tables.find((t) => t.tableNumber === tableNumber);
          if (!table) throw new Error(`Table ${tableNumber} not found`);
          // The request belongs to the table's open order, the same as a captain's request on the device.
          const order = table.currentOrderId ? db.orders.find((o) => o.id === table.currentOrderId) : undefined;
          if (!order) throw new Error(`Table ${tableNumber} has no open order to bill`);
          order.billRequestedAt = new Date().toISOString();
          order.updatedAt = order.billRequestedAt;
          order.syncStatus = 'SAVED_LOCALLY';
          projectTableBillState(table);

          emittedEvents.push('BILL_REQUESTED', 'TABLE_UPDATED');
          lanMeshSync.broadcast('TABLE_UPDATED', table);

          resultData = table;
          break;
        }

        case 'TRANSFER_TABLE': {
          const { sourceTableNumber, targetTableNumber, transferredBy } = command.payload as any;
          const srcTable = db.tables.find((t) => t.tableNumber === sourceTableNumber);
          const tgtTable = db.tables.find((t) => t.tableNumber === targetTableNumber);

          if (!srcTable || !tgtTable) throw new Error('Source or Target table not found');
          if (tgtTable.status !== 'AVAILABLE') throw new Error(`Target table ${targetTableNumber} is occupied`);

          // Transfer active order to target
          if (srcTable.currentOrderId) {
            const order = db.orders.find((o) => o.id === srcTable.currentOrderId);
            if (order) {
              order.tableNumber = targetTableNumber;
              order.updatedAt = new Date().toISOString();
            }

            // Transfer associated KOTs
            db.kots.forEach((k) => {
              if (k.orderId === srcTable.currentOrderId || k.tableNumber === sourceTableNumber) {
                k.tableNumber = targetTableNumber;
              }
            });
          }

          tgtTable.status = 'OCCUPIED';
          tgtTable.currentOrderId = srcTable.currentOrderId;
          tgtTable.currentGuests = srcTable.currentGuests;

          srcTable.status = 'AVAILABLE';
          srcTable.currentOrderId = undefined;
          srcTable.currentGuests = undefined;

          emittedEvents.push('TABLE_TRANSFERRED', 'TABLE_UPDATED');
          lanMeshSync.broadcast('TABLE_TRANSFERRED', {
            sourceTableNumber,
            targetTableNumber,
            transferredBy: transferredBy || 'Captain Floor'
          });
          lanMeshSync.broadcast('TABLE_UPDATED', srcTable);
          lanMeshSync.broadcast('TABLE_UPDATED', tgtTable);

          resultData = { sourceTable: srcTable, targetTable: tgtTable };
          break;
        }

        case 'COMPLETE_PAYMENT': {
          const { orderId, paymentMethod, amount } = command.payload as any;
          const order = db.orders.find((o) => o.id === orderId);
          if (!order) throw new Error(`Order ${orderId} not found`);

          order.paymentStatus = 'SUCCESS';
          order.orderStatus = 'COMPLETED';
          order.paymentMethod = paymentMethod || order.paymentMethod;
          order.updatedAt = new Date().toISOString();

          // Free up Table
          if (order.tableNumber) {
            const table = db.tables.find((t) => t.tableNumber === order.tableNumber);
            if (table) {
              table.status = 'AVAILABLE';
              table.currentOrderId = undefined;
              table.currentGuests = undefined;
              lanMeshSync.broadcast('TABLE_UPDATED', table);
            }
          }

          emittedEvents.push('PAYMENT_COMPLETED', 'ORDER_COMPLETED');
          lanMeshSync.broadcast('PAYMENT_COMPLETED', { orderId: order.id, amount: order.totalAmount, paymentMethod });
          lanMeshSync.broadcast('ORDER_UPDATED', order);

          resultData = order;
          break;
        }

        case 'SEND_MESSAGE': {
          const { message, targetRole, tableNumber, senderName } = command.payload as any;
          const msgPayload = {
            id: generateUUID(),
            message,
            targetRole: targetRole || 'ALL',
            tableNumber,
            senderName: senderName || command.senderRole,
            senderRole: command.senderRole,
            timestamp: new Date().toISOString(),
            status: 'NEW'
          };

          if (!db.auditLogs) db.auditLogs = [];
          db.auditLogs.unshift({
            id: msgPayload.id,
            action: 'FLOOR_MESSAGE',
            category: 'COMMUNICATION',
            details: `[${msgPayload.senderName}] ${message} (Table ${tableNumber || 'Floor'})`,
            timestamp: msgPayload.timestamp
          });

          emittedEvents.push('CAPTAIN_MESSAGE');
          lanMeshSync.broadcast('CAPTAIN_MESSAGE', msgPayload);

          resultData = msgPayload;
          break;
        }

        default:
          throw new Error(`Unsupported command type: ${command.type}`);
      }

      db.notify();

      const result: CommandResult = {
        success: true,
        commandId: command.commandId,
        data: resultData,
        emittedEvents
      };

      this.executedCommandIds.add(command.commandId);
      this.commandResultsCache.set(command.commandId, result);
      return result;
    } catch (err: any) {
      console.error(`Command execution failed [${command.type}]:`, err);
      const failResult: CommandResult = {
        success: false,
        commandId: command.commandId,
        error: err?.message || 'Command failed',
        emittedEvents: []
      };
      return failResult;
    }
  }
}
