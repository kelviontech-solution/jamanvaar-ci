import { describe, it, expect, beforeEach } from 'vitest';
import { db, OrderRepository } from '@jamanvaar/database';
import { AiConfig, JamanAiRegistry, PosAssistantService, refreshAiConfigIfStale, reportAiQuery } from '@jamanvaar/business';

/**
 * BUG-056 / 057 / 058: nothing set in Super Admin reached the apps; thresholds and labels were fixed
 * text ("> 15 mins"); access came from a fake local licence; and several questions fell through to the
 * generic help answer or gave the same answer as another.
 */
const cloud = (over: Record<string, unknown> = {}) => ({
  state: 'ON',
  settings: { delayedKotMinutes: 15, lowStockThreshold: 3, cashDrawerVarianceThreshold: 500, proactiveAlertsEnabled: true },
  questions: [] as Array<{ id: string; intent: string; label: string; category: string; icon: string; priorityScore: number }>,
  teaser: [],
  limitReached: false,
  remainingToday: null,
  ...over
});

describe('AiConfig (the cloud decision, cached on the terminal)', () => {
  beforeEach(() => AiConfig.reset());

  it('shows nothing until the cloud has said what this restaurant may use', () => {
    expect(AiConfig.isKnown()).toBe(false);
    expect(AiConfig.getState()).toBe('OFF');
  });

  it('follows the cloud state: ON works, LOCKED is visible but locked, OFF is hidden', () => {
    AiConfig.apply(cloud({ state: 'ON' }));
    expect(AiConfig.getState()).toBe('ON');
    expect(AiConfig.isEnabled()).toBe(true);

    AiConfig.apply(cloud({ state: 'LOCKED', teaser: [{ label: "Today's Gross Sales", icon: 'trending-up' }] }));
    expect(AiConfig.getState()).toBe('LOCKED');
    expect(AiConfig.isEnabled()).toBe(false);
    expect(AiConfig.getTeaser()).toHaveLength(1);

    AiConfig.apply(cloud({ state: 'OFF' }));
    expect(AiConfig.getState()).toBe('OFF');
  });

  it('the owner\'s local "show the button" toggle can only hide something that is ON, never enable a locked feature', () => {
    AiConfig.apply(cloud({ state: 'LOCKED' }));
    expect(AiConfig.shouldShowButton(true)).toBe(true);   // locked still shows (with a lock)
    AiConfig.apply(cloud({ state: 'ON' }));
    expect(AiConfig.shouldShowButton(false)).toBe(false); // owner hid it
    expect(AiConfig.shouldShowButton(true)).toBe(true);
    AiConfig.apply(cloud({ state: 'OFF' }));
    expect(AiConfig.shouldShowButton(true)).toBe(false);
  });

  it('exposes the thresholds in force, with safe defaults before the cloud answers', () => {
    expect(AiConfig.getSettings().delayedKotMinutes).toBe(15);
    AiConfig.apply(cloud({ settings: { delayedKotMinutes: 25, lowStockThreshold: 8, cashDrawerVarianceThreshold: 900, proactiveAlertsEnabled: true } }));
    expect(AiConfig.getSettings()).toMatchObject({ delayedKotMinutes: 25, lowStockThreshold: 8, cashDrawerVarianceThreshold: 900 });
  });

  it('offers only the questions the cloud catalogue enables, and stops when the daily limit is reached', () => {
    AiConfig.apply(cloud({ questions: [{ id: 'q1', intent: 'TODAY_SALES', label: "Today's Gross Sales", category: 'TODAY', icon: 'x', priorityScore: 100 }] }));
    expect(AiConfig.isIntentEnabled('TODAY_SALES')).toBe(true);
    expect(AiConfig.isIntentEnabled('TOP_ITEMS')).toBe(false);
    expect(AiConfig.canQuery()).toBe(true);

    AiConfig.apply(cloud({ limitReached: true }));
    expect(AiConfig.canQuery()).toBe(false);
  });

  it('survives a reload: the last decision is remembered, so it works offline', () => {
    AiConfig.apply(cloud({ state: 'ON', settings: { delayedKotMinutes: 30, lowStockThreshold: 3, cashDrawerVarianceThreshold: 500, proactiveAlertsEnabled: true } }));
    AiConfig.reloadFromStorage();
    expect(AiConfig.getState()).toBe('ON');
    expect(AiConfig.getSettings().delayedKotMinutes).toBe(30);
  });
});

