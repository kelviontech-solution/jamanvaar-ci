/**
 * JAMANVAAR Kiosk System Shared Domain Contracts
 */

export interface KioskDeviceConfig {
  kioskId: string;
  name: string;
  location: string;
  allowCashAtCounter: boolean;
  orderTypes: ('DINE_IN' | 'TAKEAWAY')[];
  defaultLanguage: string;
  idleTimeoutSeconds: number;
  bannerTheme: string;
}

export interface KioskTokenRecord {
  tokenNumber: string;
  orderId: string;
  orderNumber: string;
  createdAt: string;
  isCollected: boolean;
}

export const KIOSK_DEFAULTS = {
  BRAND_NAME: 'JAMANVAAR',
  IDLE_TIMEOUT: 60,
  DEFAULT_CURRENCY: 'INR'
};
