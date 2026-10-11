/**
 * Groups a notification's `type` into a coarser category so the bell dropdown and the
 * Notifications page can show "Devices offline in Dhaba X" and "Subscription expiring for
 * Hotel Y" as two different buckets instead of one flat, interleaved list where restaurants
 * and concern areas are all mixed together in pure chronological order.
 */
export interface NotificationCategory {
  id: string;
  label: string;
}

const CATEGORIES: Record<string, NotificationCategory> = {
  DEVICES: { id: 'DEVICES', label: 'Devices & Sync' },
  BILLING: { id: 'BILLING', label: 'Billing & Licensing' },
  OPERATIONS: { id: 'OPERATIONS', label: 'Operations' },
  CONNECTORS: { id: 'CONNECTORS', label: 'Connectors' },
  TICKETS: { id: 'TICKETS', label: 'Support Tickets' },
  OTHER: { id: 'OTHER', label: 'Other' }
};

const TYPE_TO_CATEGORY: Record<string, string> = {
  DEVICES_OFFLINE: 'DEVICES',
  SYNC_FAILING: 'DEVICES',
  SUBSCRIPTION_EXPIRING: 'BILLING',
  INVOICE_OVERDUE: 'BILLING',
  KEYS_EXPIRING: 'BILLING',
  BACKUP_FAILED: 'OPERATIONS',
  RESTAURANT_SUSPENDED: 'OPERATIONS',
  WHATSAPP_CONNECTION_LOCKED: 'CONNECTORS',
  TICKET_CREATED: 'TICKETS',
  TICKET_ASSIGNED: 'TICKETS',
  TICKET_COMMENT: 'TICKETS'
};

/** Stable display order, independent of whatever order items happen to arrive in. */
export const CATEGORY_ORDER = ['DEVICES', 'BILLING', 'OPERATIONS', 'CONNECTORS', 'TICKETS', 'OTHER'];

export function categoryForType(type: string): NotificationCategory {
  return CATEGORIES[TYPE_TO_CATEGORY[type] ?? 'OTHER'] ?? CATEGORIES.OTHER;
}

export function allCategories(): NotificationCategory[] {
  return CATEGORY_ORDER.map((id) => CATEGORIES[id]);
}

/** Groups a list of items (that each have a `type`) into category buckets, in CATEGORY_ORDER, skipping empty ones. */
export function groupByCategory<T extends { type: string }>(items: T[]): Array<{ category: NotificationCategory; items: T[] }> {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const cat = categoryForType(item.type);
    const bucket = buckets.get(cat.id) ?? [];
    bucket.push(item);
    buckets.set(cat.id, bucket);
  }
  return CATEGORY_ORDER.filter((id) => buckets.has(id)).map((id) => ({ category: CATEGORIES[id], items: buckets.get(id)! }));
}
