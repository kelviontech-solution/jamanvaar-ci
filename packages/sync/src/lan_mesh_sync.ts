import {
  Order,
  KOTRecord,
  MenuItem,
  Category,
  DiningTable,
  User,
  SyncEventType,
  SyncEventStatus
} from '@jamanvaar/types';
import { generateUUID } from '@jamanvaar/utils';
import { db, JamanvaarDatabase, NotificationRepository } from '@jamanvaar/database';

export type MeshDeviceRole = 'POS' | 'POS_ADMIN' | 'CAPTAIN' | 'KDS' | 'KIOSK_USER' | 'KIOSK_ADMIN';

export interface MeshPeerInfo {
  deviceId: string;
  role: MeshDeviceRole;
  name: string;
  /** Not populated: a browser cannot discover its own LAN-visible IP address. */
  ipAddress?: string;
  appVersion: string;
  lastHeartbeat: string;
  status: 'ONLINE' | 'OFFLINE' | 'SYNCING';
  assignedSection?: string;
  /** Not populated: this transport (BroadcastChannel/localStorage) has no real round-trip ping. Consumers should derive freshness from lastHeartbeat instead. */
  latencyMs?: number;
}

export interface MeshSyncEvent<T = any> {
  eventId: string;
  operationId: string;
  eventType: string;
  restaurantId: string;
  deviceId: string;
  senderRole: MeshDeviceRole;
  timestamp: string;
  version: number;
  payload: T;
}

export interface OutboxQueueItem {
  id: string;
  operationId: string;
  eventType: string;
  payload: any;
  status: 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED' | 'CONFLICT';
  retryCount: number;
  createdAt: string;
  lastAttemptAt?: string;
  errorMessage?: string;
}

export type MeshEventListener<T = any> = (event: MeshSyncEvent<T>) => void;

const CLUSTER_CHANNEL_NAME = 'jamanvaar_restaurant_sync_cluster_v1';

export class LanMeshSyncEngine {
  private static instance: LanMeshSyncEngine;
  private channel: BroadcastChannel | null = null;
  private deviceRole: MeshDeviceRole = 'POS_ADMIN';
  private deviceId: string = 'ADMIN-01';
  private deviceName: string = 'Restaurant Admin Center';
  private isOnline: boolean = true;
  private listeners: Map<string, Set<MeshEventListener>> = new Map();
  private allListeners: Set<MeshEventListener> = new Set();
  private processedEventIds: Set<string> = new Set();
  private peers: Map<string, MeshPeerInfo> = new Map();
  private outbox: OutboxQueueItem[] = [];
  private heartbeatTimer: any = null;
  private attachedDatabase: JamanvaarDatabase = db;

  private constructor() {
    this.initBroadcastChannel();
    this.initLocalStorageFallback();
    this.startHeartbeatLoop();
  }

  public static getInstance(): LanMeshSyncEngine {
    if (!LanMeshSyncEngine.instance) {
      LanMeshSyncEngine.instance = new LanMeshSyncEngine();
    }
    return LanMeshSyncEngine.instance;
  }

  public setAttachedDatabase(database: JamanvaarDatabase): void {
    this.attachedDatabase = database;
  }

  /**
   * Register this application instance on the mesh sync cluster
   */
  public registerDevice(role: MeshDeviceRole, deviceId?: string, name?: string): void {
    this.deviceRole = role;
    if (deviceId) this.deviceId = deviceId;
    if (name) this.deviceName = name;

    // Broadcast initial join heartbeat
    this.broadcastHeartbeat();
  }

  public getDeviceId(): string {
    return this.deviceId;
  }

  public getDeviceRole(): MeshDeviceRole {
    return this.deviceRole;
  }

  public getIsOnline(): boolean {
    return this.isOnline;
  }

  public setOnlineStatus(online: boolean): void {
    const prev = this.isOnline;
    this.isOnline = online;
    if (!prev && online) {
      // Reconnected! Process queued outbox operations
      this.processOutbox();
      this.broadcastHeartbeat();
    }
  }

