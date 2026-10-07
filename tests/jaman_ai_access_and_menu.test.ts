import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, KeyValueStore, TenantIsolation, OrderRepository } from '@jamanvaar/database';
import { AiConfig, CustomerChatbotEngine, JamanAiRegistry, PosAssistantService, DynamicQueryExecutor, refreshAiConfig, refreshAiConfigIfStale } from '@jamanvaar/business';
import { pushRestaurantIdentity } from '@jamanvaar/sync';

const cfg = (extra: Record<string, unknown> = {}) => ({ state: 'ON', settings: { delayedKotMinutes: 15, lowStockThreshold: 3, cashDrawerVarianceThreshold: 500, proactiveAlertsEnabled: true }, questions: [], teaser: [], limitReached: false, remainingToday: null, ...extra });
const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear(); KeyValueStore.reset();
  KeyValueStore.attach({ getItem: key => storage.get(key) ?? null, setItem: (key, value) => { storage.set(key, value); }, removeItem: key => { storage.delete(key); } });
  KeyValueStore.setBrowserNamespace('app-pos:'); TenantIsolation.adopt('restaurant-a'); AiConfig.reset();
  db.resetToDefaultSeed();
});
afterEach(() => { AiConfig.reset(); KeyValueStore.reset(); vi.unstubAllGlobals(); });

describe('assistant settings are isolated and reactive', () => {
  it('never grants another application cached access', () => {
    AiConfig.apply(cfg()); KeyValueStore.setBrowserNamespace('app-captain:');
    expect(AiConfig.isKnown()).toBe(false);
    KeyValueStore.setBrowserNamespace('app-pos:'); expect(AiConfig.isEnabled()).toBe(true);
  });
  it('never grants another restaurant cached access', () => {
    AiConfig.apply(cfg()); KeyValueStore.set('jamanvaar_tenant_id', 'restaurant-b');
    expect(AiConfig.isKnown()).toBe(false); expect(AiConfig.canQuery()).toBe(false);
  });
  it('notifies components when only quota or questions change', () => {
    AiConfig.apply(cfg()); const before = AiConfig.getRevision(), changed = vi.fn();
    const unsub = AiConfig.subscribe(changed); AiConfig.noteUsage({ limitReached: true, remainingToday: 0 });
    expect(AiConfig.getRevision()).toBeGreaterThan(before); expect(changed).toHaveBeenCalledOnce(); expect(AiConfig.canQuery()).toBe(false); unsub();
  });
  it('deduplicates concurrent config requests', async () => {
    let finish!: (r: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })); vi.stubGlobal('fetch', fetch);
    const a = refreshAiConfig({ apiBase: 'http://api', deviceToken: 'token' }), b = refreshAiConfig({ apiBase: 'http://api', deviceToken: 'token' });
    finish(new Response(JSON.stringify(cfg()), { headers: { 'content-type': 'application/json' } }));
    expect(await a).toBe(true); expect(await b).toBe(true); expect(fetch).toHaveBeenCalledOnce();
  });
  it('ignores a response from a previous tenant session', async () => {
    let finish!: (r: Response) => void;
    vi.stubGlobal('fetch', () => new Promise<Response>(resolve => { finish = resolve; }));
    const pending = refreshAiConfig({ apiBase: 'http://api', deviceToken: 'old-token' });
    KeyValueStore.set('jamanvaar_tenant_id', 'restaurant-b');
    finish(new Response(JSON.stringify(cfg()), { headers: { 'content-type': 'application/json' } }));
    expect(await pending).toBe(false); expect(AiConfig.isKnown()).toBe(false);
  });
  it('does not apply a previous credential response after a terminal reconnects', async () => {
    let finish!: (r: Response) => void;
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => (init.headers as Record<string, string>).Authorization === 'Bearer old-token'
      ? new Promise<Response>(resolve => { finish = resolve; })
      : Promise.resolve(new Response(JSON.stringify(cfg({ state: 'LOCKED' })), { headers: { 'content-type': 'application/json' } })));
    const pending = refreshAiConfig({ apiBase: 'http://api', deviceToken: 'old-token' });
    expect(await refreshAiConfig({ apiBase: 'http://api', deviceToken: 'new-token' })).toBe(true);
    finish(new Response(JSON.stringify(cfg()), { headers: { 'content-type': 'application/json' } }));
    expect(await pending).toBe(false); expect(AiConfig.getState()).toBe('LOCKED');
  });
  it('rechecks config after one minute on existing heartbeats', async () => {
    AiConfig.apply(cfg()); const fetch = vi.fn(async () => new Response(JSON.stringify(cfg({ state: 'LOCKED' })), { headers: { 'content-type': 'application/json' } })); vi.stubGlobal('fetch', fetch);
    const now = Date.now(); vi.spyOn(Date, 'now').mockReturnValue(now + 61_000);
    try { expect(await refreshAiConfigIfStale({ apiBase: 'http://api', deviceToken: 'token' })).toBe(true); expect(AiConfig.getState()).toBe('LOCKED'); }
    finally { vi.restoreAllMocks(); }
  });
  it('a visibility save requires acknowledgement instead of silently accepting a failed request', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 500, headers: { 'content-type': 'application/json' } }));
    await expect(pushRestaurantIdentity({ apiBase: 'http://api', deviceToken: 'token', identity: { showJamanAI: false }, requireAcknowledgement: true })).rejects.toThrow('could not be saved');
  });
  it('a visibility save reports connection failure to the settings screen', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error('offline'); });
    await expect(pushRestaurantIdentity({ apiBase: 'http://api', deviceToken: 'token', identity: { showJamanAI: true }, requireAcknowledgement: true })).rejects.toThrow('offline');
  });
  it('kitchen staff can only select kitchen questions', () => {
    const q = ['TODAY_SALES', 'DELAYED_KOT', 'PENDING_KOT'].map(intent => ({ id: intent, intent, label: intent, category: intent === 'TODAY_SALES' ? 'TODAY' : 'KITCHEN', icon: 'clock', priorityScore: 1 }));
    AiConfig.apply(cfg({ questions: q }));
    const offered = JamanAiRegistry.getPrioritizedQuestions('KDS', 'CHEF');
    expect(offered.length).toBeGreaterThan(0); expect(offered.every(q => q.category === 'KITCHEN')).toBe(true);
  });
  it('platform labels and custom formulas reach owner suggestions', () => {
    AiConfig.apply(cfg({ questions: [{ id: 'custom', intent: 'CUSTOM_KITCHEN', category: 'KITCHEN', label: 'Kitchen count', icon: 'clock', priorityScore: 1, targetDomain: 'KITCHEN', calculationType: 'COUNT' }] }));
    expect(JamanAiRegistry.getPrioritizedQuestions('ADMIN', 'OWNER_ADMIN')[0]).toMatchObject({ id: 'custom', label: 'Kitchen count', formula: { targetDomain: 'KITCHEN', calculationType: 'COUNT' } });
  });
  it('today questions do not fall back to previous business days when today has no orders', () => {
    const old = OrderRepository.createOrder({ orderType: 'DINE_IN', items: [], subtotal: 200, taxAmount: 0, totalAmount: 200, guestCount: 7, paymentMethod: 'CASH', paymentStatus: 'SUCCESS', orderStatus: 'COMPLETED', source_type: 'POS' } as never);
    old.businessDayId = 'previous-business-day'; old.createdAt = '2020-01-01T10:00:00.000Z';
    expect(PosAssistantService.executeQuery('FOOTFALL').card?.highlightNumber).toBe('0');
    const dynamic = DynamicQueryExecutor.execute('Today count', { targetDomain: 'ORDERS', calculationType: 'COUNT', displayUnit: 'NUMBER' });
    expect(dynamic.card?.highlightNumber).toBe('0 Orders');
  });
  it('sales answers separate unpaid order value from collected money without treating refunds as unpaid', () => {
    for (const [orderStatus, paymentStatus] of [['CONFIRMED', 'PENDING'], ['REFUNDED', 'REFUNDED']] as const) {
      OrderRepository.createOrder({ orderType: 'TAKEAWAY', items: [], subtotal: 200, taxAmount: 0, totalAmount: 200, paymentMethod: 'CASH_AT_COUNTER', paymentStatus, orderStatus, source_type: 'KIOSK' } as never);
    }
    const answer = PosAssistantService.executeQuery('TODAY_SALES');
    expect(answer.card?.highlightLabel).toContain('Order Value');
    const metrics = answer.card?.metrics;
    expect(metrics?.find(m => m.label === 'Awaiting Collection')?.value).toBe('₹200');
    expect(metrics?.find(m => m.label === 'Net Collected')?.value).toBe('₹0');
  });
});

