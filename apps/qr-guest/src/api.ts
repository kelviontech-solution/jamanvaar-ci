/**
 * The public QR API, and nothing else. No credentials, no cookies: the token in the address is the whole identity,
 * and the server derives restaurant, branch and table from it.
 */
export interface Branding { welcomeTitle: string | null; welcomeMessage: string | null; footerMessage: string | null; orderButtonLabel: string | null; accentColor: string | null; logoUrl: string | null }

export interface Describe {
  currency?: string;
  branding?: Branding;
  restaurant: { name: string; address?: string; city?: string };
  branch: { name: string };
  mode: 'TABLE_ORDER' | 'MENU_ONLY';
  table: { displayNumber: string; capacity?: number } | null;
  ordering: {
    enabled: boolean;
    menuReady: boolean;
    menuVersion: number;
    settings: { allowCustomerNotes: boolean; allowModifiers: boolean; allowCash: boolean; allowOnlinePayment: boolean; showOrderStatus: boolean; requireCustomerName: boolean; requireCustomerPhone: boolean };
  };
}

export interface MenuItem { translations?: Record<string, {name: string; description?: string}>; id: string; name: string; description?: string; categoryId: string; price: number; imageUrl?: string; dietaryType?: string; modifierGroupIds: string[]; sortOrder?: number; minQuantity?: number; maxQuantity?: number; allowInstructions?: boolean }
export interface MenuGroup { id: string; name: string; description?: string; isRequired: boolean; minSelections: number; maxSelections: number; options: Array<{ id: string; name: string; description?: string; imageUrl?: string; priceDelta: number; isDefault?: boolean }> }
export interface Menu { menuVersion: number; etag: string; categories: Array<{ translations?: Record<string, {name: string; description?: string}>; id: string; name: string; description?: string; imageUrl?: string; sortOrder: number }>; items: MenuItem[]; modifierGroups: MenuGroup[] }

export interface Quote { menuVersion?: number; lines: Array<{ itemId: string; name: string; quantity: number; unitPrice: number; lineTotal: number; options: string[] }>; subtotal: number; tax: number; total: number }
export interface Placed { publicOrderId: string; restaurantName?: string; branchName?: string; currency?: string; orderNumber: string | null; status: 'PENDING_PAYMENT' | 'RECEIVED' | 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED'; total: number; table: string | null; placedAt: string;
  paymentStatus?: string; paymentMethod?: string; subtotal?: number; tax?: number; discount?: number;
  items?: Array<{name:string;quantity:number;unitPrice:number;lineTotal:number;options:string[];note?:string}>;
  payment?: {status:string;url:string|null;expiresAt:string|null} | null }

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

/** The API address is configuration. There is no built-in production default and none for a real restaurant. */
export function apiBase(): string | null {
  const configured = (import.meta.env.VITE_CLOUD_API_BASE_URL as string | undefined)?.trim().replace(/\/+$/, '');
  if (configured) return configured;
  return import.meta.env.DEV ? 'http://localhost:4000' : null;
}

/** Pictures the restaurant uploaded are served by the API (cached for a year); web addresses are used as they are. */
export function imageSrc(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (!url.startsWith('/api/')) return url;
  const base = apiBase();
  return base ? `${base}${url}` : undefined;
}

async function call<T>(path: string, init: RequestInit & { session?: string } = {}): Promise<{ data: T | null; status: number; etag: string | null }> {
  const base = apiBase();
  if (!base) throw new ApiError('This ordering page is not configured.', 0, 'NOT_CONFIGURED');
  let res: Response;
  try {
    res = await fetch(`${base}/api/v1/public/qr${path}`, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', ...(init.session ? { 'X-QR-Session': init.session } : {}), ...(init.headers ?? {}) }
    });
  } catch {
    throw new ApiError('No connection. Please check your internet and try again.', 0, 'NETWORK');
  }
  if (res.status === 304) return { data: null, status: 304, etag: res.headers.get('etag') };
  const body = (await res.json().catch(() => null)) as (T & { message?: string; code?: string }) | null;
  if (!res.ok) throw new ApiError(body?.message ?? 'Something went wrong. Please try again.', res.status, body?.code);
  if (!body || typeof body !== 'object') throw new ApiError('The ordering service returned an unreadable response. Please try again.', 502, 'BAD_RESPONSE');
  return { data: body as T, status: res.status, etag: res.headers.get('etag') };
}

export const QrApi = {
  session: async () => (await call<{ session: string }>('/session', { method: 'POST' })).data as { session: string },
  describe: async (token: string, session: string) => (await call<Describe>(`/${encodeURIComponent(token)}`, { session })).data as Describe,
  menu: async (token: string, session: string, etag?: string | null): Promise<{ menu: Menu | null; etag: string | null }> => {
    const r = await call<Menu>(`/${encodeURIComponent(token)}/menu`, { session, headers: etag ? { 'If-None-Match': etag } : {} });
    return { menu: r.data, etag: r.etag };
  },
  quote: async (token: string, items: Array<{ itemId: string; quantity: number; optionIds: string[]; note?: string }>) =>
    (await call<Quote>(`/${encodeURIComponent(token)}/quote`, { method: 'POST', body: JSON.stringify({ items }) })).data as Quote,
  place: async (token: string, body: Record<string, unknown>, session: string) =>
    (await call<Placed>(`/${encodeURIComponent(token)}/orders`, { method: 'POST', body: JSON.stringify(body), session })).data as Placed,
  status: async (publicOrderId: string) => (await call<Placed>(`/orders/${encodeURIComponent(publicOrderId)}`)).data as Placed,
  retryPayment: async (publicOrderId: string) => (await call<Placed>(`/orders/${encodeURIComponent(publicOrderId)}/payment`, { method: 'POST' })).data as Placed
};