  public getConnectedPeers(): MeshPeerInfo[] {
    const now = Date.now();
    const activePeers: MeshPeerInfo[] = [];

    this.peers.forEach((peer) => {
      const lastSeen = new Date(peer.lastHeartbeat).getTime();
      if (now - lastSeen < 18000) {
        peer.status = 'ONLINE';
        activePeers.push(peer);
      } else {
        peer.status = 'OFFLINE';
      }
    });

    return activePeers;
  }

  public getOutboxCount(): number {
    return this.outbox.filter((i) => i.status === 'PENDING' || i.status === 'FAILED').length;
  }

  /**
   * Subscribe to specific event type
   */
  public on<T = any>(eventType: string, listener: MeshEventListener<T>): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener);

    return () => {
      this.listeners.get(eventType)?.delete(listener);
    };
  }

  /**
   * Subscribe to all events across the mesh
   */
  public subscribeAll(listener: MeshEventListener): () => void {
    this.allListeners.add(listener);
    return () => {
      this.allListeners.delete(listener);
    };
  }

  public onAny(listener: MeshEventListener): () => void {
    return this.subscribeAll(listener);
  }

  /**
   * Broadcast an event across all peers (POS, Admin, Captain, KDS)
   */
  public broadcast<T = any>(eventType: string, payload: T, operationId?: string): MeshSyncEvent<T> {
    const opId = operationId || generateUUID();
    const event: MeshSyncEvent<T> = {
      eventId: generateUUID(),
      operationId: opId,
      eventType,
      restaurantId: this.attachedDatabase?.restaurant?.id || 'rest-jamanvaar-01',
      deviceId: this.deviceId,
      senderRole: this.deviceRole,
      timestamp: new Date().toISOString(),
      version: 1,
      payload
    };

    // If offline, queue in outbox for automatic retry upon reconnection
    if (!this.isOnline) {
      this.outbox.push({
        id: event.eventId,
        operationId: opId,
        eventType,
        payload,
        status: 'PENDING',
        retryCount: 0,
        createdAt: event.timestamp
      });
      // Apply locally first (optimistic offline response)
      this.applyEventLocally(event, false);
      return event;
    }

    // Mark as processed locally so we don't double-process our own broadcast
    this.processedEventIds.add(event.eventId);

    // Apply to local DB
    this.applyEventLocally(event, false);

    // 1. BroadcastChannel transport
    if (this.channel) {
      try {
        this.channel.postMessage(event);
      } catch (err) {
        console.warn('[MeshSync] BroadcastChannel post error:', err);
      }
    }

    // 2. LocalStorage transport fallback for multi-window / multi-process
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('jamanvaar_mesh_last_event', JSON.stringify(event));
      }
    } catch (_) {}

    // 3. Notify local listeners on this instance
    const typeListeners = this.listeners.get(eventType);
    if (typeListeners) {
      typeListeners.forEach((fn) => {
        try {
          fn(event);
        } catch (err) {
          console.error('[MeshSync] Listener error:', err);
        }
      });
    }

    this.allListeners.forEach((fn) => {
      try {
        fn(event);
      } catch (err) {
        console.error('[MeshSync] General listener error:', err);
      }
    });

    return event;
  }

  /**
   * Process outbox queue when reconnected
   */
  public async processOutbox(): Promise<{ processed: number; failed: number }> {
    const pending = this.outbox.filter((i) => i.status === 'PENDING' || i.status === 'FAILED');
    let processed = 0;
    let failed = 0;

    for (const item of pending) {
      try {
        item.status = 'SYNCING';
        item.lastAttemptAt = new Date().toISOString();

        // Broadcast to cluster
        this.broadcast(item.eventType, item.payload, item.operationId);
        item.status = 'SYNCED';
        processed++;
      } catch (err: any) {
        item.status = 'FAILED';
        item.retryCount += 1;
        item.errorMessage = err?.message || 'Sync failure';
        failed++;
      }
    }

    return { processed, failed };
  }

  // =========================================================================
  // INTERNAL HANDLERS
  // =========================================================================

  private initBroadcastChannel(): void {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel(CLUSTER_CHANNEL_NAME);
        this.channel.onmessage = (msgEvent) => {
          if (msgEvent.data && msgEvent.data.eventId) {
            this.handleIncomingEvent(msgEvent.data);
          }
        };
      } catch (e) {
        console.warn('[MeshSync] BroadcastChannel unsupported:', e);
      }
    }
  }

  private initLocalStorageFallback(): void {
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('storage', (e) => {
        if (e.key === 'jamanvaar_mesh_last_event' && e.newValue) {
          try {
            const parsed = JSON.parse(e.newValue);
            if (parsed && parsed.eventId) {
              this.handleIncomingEvent(parsed);
            }
          } catch (_) {}
        }
      });
    }
  }

  private startHeartbeatLoop(): void {
    if (typeof window !== 'undefined') {
      this.heartbeatTimer = setInterval(() => {
        if (this.isOnline) {
          this.broadcastHeartbeat();
        }
      }, 6000);
    }
  }

  private broadcastHeartbeat(): void {
    const peer: MeshPeerInfo = {
      deviceId: this.deviceId,
      role: this.deviceRole,
      name: this.deviceName,
      appVersion: '1.0.0',
      lastHeartbeat: new Date().toISOString(),
      status: 'ONLINE'
    };

    if (this.channel) {
      try {
        this.channel.postMessage({
          eventId: `hb-${Date.now()}-${this.deviceId}`,
          operationId: 'hb',
          eventType: 'HEARTBEAT',
          restaurantId: this.attachedDatabase?.restaurant?.id || 'rest-1',
          deviceId: this.deviceId,
          senderRole: this.deviceRole,
          timestamp: new Date().toISOString(),
          version: 1,
          payload: peer
        });
      } catch (_) {}
    }
  }

  private handleIncomingEvent(event: MeshSyncEvent): void {
    // 1. Idempotency Check: Don't process already ingested events
    if (this.processedEventIds.has(event.eventId)) {
      return;
    }
    this.processedEventIds.add(event.eventId);

    // Keep processed IDs memory footprint clean (< 5000)
    if (this.processedEventIds.size > 5000) {
      const arr = Array.from(this.processedEventIds);
      this.processedEventIds = new Set(arr.slice(arr.length - 2500));
    }

    // 2. Handle Heartbeat Discovery
    if (event.eventType === 'HEARTBEAT' && event.payload) {
      const peer = event.payload as MeshPeerInfo;
      if (peer.deviceId && peer.deviceId !== this.deviceId) {
        this.peers.set(peer.deviceId, {
          ...peer,
          lastHeartbeat: new Date().toISOString(),
          status: 'ONLINE'
        });
      }
      return;
    }

    // 3. Apply state mutation to local database
    this.applyEventLocally(event, false);

    // 4. Notify specific & general listeners
    const typeListeners = this.listeners.get(event.eventType);
    if (typeListeners) {
      typeListeners.forEach((fn) => {
        try {
          fn(event);
        } catch (err) {
          console.error('[MeshSync] Listener error:', err);
        }
      });
    }

    this.allListeners.forEach((fn) => {
      try {
        fn(event);
      } catch (err) {
        console.error('[MeshSync] General listener error:', err);
      }
    });
  }

  /**
   * Deterministic State Mutations across all peers
   */
  private applyEventLocally(event: MeshSyncEvent, isOriginator: boolean): void {
    const { eventType, payload } = event;
    const dbInst = this.attachedDatabase;
    if (!dbInst) return;

    switch (eventType) {
      // 1. Table status mutations
      case 'TABLE_OPENED': {
        const { tableNumber, guestCount, captainName } = payload;
        const tbl = dbInst.tables.find((t) => t.tableNumber === tableNumber);
        if (tbl) {
          tbl.status = 'OCCUPIED';
          if (guestCount) tbl.currentGuests = guestCount;
        }
        dbInst.notify();
        break;
      }

      case 'TABLE_STATUS_CHANGED': {
        const { tableNumber, status, guestCount } = payload;
        const tbl = dbInst.tables.find((t) => t.tableNumber === tableNumber);
        if (tbl) {
          tbl.status = status;
          if (guestCount !== undefined) tbl.currentGuests = guestCount;
        }
        dbInst.notify();
        break;
      }

      case 'TABLE_TRANSFERRED': {
        const { fromTable, toTable, guestCount } = payload;
        const oldTbl = dbInst.tables.find((t) => t.tableNumber === fromTable);
        const newTbl = dbInst.tables.find((t) => t.tableNumber === toTable);

        if (oldTbl) {
          oldTbl.status = 'AVAILABLE';
          oldTbl.currentGuests = 0;
        }
        if (newTbl) {
          newTbl.status = 'OCCUPIED';
          if (guestCount) newTbl.currentGuests = guestCount;
        }

        // Update active orders
        dbInst.orders.forEach((o) => {
          if (o.tableNumber === fromTable && o.orderStatus !== 'COMPLETED' && o.orderStatus !== 'CANCELLED') {
            o.tableNumber = toTable;
          }
        });

        dbInst.notify();
        break;
      }

      // 2. Order mutations
      case 'ORDER_CREATED': {
        const ord = payload as Order;
        if (!ord || !ord.id) break;
        const existingIdx = dbInst.orders.findIndex(
          (o) =>
            o.id === ord.id ||
            (o.idempotencyKey && o.idempotencyKey === ord.idempotencyKey) ||
            (o.orderNumber && o.orderNumber === ord.orderNumber)
        );
        if (existingIdx >= 0) {
          dbInst.orders[existingIdx] = { ...dbInst.orders[existingIdx], ...ord };
        } else {
          dbInst.orders.unshift(ord);
        }
        dbInst.notify();
        break;
      }

      case 'ORDER_UPDATED': {
        const { orderId, updates } = payload;
        const ord = dbInst.orders.find((o) => o.id === orderId);
        if (ord) {
          Object.assign(ord, updates);
          dbInst.notify();
        }
        break;
      }

      // 3. KOT mutations
      case 'KOT_CREATED': {
        const kots = Array.isArray(payload) ? payload : [payload];
        kots.forEach((kot: KOTRecord) => {
          const existingIdx = dbInst.kots.findIndex((k) => k.id === kot.id || (k.kotNumber === kot.kotNumber && k.orderId === kot.orderId));
          if (existingIdx >= 0) {
            dbInst.kots[existingIdx] = kot;
          } else {
            dbInst.kots.unshift(kot);
          }
        });
        dbInst.notify();
        break;
      }

      case 'KOT_STATUS_CHANGED': {
        const { kotId, status } = payload;
        const kot = dbInst.kots.find((k) => k.id === kotId);
        if (kot) {
          kot.status = status;
          dbInst.notify();
        }
        break;
      }

      // 4. Bill request & Settlement
      case 'BILL_REQUESTED': {
        const { tableNumber } = payload;
        const tbl = dbInst.tables.find((t) => t.tableNumber === tableNumber);
        if (tbl) {
          // Flag table as bill requested
          (tbl as any).billRequested = true;
          dbInst.notify();
        }
        break;
      }

      case 'BILL_SETTLED': {
        const { orderId, tableNumber, paymentMethod, totalAmount, orderNumber } = payload;
        const ord = dbInst.orders.find((o) => o.id === orderId || (orderNumber && o.orderNumber === orderNumber));
        if (ord) {
          ord.orderStatus = 'COMPLETED';
          ord.paymentStatus = 'SUCCESS';
          if (paymentMethod) ord.paymentMethod = paymentMethod;
          if (totalAmount) ord.totalAmount = totalAmount;
        }

        const tbl = dbInst.tables.find((t) => t.tableNumber === tableNumber);
        if (tbl) {
          tbl.status = 'AVAILABLE';
          tbl.currentGuests = 0;
          (tbl as any).billRequested = false;
        }

        dbInst.notify();
        break;
      }

      // 5. Menu changes
      case 'ITEM_AVAILABILITY_CHANGED': {
        const { itemId, isAvailable } = payload;
        const item = dbInst.menuItems.find((m) => m.id === itemId);
        if (item) {
          item.isAvailable = isAvailable;
          dbInst.notify();
        }
        break;
      }

      case 'PRICE_UPDATED': {
        const { itemId, newPrice } = payload;
        const item = dbInst.menuItems.find((m) => m.id === itemId);
        if (item) {
          item.price = newPrice;
          dbInst.notify();
        }
        break;
      }

      // 6. Business Day Transitions
      case 'BUSINESS_DAY_CLOSED': {
        const { businessDayId, netSales, orderCount, closedBy, closedAt, displayDate } = payload || {};
        const day = dbInst.businessDays.find((d) => d.id === businessDayId);
        if (day) {
          day.status = 'CLOSED';
          day.closedAt = closedAt || new Date().toISOString();
          if (closedBy) day.closedBy = closedBy;
        }
        dbInst.shifts.forEach((s) => {
          if (s.status === 'OPEN') {
            s.status = 'CLOSED';
            s.closedAt = closedAt || new Date().toISOString();
          }
        });
        if (!isOriginator) {
          NotificationRepository.createNotification({
            type: 'BUSINESS_DAY_CLOSED',
            title: `✓ Business Day Closed (${displayDate || 'Day'})`,
            message: `${displayDate || 'Day'} closed by ${closedBy || 'Cashier'}. Net Sales: ₹${netSales || 0}, Orders: ${orderCount || 0}`,
            targetRoles: ['POS', 'POS_ADMIN'],
            priority: 'HIGH'
          });
        }
        dbInst.notify();
        break;
      }

      case 'BUSINESS_DAY_STARTED': {
        const { businessDayId, businessDate, displayDate, openedBy, openingCash } = payload || {};
        const existing = dbInst.businessDays.find((d) => d.id === businessDayId);
        if (!existing && businessDayId) {
          dbInst.businessDays.unshift({
            id: businessDayId,
            businessDate: businessDate || new Date().toISOString().slice(0, 10),
            displayDate: displayDate || 'New Business Day',
            openedAt: new Date().toISOString(),
            openedBy: openedBy || 'Manager',
            status: 'OPEN',
            openingCash: openingCash || 2000,
            cashIn: 0,
            cashOut: 0,
            grossSales: 0,
            discounts: 0,
            netSales: 0,
            tax: 0,
            totalCollected: 0,
            cashSales: 0,
            upiSales: 0,
            cardSales: 0,
            otherPayments: 0,
            orderCount: 0,
            completedOrderCount: 0,
            cancelledOrderCount: 0,
            refundedOrderCount: 0,
            dineInCount: 0,
            takeawayCount: 0,
            deliveryCount: 0,
            tokenCount: 0,
            terminalId: 'POS-01',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        }
        dbInst.kots = dbInst.kots.filter((k) => k.status === 'PENDING' || k.status === 'PREPARING' || k.status === 'ACCEPTED');
        if (!isOriginator) {
          NotificationRepository.createNotification({
            type: 'BUSINESS_DAY_STARTED',
            title: `☀️ NEW BUSINESS DAY STARTED (${displayDate || 'Day'})`,
            message: `Business day ${displayDate || ''} is now active. Token sequence reset to #101.`,
            targetRoles: ['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS'],
            priority: 'NORMAL'
          });
        }
        dbInst.notify();
        break;
      }

      case 'FOOD_READY': {
        const { tableNumber, dishName, kotNumber } = payload || {};
        if (!isOriginator) {
          NotificationRepository.createNotification({
            type: 'FOOD_READY',
            title: `🔥 Food Ready for Table #${tableNumber || 'Floor'}`,
            message: `${dishName || 'Kitchen item'} (KOT #${kotNumber || ''}) is prepared and ready for pickup!`,
            tableNumber: tableNumber ? `${tableNumber}` : undefined,
            targetRoles: ['CAPTAIN', 'POS'],
            priority: 'HIGH'
          });
        }
        dbInst.notify();
        break;
      }

      default:
        break;
    }
  }
}

export const lanMeshSync = LanMeshSyncEngine.getInstance();