describe('customer suggestions use restaurant data', () => {
  beforeEach(() => {
    const example = db.menuItems[0]; db.categories = [{ ...db.categories[0], id: 'real-category-uuid', name: 'Starters' }];
    db.menuItems = [
      { ...example, id: 'veg', name: 'Vegetable snack', dietaryType: 'VEG', categoryId: 'real-category-uuid', price: 150, isAvailable: true, stockQuantity: 2 },
      { ...example, id: 'chicken', name: 'Chicken snack', dietaryType: 'NON_VEG', categoryId: 'real-category-uuid', price: 300, isAvailable: true, stockQuantity: 2 },
      { ...example, id: 'jain', name: 'Jain snack', dietaryType: 'JAIN', categoryId: 'real-category-uuid', price: 90, isAvailable: true, stockQuantity: 2 },
      { ...example, id: 'sold-out', name: 'Unavailable snack', categoryId: 'real-category-uuid', isAvailable: false }
    ];
  });
  it('uses real category names rather than demo IDs', () => { expect(CustomerChatbotEngine.processQuery('Show starters').actionItems?.map(i => i.id)).toEqual(['veg', 'chicken', 'jain']); });
  it('does not hide non-vegetarian dishes from their requested diet', () => { expect(CustomerChatbotEngine.processQuery('Show non veg').actionItems?.map(i => i.id)).toEqual(['chicken']); });
  it('applies Jain requirements before category matching', () => { expect(CustomerChatbotEngine.processQuery('Show Jain starters').actionItems?.map(i => i.id)).toEqual(['jain']); });
  it('honours an actual budget and excludes sold-out dishes', () => { expect(CustomerChatbotEngine.processQuery('Show dishes under Rs 100').actionItems?.map(i => i.id)).toEqual(['jain']); });
  it('shows only configured payment methods', () => { const text = CustomerChatbotEngine.processQuery('How can I pay?', { paymentMethods: ['Cash at counter'] }).text; expect(text).toContain('Cash at counter'); expect(text).not.toMatch(/card|UPI/); });
  it('does not promise allergy-safe preparation or unsupported token announcements', () => {
    expect(CustomerChatbotEngine.processQuery('Nut-free food').text).toContain('cross-contact');
    db.kots = []; expect(CustomerChatbotEngine.processQuery('How long to wait?').text).not.toMatch(/10-15|voice announcement/);
  });
});
