import { request } from '../../cloud/cloudClient';
export function ops<T>(branchId: string, path: string, body?: unknown): Promise<T> {
  return request<T>(
    '/api/v1/tenant/operations/' +
      path +
      (path.includes('?') ? '&' : '?') +
      'branchId=' +
      encodeURIComponent(branchId),
    body === undefined ? {} : { method: 'POST', body },
  );
}
export interface Versioned<T> {
  version: number;
  data: T | null;
}
export interface OpsContext {
  viewerId: string;
  restaurant: { name: string; currency: string };
  branch: { id: string; name: string; timezone: string };
  apps: string[];
  role: string;
  menuVersion: number;
  publishedDishes: number;
  devices: {
    id: string;
    name: string;
    type: string;
    health: string;
    pendingSyncCount: number;
    appVersion: string | null;
  }[];
  orders: {
    externalOrderId: string;
    label: string;
    source: string;
    status: string;
    paymentStatus: string | null;
    ageMinutes: number;
    total: number;
    tableLabel: string | null;
  }[];
  generatedAt: string;
}
export interface ServicePolicy {
  pausedUntil: string | null;
  message: string;
  channels: ('QR' | 'KIOSK')[];
  maxPendingOrders: number;
  preparationMinutes: number;
  hours: { day: number; open: string; close: string }[];
}
export interface Checklist {
  lastPhase: string;
  history: { phase: string; at: string; notes: string; openOrders: number }[];
}
export interface MenuReview {
  version: number;
  checksum: string;
  sharedScope: string;
  items: { id: string; name: string; price: number; available: boolean }[];
  changes: {
    id: string;
    name: string;
    kind: string;
    fields: { field: string; before: unknown; after: unknown }[];
    affectedBranches: { id: string; name: string }[];
  }[];
  errors: string[];
  warnings: string[];
}
export interface Schedule {
  id: string;
  version: number;
  title: string;
  activateAt: string;
  status: string;
  failureReason?: string;
  publishedVersion?: number;
}
export interface Person {
  id: string;
  fullName: string;
  role: string;
}
export interface Complaint {
  id: string;
  version: number;
  title: string;
  orderId: string;
  assignedTo: string;
  dueAt: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  resolution: string;
  history?: { at: string; status: string; resolution: string }[];
}
export interface Handover {
  pendingServiceRequests?: number;
  deviceIssues?: { id: string; type: string; health: string; pendingSyncCount: number }[];
  id: string;
  version: number;
  recipientId: string;
  notes: string;
  acceptedAt: string | null;
  createdAt: string;
  openOrders: { label: string; status: string; paymentStatus: string }[];
  openComplaints: string[];
}
export interface Approval {
  id: string;
  version: number;
  requestedBy: string;
  details: string;
  action: string;
  status: string;
  expiresAt: string;
  reason?: string;
}
export interface Acceptance {
  menuVersion: number;
  channels: string[];
  records: {
    source: string;
    version: number;
    current: boolean;
    verifiedAt: string;
    onlinePayment: boolean;
    receipt: boolean;
  }[];
  orders: { id: string; source: string; label: string; online: boolean }[];
}
export interface Timeline {
  label: string;
  status: string;
  paymentStatus: string;
  note: string;
  events: { at: string; type: string; detail?: string; actor?: string; amount?: number }[];
}
export interface Comparison {
  source: { id: string; name: string };
  target: { id: string };
  sourceVersion: number;
  targetVersion: number;
  fields: { field: string; source: unknown; target: unknown; changed: boolean }[];
}
export interface TransferPreview {
  id: string;
  kind: string;
  name: string;
  blocking: boolean;
  explanation: string;
  version?: number;
  openOrders?: number;
  pendingSync?: number;
  openTables?: number;
}
export interface Planning {
  days: number;
  bufferPercent: number;
  costBasis: string;
  ordersAnalyzed: number;
  truncated: boolean;
  margins: {
    id: string;
    name: string;
    price: number | null;
    estimatedFoodCost: number | null;
    estimatedFoodMargin: number | null;
    marginPercent: number | null;
    units: number;
    allocatedSales: number;
  }[];
  prep: {
    id: string;
    name: string;
    units: number;
    averageDaily: number;
    suggestedPortions: number;
    peakHour: string | null;
  }[];
}
