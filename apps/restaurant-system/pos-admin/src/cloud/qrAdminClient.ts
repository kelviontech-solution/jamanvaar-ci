import { qrApi } from './cloudClient';

/** Restaurant Admin's view of QR ordering. Every call is the console's own device credential; there is no restaurant id anywhere. */

export interface QrEntitlementView {
  enabled: boolean;
  reason: string;
  source: 'PLAN' | 'MANUAL_OVERRIDE' | null;
  limits: Record<string, unknown>;
  validUntil: string | null;
  planName: string | null;
  lockedMessage: string | null;
}

export interface QrTableRow {
  tableId: string;
  displayNumber: string;
  capacity: number | null;
  zone: string | null;
  isActive: boolean;
  branchId: string | null;
  qr: null | {
    id: string;
    status: 'ACTIVE' | 'DISABLED' | 'REVOKED';
    version: number;
    branchId: string | null;
    branchName: string | null;
    lastScannedAt: string | null;
    url: string | null;
  };
}

export interface QrBranch {
  id: string;
  name: string;
  status: string;
}

export interface QrOverview {
  entitlement: QrEntitlementView;
  tables: number;
  activeTables: number;
  codesGenerated: number;
  activeCodes: number;
  today: {
    scans: number;
    menuViews: number;
    ordersPlaced: number;
    ordersPending: number;
    ordersCompleted: number;
    failedAttempts: number;
    sales: number;
    paidSales: number;
    averageOrderValue: number;
    ordersByTable: Array<{ table: string; orders: number }>;
  };
  publicBaseUrlConfigured: boolean;
}

export interface QrOrderRow {
  orderNumber: string | null;
  table: string | null;
  branchId: string | null;
  status: string;
  paymentStatus: string | null;
  paymentMethod: string | null;
  total: number;
  placedAt: string;
  itemCount: number;
}

export interface QrSettings {
  orderingEnabled: boolean;
  tableOrderingEnabled: boolean;
  menuOnlyEnabled: boolean;
  allowCustomerNotes: boolean;
  allowModifiers: boolean;
  allowCash: boolean;
  allowOnlinePayment: boolean;
  showOrderStatus: boolean;
  autoAccept: boolean;
  requireCustomerName: boolean;
  requireCustomerPhone: boolean;
}

export interface QrPrintData {
  restaurantName: string;
  branchName: string | null;
  tableLabel: string;
  url: string | null;
  tagline: string;
}

const base = '/api/v1/restaurant/qr';
export interface QrBrandingView { welcomeTitle: string | null; welcomeMessage: string | null; footerMessage: string | null; orderButtonLabel: string | null; accentColor: string | null; logoUrl: string | null }

const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export const QrAdminApi = {
  entitlement: () => qrApi<QrEntitlementView>(`${base}/entitlement`),
  overview: () => qrApi<QrOverview>(`${base}/overview`),
  branches: () => qrApi<QrBranch[]>(`${base}/branches`),
  tables: () => qrApi<QrTableRow[]>(`${base}/tables`),
  orders: (branchId?: string) => qrApi<QrOrderRow[]>(`${base}/orders${branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''}`),
  settings: () => qrApi<QrSettings>(`${base}/settings`),
  paymentReadiness: () => qrApi<{ available: boolean; enabled: boolean; guestAvailable: boolean; code: string; message: string }>(`${base}/settings/payment-readiness`),
  saveSettings: (changes: Partial<QrSettings>) => qrApi<QrSettings>(`${base}/settings`, { method: 'PUT', body: JSON.stringify(changes) }),
  branding: () => qrApi<QrBrandingView>(`${base}/branding`),
  updateBranding: (body: Partial<Record<'welcomeTitle' | 'welcomeMessage' | 'footerMessage' | 'orderButtonLabel' | 'accentColor', string>> & { logo?: string | null }) => qrApi<QrBrandingView>(`${base}/branding`, { method: 'PUT', body: JSON.stringify(body) }),
  createTable: (body: { tableNumber: string; capacity: number; branchId?: string; zone?: string }) => qrApi<{ id: string }>(`${base}/tables`, json(body)),
  updateTable: (tableId: string, body: { tableNumber?: string; capacity?: number; isActive?: boolean }) => qrApi<unknown>(`${base}/tables/${encodeURIComponent(tableId)}`, { method: 'PUT', body: JSON.stringify(body) }),
  generate: (tableId: string, branchId?: string) => qrApi<{ id: string; url: string | null }>(`${base}/tables/${encodeURIComponent(tableId)}/generate`, json(branchId ? { branchId } : {})),
  menuCode: (branchId: string, label: string) => qrApi<{ id: string; url: string | null }>(`${base}/menu-codes`, json({ branchId, label })),
  regenerate: (codeId: string) => qrApi<{ id: string; url: string | null }>(`${base}/codes/${codeId}/regenerate`, json({})),
  revoke: (codeId: string) => qrApi<unknown>(`${base}/codes/${codeId}/revoke`, json({})),
  disable: (codeId: string) => qrApi<unknown>(`${base}/codes/${codeId}/disable`, json({})),
  enable: (codeId: string) => qrApi<unknown>(`${base}/codes/${codeId}/enable`, json({})),
  printData: (codeId: string) => qrApi<QrPrintData>(`${base}/codes/${codeId}/print-data`)
};