describe('the engine reads the thresholds instead of hardcoding them (BUG-056)', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
    AiConfig.reset();
    db.kots = [
      { id: 'k1', kotNumber: 'KOT-1', orderId: 'o1', orderNumber: 'O1', tokenNumber: 'T1', orderType: 'DINE_IN', station: 'Main Kitchen', type: 'NEW', items: [], cashierName: 'c', createdAt: new Date(Date.now() - 20 * 60_000).toISOString(), printed: true, status: 'PREPARING' } as never
    ];
  });

  it('counts a ticket as delayed against the configured minutes, and says so in the answer', () => {
    const at15 = PosAssistantService.executeQuery('DELAYED_KOT');
    expect(at15.card?.highlightNumber).toBe('1');
    expect(at15.card?.highlightLabel).toContain('> 15 mins');

    AiConfig.apply(cloud({ settings: { delayedKotMinutes: 25, lowStockThreshold: 3, cashDrawerVarianceThreshold: 500, proactiveAlertsEnabled: true } }));
    const at25 = PosAssistantService.executeQuery('DELAYED_KOT');
    expect(at25.card?.highlightNumber).toBe('0');
    expect(at25.card?.highlightLabel).toContain('> 25 mins');
    expect(at25.summaryText + JSON.stringify(at25.card)).not.toMatch(/\b15\b/);
  });

  it('the suggested-question label follows the setting too', () => {
    AiConfig.apply(cloud({
      settings: { delayedKotMinutes: 40, lowStockThreshold: 3, cashDrawerVarianceThreshold: 500, proactiveAlertsEnabled: true },
      questions: [{ id: 'q_kitchen_delayed', intent: 'DELAYED_KOT', label: 'Delayed KOTs (> 40 mins)', category: 'KITCHEN', icon: 'flame', priorityScore: 100 }]
    }));
    const q = JamanAiRegistry.getPrioritizedQuestions('POS').find((x) => x.intent === 'DELAYED_KOT')!;
    expect(q.label).toBe('Delayed KOTs (> 40 mins)');
  });

  it('hides suggestions the cloud catalogue has switched off, but leaves everything alone before the cloud has answered', () => {
    const before = JamanAiRegistry.getPrioritizedQuestions('POS').length;
    expect(before).toBeGreaterThan(10);

    AiConfig.apply(cloud({ questions: [{ id: 'q1', intent: 'TODAY_SALES', label: 'x', category: 'TODAY', icon: 'x', priorityScore: 1 }] }));
    const intents = JamanAiRegistry.getPrioritizedQuestions('POS').map((q) => q.intent);
    expect(intents).toEqual(['TODAY_SALES']);
  });
});

describe('every offered question has its own real answer (BUG-058)', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
    AiConfig.reset();
    const item = db.menuItems[0];
    const mk = (method: 'CASH' | 'UPI', type: 'DINE_IN' | 'TAKEAWAY', guests: number) =>
      OrderRepository.createOrder({
        orderType: type, tableNumber: type === 'DINE_IN' ? '1' : undefined, guestCount: guests,
        items: [{ id: `oi-${Math.random()}`, orderId: '', menuItemId: item.id, name: item.name, sku: item.sku, quantity: 1, unitPrice: 200, modifiers: [], totalPrice: 200, kitchenStatus: 'SERVED' }],
        subtotal: 200, taxAmount: 0, totalAmount: 200, paymentMethod: method, paymentStatus: 'SUCCESS', orderStatus: 'COMPLETED', source_type: 'POS'
      } as never);
    mk('CASH', 'DINE_IN', 4);
    mk('UPI', 'TAKEAWAY', 1);
    mk('UPI', 'DINE_IN', 2);
  });

  const INTENTS = ['PAYMENT_SHARE', 'ACTIVE_ORDERS', 'COMPLETED_ORDERS', 'FOOTFALL', 'CASH_VARIANCE', 'KITCHEN_PERFORMANCE', 'BEST_CATEGORY'];

  it.each(INTENTS)('%s answers with data, not the generic help card', (intent) => {
    const res = PosAssistantService.executeQuery(intent);
    expect(res.intent).toBe(intent);
    expect(res.card?.title).not.toMatch(/Smart Assistant/);
    expect(res.card?.metrics.length).toBeGreaterThan(0);
  });

  it('cash-vs-digital share is computed from the tenders, not copied from the cash answer', () => {
    const share = PosAssistantService.executeQuery('PAYMENT_SHARE');
    const cash = PosAssistantService.executeQuery('CASH_COLLECTION');
    expect(share.card?.title).not.toBe(cash.card?.title);
    // 1 of 3 equal orders was cash: about 33% cash, 67% digital.
    expect(JSON.stringify(share.card)).toMatch(/33/);
    expect(JSON.stringify(share.card)).toMatch(/67/);
  });

  it('footfall counts the guests actually seated, not the order count', () => {
    const res = PosAssistantService.executeQuery('FOOTFALL');
    expect(res.card?.highlightNumber).toBe('7'); // 4 + 1 + 2
    expect(PosAssistantService.executeQuery('TODAY_ORDERS').card?.highlightNumber).not.toBe('7');
  });

  it('no delivery-partner questions are offered, since nothing records those channels', () => {
    const labels = JamanAiRegistry.getPrioritizedQuestions('POS').map((q) => q.label).join(' | ');
    expect(labels).not.toMatch(/swiggy|zomato/i);
  });

  it('no two offered questions share an intent', () => {
    const intents = JamanAiRegistry.getPrioritizedQuestions('POS').map((q) => q.intent);
    expect(new Set(intents).size).toBe(intents.length);
  });
});

