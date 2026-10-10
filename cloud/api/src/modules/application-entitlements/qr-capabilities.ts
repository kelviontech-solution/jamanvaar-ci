/** Optional capabilities use the existing Feature -> Plan flag -> subscription config resolution. */
export const QR_CAPABILITIES = {
  QR_GROUP_ORDERING: 'qrGroupOrdering',
  QR_KITCHEN_CAPACITY: 'qrKitchenCapacity',
  QR_LOYALTY: 'qrLoyalty',
  QR_MULTILINGUAL: 'qrMultilingual',
  QR_PROMOTIONS: 'qrPromotions',
  QR_MULTI_BRANCH: 'qrMultiBranch',
  QR_FEEDBACK: 'qrFeedback',
  QR_SPLIT_PAYMENT: 'qrSplitPayment',
  QR_NOTIFICATIONS: 'qrNotifications',
  QR_ORDER_HISTORY: 'qrOrderHistory',
  QR_USAGE_LIMITS: 'qrUsageLimits',
  QR_INVENTORY_SYNC: 'qrInventorySync',
  QR_ACCESSIBILITY: 'qrAccessibility'
} as const;
export type QrCapability = keyof typeof QR_CAPABILITIES;
