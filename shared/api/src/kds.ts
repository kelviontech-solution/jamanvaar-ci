import { Order, OrderStatus } from '@jamanvaar/types';
import { db, OrderRepository } from '@jamanvaar/database';

export class KdsMeshService {
  private static listeners: Set<(order: Order) => void> = new Set();

  public static subscribeToOrders(callback: (order: Order) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  public static broadcastOrderCreated(order: Order): void {
    this.listeners.forEach((fn) => fn(order));
  }

  /**
   * Advances order lifecycle with dynamic ETA adjustment and stage synchronization
   */
  public static advanceKitchenStatus(orderId: string, nextStatus: OrderStatus): Order | null {
    const order = db.orders.find((o) => o.id === orderId);
    if (!order) return null;

    order.orderStatus = nextStatus;
    order.updatedAt = new Date().toISOString();

    if (nextStatus === 'CONFIRMED') {
      order.acknowledgementStage = 'ORDER_SENT_TO_KDS';
    } else if (nextStatus === 'PREPARING') {
      order.acknowledgementStage = 'ORDER_PREPARING';
      // Dynamically calculate ETA based on active queue
      const activeTickets = db.orders.filter(
        (o) => o.orderStatus === 'PREPARING' || o.orderStatus === 'CONFIRMED'
      ).length;
      order.estimatedWaitMinutes = Math.max(10, Math.min(35, 10 + activeTickets * 3));
    } else if (nextStatus === 'READY') {
      order.acknowledgementStage = 'ORDER_READY';
      order.estimatedWaitMinutes = 0;
    } else if (nextStatus === 'COLLECTED' || nextStatus === 'COMPLETED') {
      order.acknowledgementStage = 'ORDER_COMPLETED';
    }

    db.notify();
    this.listeners.forEach((fn) => fn(order));
    return order;
  }
}