describe('refreshing and reporting (BUG-056)', () => {
  beforeEach(() => AiConfig.reset());

  const withFetch = async (handler: (url: string, init?: RequestInit) => Response, run: () => Promise<void>) => {
    const real = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init)) as typeof fetch;
    try {
      await run();
    } finally {
      globalThis.fetch = real;
    }
  };
  const answer = (over: object = {}) => new Response(JSON.stringify({ state: 'ON', settings: { delayedKotMinutes: 21, lowStockThreshold: 3, cashDrawerVarianceThreshold: 500, proactiveAlertsEnabled: true }, questions: [], teaser: [], limitReached: false, remainingToday: 5, ...over }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  it('fetches the config with the device credential, and does not ask again until it is stale', async () => {
    let calls = 0;
    await withFetch((url, init) => {
      calls++;
      expect(url).toBe('http://api/api/v1/devices/me/ai-config');
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
      return answer();
    }, async () => {
      expect(await refreshAiConfigIfStale({ apiBase: 'http://api', deviceToken: 'tok' })).toBe(true);
      expect(AiConfig.getSettings().delayedKotMinutes).toBe(21);
      await refreshAiConfigIfStale({ apiBase: 'http://api', deviceToken: 'tok' });
      expect(calls).toBe(1);
      await refreshAiConfigIfStale({ apiBase: 'http://api', deviceToken: 'tok' }, 0);
      expect(calls).toBe(2);
    });
  });

  it('keeps the last known decision when the cloud cannot be reached', async () => {
    AiConfig.apply({ state: 'ON', settings: { delayedKotMinutes: 30, lowStockThreshold: 3, cashDrawerVarianceThreshold: 500, proactiveAlertsEnabled: true }, questions: [], teaser: [], limitReached: false, remainingToday: null });
    await withFetch(() => { throw new Error('offline'); }, async () => {
      expect(await refreshAiConfigIfStale({ apiBase: 'http://api', deviceToken: 'tok' }, 0)).toBe(false);
    });
    expect(AiConfig.getState()).toBe('ON');
    expect(AiConfig.getSettings().delayedKotMinutes).toBe(30);
  });

  it('reports each answered question with its latency, and stops the terminal when the cloud says the limit is reached', async () => {
    AiConfig.apply({ state: 'ON', settings: { delayedKotMinutes: 15, lowStockThreshold: 3, cashDrawerVarianceThreshold: 500, proactiveAlertsEnabled: true }, questions: [], teaser: [], limitReached: false, remainingToday: 1 });
    let body: { intent?: string; latencyMs?: number } = {};
    await withFetch((_url, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ success: true, limitReached: true, remainingToday: 0 }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    }, async () => {
      await reportAiQuery({ apiBase: 'http://api', deviceToken: 'tok', intent: 'TODAY_SALES', latencyMs: 12.4 });
    });
    expect(body).toEqual({ intent: 'TODAY_SALES', latencyMs: 12 });
    expect(AiConfig.canQuery()).toBe(false);
  });
});
