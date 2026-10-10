export type OrderType = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY' | 'TOKEN' | 'TOKEN_QR' | 'QR_TABLE' | 'KIOSK' | 'PICKUP' | 'ONLINE' | 'COMPLIMENTARY';

export type DietaryType = 'VEG' | 'NON_VEG' | 'JAIN' | 'VEGAN' | 'EGG';

export type SpiceLevel = 'NONE' | 'MILD' | 'MEDIUM' | 'SPICY' | 'EXTRA_SPICY';

export type OrderStatus =
  | 'NEW'
  | 'DRAFT'
  | 'CREATED'
  | 'ACCEPTED'
  | 'CONFIRMED'
  | 'ACKNOWLEDGED'
  | 'KITCHEN_ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'SERVED'
  | 'COLLECTED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'HELD';

export type PaymentMethod =
  | 'UPI_QR'
  | 'CARD_TERMINAL'
  | 'CASH_AT_COUNTER'
  | 'CASH'
  | 'UPI'
  | 'CARD'
  | 'SPLIT'
  | 'CREDIT'
  | 'WALLET'
  | 'NET_BANKING';

export type PaymentStatus =
  | 'CREATED'
  | 'PENDING'
  | 'WAITING_FOR_USER'
  | 'PROCESSING'
  | 'PARTIALLY_PAID'
  | 'PARTIALLY_REFUNDED'
  | 'SUCCESS'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'REFUNDED';

export type KioskStatus =
  | 'ONLINE'
  | 'OFFLINE'
  | 'MAINTENANCE'
  | 'LOCKED'
  | 'INACTIVE';

export type TableStatus =
  | 'AVAILABLE'
  | 'OCCUPIED'
  | 'RESERVED'
  | 'BILLING'
  | 'BILL_REQUESTED'
  | 'CLEANING'
  | 'BLOCKED';

export type ShiftStatus = 'OPEN' | 'CLOSED';

export type KOTStatus = 'PENDING' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'SERVED' | 'CANCELLED';

export type KOTType = 'FIRST' | 'ADDITIONAL' | 'MODIFIED' | 'CANCELLED';

export type ManagerOverrideAction =
  | 'HIGH_DISCOUNT'
  | 'VOID_ORDER'
  | 'CANCEL_ITEM'
  | 'REFUND'
  | 'PRICE_OVERRIDE'
  | 'REOPEN_BILL'
  | 'MANUAL_CASH_DRAWER'
  | 'HOUSE_ACCOUNT_SETTLE'
  | 'CLOSE_DAY';

export type ServiceRequestType =
  | 'CALL_STAFF'
  | 'WATER_REFILL'
  | 'CLEAN_TABLE'
  | 'BILL_REQUEST'
  | 'PAYMENT_ASSISTANCE'
  | 'CUSTOM';

export type ServiceRequestStatus =
  | 'PENDING'
  | 'ACKNOWLEDGED'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'CANCELLED';

export type SyncEventStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CONFLICT';

export type SyncEventType =
  | 'ORDER_CREATED'
  | 'ORDER_UPDATED'
  | 'PAYMENT_COMPLETED'
  | 'KOT_CREATED'
  | 'KOT_UPDATED'
  | 'MENU_UPDATED'
  | 'ITEM_STOCK_UPDATED'
  | 'ITEM_AVAILABILITY_CHANGED'
  | 'TABLE_STATUS_CHANGED'
  | 'PRICE_UPDATED'
  | 'SHIFT_OPENED'
  | 'SHIFT_CLOSED'
  | 'DEVICE_HEARTBEAT'
  | 'SERVICE_REQUEST_CREATED'
  | 'AUDIT_LOG_ENTRY';

