import type { PosAdminTab } from './App';

/**
 * #17: Settings is many separate panel components, each a tab/page of its own (Settings,
 * Receipts, Kiosk Welcome Screen...) -- there was no way to find "receipt logo" or "cash
 * payment" without already knowing which tab holds it. Each entry names the tab to open and
 * the DOM id of the exact section to scroll to and highlight once it mounts (App.tsx's
 * onSelectSettingsEntry). Not exhaustive -- covers the commonly-sought fields; extend this
 * list as more are added, each with a real id on the target element.
 */
export interface SettingsSearchEntry {
  id: string;
  label: string;
  keywords: string;
  tab: PosAdminTab;
  anchorId: string;
}

export const SETTINGS_SEARCH_INDEX: SettingsSearchEntry[] = [
  { id: 'trade-name', label: 'Restaurant Trade / Brand Name', keywords: 'name brand trade restaurant', tab: 'SETTINGS', anchorId: 'rb-trade-name' },
  { id: 'legal-name', label: 'Legal Registered Entity Name', keywords: 'legal entity company name', tab: 'SETTINGS', anchorId: 'rb-legal-name' },
  { id: 'gstin', label: 'GSTIN', keywords: 'gst tax number gstin', tab: 'SETTINGS', anchorId: 'rb-gstin' },
  { id: 'fssai', label: 'FSSAI License Number', keywords: 'fssai food safety license', tab: 'SETTINGS', anchorId: 'rb-fssai' },
  { id: 'branding-logo', label: 'Restaurant Logo (branding)', keywords: 'logo image branding asset', tab: 'SETTINGS', anchorId: 'rb-logo-url' },
  { id: 'business-day', label: 'Business Date Rollover', keywords: 'business day cutoff hour rollover midnight', tab: 'SETTINGS', anchorId: 'business-day-rollover' },
  { id: 'timezone', label: 'Restaurant Timezone', keywords: 'timezone time zone', tab: 'SETTINGS', anchorId: 'restaurant-timezone' },
  { id: 'jaman-ai', label: 'Show JAMAN AI Assistant', keywords: 'jaman ai assistant chatbot toggle', tab: 'SETTINGS', anchorId: 'settings-jaman-ai' },
  { id: 'daily-digest', label: 'Daily Summary Email', keywords: 'digest daily summary email notification business hours', tab: 'SETTINGS', anchorId: 'settings-daily-digest' },
  { id: 'receipt-logo', label: 'Receipt Logo', keywords: 'receipt logo bill thermal print', tab: 'RECEIPTS', anchorId: 'settings-receipt-logo' },
  { id: 'cash-payment', label: 'Cash Payment Watermark', keywords: 'cash payment watermark counter bill', tab: 'RECEIPTS', anchorId: 'settings-cash-payment' },
  { id: 'upi-vpa', label: 'UPI Payout VPA', keywords: 'upi vpa payout id payment counter qr', tab: 'RECEIPTS', anchorId: 'settings-upi-vpa' },
  { id: 'language-background', label: 'Language Screen Background (Kiosk)', keywords: 'language background kiosk second screen', tab: 'KIOSK_WELCOME', anchorId: 'settings-language-background' }
];
